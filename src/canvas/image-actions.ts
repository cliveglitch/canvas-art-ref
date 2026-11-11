import { Notice, type App, type Command } from 'obsidian';
import type { Board, CanvasAdapter } from './adapter';
import type { AdditionOrder } from './addition-order';
import { selectedImages, type NodeData } from './data';
import { ImageSizes } from './image-sizes';
import { planLayout, type LayoutOperation } from '../layout/plan';
import type { SortMemory } from '../layout/ordering';
import type { SizeSource } from '../layout/sizing';
import type { PluginData } from '../plugin-data';
import { ScaleModal } from '../ui/dialogs';

/** One image action, or Optimize group, as offered by a command and a menu item. */
export interface ImageActionEntry {
  /** Command id. */
  id: string;
  /** Command name. */
  name: string;
  /** Menu title. */
  title: string;
  target: 'images' | 'groups';
  /** Scale selection asks for its percentage first. */
  operation: LayoutOperation | 'ask-percent';
}
export interface ImageActionSection { id: 'arrange' | 'align' | 'normalize'; title: string; icon: string; entries: ImageActionEntry[] }

const images = (title: string, id: string, name: string, operation: ImageActionEntry['operation']): ImageActionEntry => ({ title, id, name, target: 'images', operation });
export const sections: ImageActionSection[] = [
  { id: 'arrange', title: 'Arrange images', icon: 'layout-grid', entries: [
    images('Optimal', 'pack-images', 'Pack selected images', { kind: 'pack' }),
    images('By name', 'arrange-images-by-name', 'Arrange selected images by name', { kind: 'arrange', mode: 'name' }),
    images('By path', 'arrange-images-by-path', 'Arrange selected images by path', { kind: 'arrange', mode: 'path' }),
    images('By order', 'arrange-images-by-order', 'Arrange selected images by selection order', { kind: 'arrange', mode: 'order' }),
    images('By addition', 'arrange-images-by-addition', 'Arrange selected images by addition', { kind: 'arrange', mode: 'addition' }),
    images('Randomly', 'arrange-images-randomly', 'Arrange selected images randomly', { kind: 'arrange', mode: 'random' }),
  ] },
  { id: 'align', title: 'Align images', icon: 'align-start-horizontal', entries: [
    images('Left', 'align-images-left', 'Align selected images left', { kind: 'align', mode: 'left' }),
    images('Right', 'align-images-right', 'Align selected images right', { kind: 'align', mode: 'right' }),
    images('Top', 'align-images-top', 'Align selected images top', { kind: 'align', mode: 'top' }),
    images('Bottom', 'align-images-bottom', 'Align selected images bottom', { kind: 'align', mode: 'bottom' }),
    images('Stack', 'stack-images', 'Stack selected images', { kind: 'align', mode: 'stack' }),
    images('Distribute horizontal', 'distribute-images-horizontal', 'Distribute selected images horizontally', { kind: 'align', mode: 'horizontal' }),
    images('Distribute vertical', 'distribute-images-vertical', 'Distribute selected images vertically', { kind: 'align', mode: 'vertical' }),
  ] },
  { id: 'normalize', title: 'Normalize images', icon: 'scaling', entries: [
    images('Height', 'match-image-height', 'Match selected image heights', { kind: 'normalize', mode: 'height' }),
    images('Width', 'match-image-width', 'Match selected image widths', { kind: 'normalize', mode: 'width' }),
    images('Size', 'match-image-size', 'Match selected image longest sides', { kind: 'normalize', mode: 'size' }),
    images('Area', 'match-image-area', 'Match selected image areas', { kind: 'normalize', mode: 'area' }),
    images('Scale', 'normalize-image-scale', 'Normalize selected image scales', { kind: 'normalize', mode: 'scale' }),
    images('Scale selection…', 'scale-images', 'Scale selected images', 'ask-percent'),
  ] },
];
export const optimizeGroups: ImageActionEntry = { title: 'Optimize group', id: 'optimize-groups', name: 'Optimize selected groups', target: 'groups', operation: { kind: 'optimize-groups' } };

/** Every image action and Optimize group: what each applies to, when it is available, and running it as one native undo step. */
export class ImageActions {
  readonly entries: readonly ImageActionEntry[] = [...sections.flatMap(section => section.entries), optimizeGroups];
  private enabled = true;
  // Reverse on repeat remembers the last applied sort for each open canvas file.
  private memories = new WeakMap<Board, { path: string; memory?: SortMemory }>();
  constructor(private app: App, private data: PluginData, private additions: AdditionOrder, private canvas: CanvasAdapter, private sizes = new ImageSizes(app)) {}
  stop(): void { this.enabled = false; }

  get source(): SizeSource { return this.data.sizeSource; }
  async setSource(source: SizeSource): Promise<void> {
    if (!this.enabled) return;
    try { await this.data.setSizeSource(source); } catch (error) { report(error, 'Could not save the size source.'); }
  }

  /** Selected images, or selected groups. A right-clicked card outside the selection replaces it. */
  targets(board: Board, target: ImageActionEntry['target'], clicked?: string): NodeData[] {
    const selected = board.selectedIds();
    const ids = clicked && !selected.has(clicked) ? new Set([clicked]) : selected;
    const nodes = board.data().nodes;
    return target === 'groups' ? nodes.filter(node => node.type === 'group' && ids.has(node.id)) : selectedImages(nodes, ids);
  }

  available(board: Board | undefined, target: ImageActionEntry['target'], clicked?: string): board is Board {
    return !!board && !board.readonly && this.targets(board, target, clicked).length > 0;
  }

  /** Run an entry on cards captured earlier, such as when a menu opened, or on the current targets. Failures show a notice. */
  async run(board: Board, entry: ImageActionEntry, selection = this.targets(board, entry.target)): Promise<void> {
    if (!this.enabled) return;
    if (entry.operation === 'ask-percent') {
      new ScaleModal(this.app, percent => void this.perform(board, entry, { kind: 'scale', percent }, selection)).open();
      return;
    }
    await this.perform(board, entry, entry.operation, selection);
  }

  /** One command per entry, available while the active canvas has something to act on. */
  commands(): Command[] {
    return this.entries.map(entry => ({
      id: entry.id, name: entry.name,
      checkCallback: checking => {
        const board = this.canvas.active();
        const available = this.available(board, entry.target);
        if (available && !checking) void this.run(board, entry);
        return available;
      },
    }));
  }

  private async perform(board: Board, entry: ImageActionEntry, operation: LayoutOperation, selection: NodeData[]): Promise<void> {
    if (!this.enabled) return;
    try {
      if (board.readonly) throw new Error('This canvas is read-only.');
      const path = board.path;
      const sizes = operation.kind === 'scale' || operation.kind === 'optimize-groups' ? undefined : await this.sizes.measure(selection.map(node => node.file!));
      if (!this.enabled) return;
      if (board.path !== path) throw new Error('The active canvas changed. Try again.');
      const remembered = this.memories.get(board);
      const plan = planLayout({
        data: board.data(), selection, operation, sizes,
        gap: this.data.gap, source: this.source,
        aspect: board.aspect(),
        additions: operation.kind === 'arrange' ? this.additions.of(board, selection) : [],
        memory: remembered?.path === path ? remembered.memory : undefined,
      });
      board.apply(plan.changes);
      this.memories.set(board, { path, memory: plan.memory });
    } catch (error) { report(error, entry.target === 'groups' ? 'Could not optimize the selected groups.' : 'Could not arrange the selected images.'); }
  }
}

function report(error: unknown, fallback: string): void {
  new Notice(error instanceof Error ? error.message : fallback);
}
