import { Notice, type App } from 'obsidian';
import type { NativeCanvas } from './types';
import type { NodeData } from './data';
import { applyLayout, imageSelection } from './bridge';
import { ImageSizes } from './image-sizes';
import { planLayout, type LayoutOperation } from '../layout/plan';
import type { SortMemory } from '../layout/ordering';
import type { SizeSource } from '../layout/sizing';
import type { Settings } from '../settings';
import { isAlignAction, isOrderAction, type ImageAction } from './action-catalog';
import type { ImageOrdering } from './ordering';

export class ImageActions {
  private enabled = true;
  private sizes: ImageSizes;
  // Reverse on repeat remembers the last applied sort for each open canvas file.
  private memories = new WeakMap<NativeCanvas, { path: string; memory?: SortMemory }>();
  constructor(private app: App, private settings: () => Settings, private ordering: ImageOrdering, private save: () => Promise<void>) {
    this.sizes = new ImageSizes(app);
  }
  stop(): void { this.enabled = false; }
  get source(): SizeSource { return this.settings().normalizeSource; }
  async setSource(source: SizeSource): Promise<void> {
    if (!this.enabled) return;
    this.settings().normalizeSource = source;
    try { await this.save(); } catch (error) { this.report(error); }
  }

  async run(canvas: NativeCanvas, action: ImageAction, selected = imageSelection(canvas)): Promise<void> {
    if (!this.enabled) return;
    try {
      if (canvas.readonly) throw new Error('This canvas is read-only.');
      if (!selected.length) throw new Error('Select images or a group containing images.');
      const path = canvas.view.file?.path ?? '';
      const sizes = await this.sizes.measure(selected.map(node => node.file!));
      if (!this.enabled) return;
      if ((canvas.view.file?.path ?? '') !== path) throw new Error('The active canvas changed. Try again.');
      const operation: LayoutOperation = action === 'pack' ? { kind: 'pack' }
        : isOrderAction(action) ? { kind: 'arrange', mode: action }
        : isAlignAction(action) ? { kind: 'align', mode: action }
        : { kind: 'normalize', mode: action };
      const remembered = this.memories.get(canvas);
      const plan = planLayout({
        data: canvas.getData(), selection: selected, operation, sizes,
        gap: this.settings().gap, source: this.source,
        aspect: canvas.wrapperEl.clientWidth / Math.max(1, canvas.wrapperEl.clientHeight),
        additions: operation.kind === 'arrange' ? this.ordering.additions(canvas, selected) : [],
        memory: remembered?.path === path ? remembered.memory : undefined,
      });
      applyLayout(canvas, plan.changes);
      this.memories.set(canvas, { path, memory: plan.memory });
    } catch (error) { this.report(error); }
  }

  scale(canvas: NativeCanvas, percent: number, selected: NodeData[] = imageSelection(canvas)): void {
    if (!this.enabled) return;
    try {
      applyLayout(canvas, planLayout({ data: canvas.getData(), selection: selected, operation: { kind: 'scale', percent } }).changes);
    } catch (error) { this.report(error); }
  }

  private report(error: unknown): void {
    new Notice(error instanceof Error ? error.message : 'Could not arrange the selected images.');
  }
}
