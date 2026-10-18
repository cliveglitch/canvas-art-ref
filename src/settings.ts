import type { SizeSource } from './layout/sizing';

export interface Folders { images: string; notes: string }
export interface Settings extends Folders {
  gap: number;
  normalizeSource: SizeSource;
  imageOrder: Record<string, string[]>;
  canvases: Record<string, Partial<Folders>>;
}
export const defaults = (): Settings => ({ images: '', notes: '', gap: 24, normalizeSource: 'average', imageOrder: {}, canvases: {} });

/** Empty means inherit; '/' explicitly selects the vault root. */
export function folderSetting(input: string): string {
  const value = input.trim().replace(/\\/g, '/');
  if (!value || value === '/') return value;
  if (value.startsWith('/') || value.includes(':') || [...value].some(char => char.charCodeAt(0) < 32) || value.split('/').some(part => !part || part === '.' || part === '..' || part.startsWith('.'))) {
    throw new Error('Choose a visible folder inside this vault.');
  }
  return value.replace(/\/$/, '');
}

export function foldersFor(settings: Settings, path: string): Folders {
  const board = settings.canvases[path];
  return { images: board?.images || settings.images, notes: board?.notes || settings.notes };
}

export function loadSettings(raw: unknown): Settings {
  const result = defaults();
  if (!raw || typeof raw !== 'object') return result;
  const value = raw as Record<string, unknown>;
  if (value.normalizeSource === 'first' || value.normalizeSource === 'average') result.normalizeSource = value.normalizeSource;
  if (value.imageOrder && typeof value.imageOrder === 'object') {
    for (const [path, ids] of Object.entries(value.imageOrder)) {
      if (path.endsWith('.canvas') && Array.isArray(ids)) result.imageOrder[path] = [...new Set(ids.filter((id): id is string => typeof id === 'string'))];
    }
  }
  for (const key of ['images', 'notes'] as const) {
    if (typeof value[key] === 'string') {
      try { result[key] = folderSetting(value[key]); } catch { /* Ignore invalid saved paths. */ }
    }
  }
  if (typeof value.gap === 'number' && Number.isFinite(value.gap)) result.gap = Math.max(0, Math.min(200, value.gap));
  if (value.canvases && typeof value.canvases === 'object') {
    for (const [path, entry] of Object.entries(value.canvases)) {
      if (!path.endsWith('.canvas') || !entry || typeof entry !== 'object') continue;
      const folders = entry as Record<string, unknown>;
      const valid: Partial<Folders> = {};
      for (const key of ['images', 'notes'] as const) {
        if (typeof folders[key] === 'string') {
          try { valid[key] = folderSetting(folders[key]); } catch { /* Ignore invalid saved paths. */ }
        }
      }
      result.canvases[path] = valid;
    }
  }
  return result;
}

export function renameCanvasSettings(settings: Settings, oldPath: string, newPath: string): boolean {
  const rename = <T>(map: Record<string, T>): number => {
    const paths = Object.keys(map).filter(path => path === oldPath || path.startsWith(oldPath + '/'));
    for (const path of paths) { map[newPath + path.slice(oldPath.length)] = map[path]!; delete map[path]; }
    return paths.length;
  };
  const folders = rename(settings.canvases), orders = rename(settings.imageOrder);
  return folders + orders > 0;
}
