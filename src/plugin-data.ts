import { Component, Notice, debounce, type Vault } from 'obsidian';
import type { SizeSource } from './layout/sizing';

export interface Folders { images: string; notes: string }
/** Where data.json is read from and written to: the plugin's loadData/saveData, or memory in tests. */
export interface DataStorage { load(): Promise<unknown>; save(data: unknown): Promise<void> }

// The data.json shape. Per-canvas entries are keyed by canvas path.
interface State extends Folders {
  gap: number;
  normalizeSource: SizeSource;
  imageOrder: Record<string, string[]>;
  canvases: Record<string, Partial<Folders>>;
}
const initial = (): State => ({ images: '', notes: '', gap: 24, normalizeSource: 'average', imageOrder: {}, canvases: {} });
const gapLimits = { min: 0, max: 200 } as const;

/** Empty means inherit; '/' explicitly selects the vault root. Throws for paths outside the vault or in hidden folders. */
export function folderSetting(input: string): string {
  const value = input.trim().replace(/\\/g, '/');
  if (!value || value === '/') return value;
  if (value.startsWith('/') || value.includes(':') || [...value].some(char => char.charCodeAt(0) < 32) || value.split('/').some(part => !part || part === '.' || part === '..' || part.startsWith('.'))) {
    throw new Error('Choose a visible folder inside this vault.');
  }
  return value.replace(/\/$/, '');
}

/** Image spacing in canvas pixels. Throws outside the allowed range. */
export function gapSetting(value: number): number {
  if (!Number.isFinite(value) || value < gapLimits.min || value > gapLimits.max) throw new Error(`Enter spacing from ${gapLimits.min} to ${gapLimits.max}.`);
  return value;
}

/**
 * Everything the plugin remembers outside .canvas files. Loading is lenient and ignores invalid values;
 * changes are validated strictly. Saves are ordered, addition order is saved after a short pause,
 * and entries follow canvas and folder renames. A deleted canvas keeps its entries, so restoring it brings them back.
 */
export class PluginData extends Component {
  private state = initial();
  private seen = new Map<string, Set<string>>();
  private saves = Promise.resolve();
  private persist = debounce(() => {
    void this.save().catch(() => new Notice('Could not save image addition order.'));
  }, 300, true);

  constructor(private storage: DataStorage, private vault: Pick<Vault, 'on'>) { super(); }

  onload(): void {
    this.registerEvent(this.vault.on('rename', (file, oldPath) => { if (this.move(oldPath, file.path)) void this.save(); }));
    this.register(() => this.persist.run());
  }

  async read(): Promise<void> {
    const raw = await this.storage.load();
    const result = initial();
    if (raw && typeof raw === 'object') {
      const value = raw as Record<string, unknown>;
      if (value.normalizeSource === 'first' || value.normalizeSource === 'average') result.normalizeSource = value.normalizeSource;
      if (value.imageOrder && typeof value.imageOrder === 'object') {
        for (const [path, ids] of Object.entries(value.imageOrder)) {
          if (path.endsWith('.canvas') && Array.isArray(ids)) result.imageOrder[path] = [...new Set(ids.filter((id): id is string => typeof id === 'string'))];
        }
      }
      Object.assign(result, validFolders(value));
      if (typeof value.gap === 'number' && Number.isFinite(value.gap)) result.gap = Math.max(gapLimits.min, Math.min(gapLimits.max, value.gap));
      if (value.canvases && typeof value.canvases === 'object') {
        for (const [path, entry] of Object.entries(value.canvases)) {
          if (path.endsWith('.canvas') && entry && typeof entry === 'object') result.canvases[path] = validFolders(entry as Record<string, unknown>);
        }
      }
    }
    this.state = result;
    this.seen.clear();
  }

  get defaults(): Folders { return { images: this.state.images, notes: this.state.notes }; }
  get gap(): number { return this.state.gap; }
  get sizeSource(): SizeSource { return this.state.normalizeSource; }
  /** The folders new files for a canvas use: its canvas folders, each inheriting the default when blank. */
  folders(canvasPath: string): Folders {
    const board = this.state.canvases[canvasPath];
    return { images: board?.images || this.state.images, notes: board?.notes || this.state.notes };
  }
  /** Only the canvas's own overrides. */
  canvasFolders(canvasPath: string): Partial<Folders> { return { ...this.state.canvases[canvasPath] }; }
  additions(canvasPath: string): readonly string[] { return this.state.imageOrder[canvasPath] ?? []; }

  setDefaults(folders: Folders, gap: number): Promise<void> {
    const valid = { images: folderSetting(folders.images), notes: folderSetting(folders.notes), gap: gapSetting(gap) };
    Object.assign(this.state, valid);
    return this.save();
  }
  /** Blank folders inherit the defaults; a canvas with neither override is removed. */
  setCanvasFolders(canvasPath: string, folders: Partial<Folders>): Promise<void> {
    const valid = { images: folderSetting(folders.images ?? ''), notes: folderSetting(folders.notes ?? '') };
    if (valid.images || valid.notes) this.state.canvases[canvasPath] = valid;
    else delete this.state.canvases[canvasPath];
    return this.save();
  }
  setSizeSource(source: SizeSource): Promise<void> {
    this.state.normalizeSource = source;
    return this.save();
  }
  /** Append card ids not yet in the canvas's addition order, saving shortly afterwards. */
  recordAdditions(canvasPath: string, ids: string[]): void {
    const list = this.state.imageOrder[canvasPath] ??= [];
    let seen = this.seen.get(canvasPath);
    if (!seen) this.seen.set(canvasPath, seen = new Set(list));
    let changed = false;
    for (const id of ids) if (!seen.has(id)) { list.push(id); seen.add(id); changed = true; }
    if (changed) this.persist();
  }
  /** Drop everything remembered for a canvas, or for every canvas in a folder. */
  forget(path: string): Promise<void> {
    for (const map of [this.state.imageOrder, this.state.canvases]) for (const key of Object.keys(map)) if (key === path || key.startsWith(path + '/')) delete map[key];
    this.seen.clear();
    return this.save();
  }
  /** Wait for every change so far to be saved. */
  flush(): Promise<void> {
    this.persist.run();
    return this.saves;
  }

  private move(oldPath: string, newPath: string): boolean {
    let moved = 0;
    for (const map of [this.state.imageOrder, this.state.canvases] as Record<string, unknown>[]) {
      for (const path of Object.keys(map).filter(path => path === oldPath || path.startsWith(oldPath + '/'))) {
        map[newPath + path.slice(oldPath.length)] = map[path]; delete map[path]; moved++;
      }
    }
    if (moved) this.seen.clear();
    return moved > 0;
  }

  private save(): Promise<void> {
    // A full save includes any pending addition order.
    this.persist.cancel();
    const snapshot = structuredClone(this.state);
    this.saves = this.saves.catch(() => {}).then(() => this.storage.save(snapshot));
    return this.saves;
  }
}

function validFolders(value: Record<string, unknown>): Partial<Folders> {
  const valid: Partial<Folders> = {};
  for (const key of ['images', 'notes'] as const) {
    if (typeof value[key] === 'string') {
      try { valid[key] = folderSetting(value[key]); } catch { /* Ignore invalid saved paths. */ }
    }
  }
  return valid;
}
