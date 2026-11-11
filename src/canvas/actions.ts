import { Notice, TFile, type App } from 'obsidian';
import type { NativeCanvas, NodeData } from './types';
import { commitLayout, imageSelection } from './bridge';
import { orderedPack, pack } from '../layout/packing';
import { fitted, matchSizes, scaleSelection, type ImageRect, type SizeSource } from '../layout/sizing';
import { alignImages } from '../layout/alignment';
import type { Settings } from '../settings';
import { isAlignAction, isOrderAction, type ImageAction } from './action-catalog';
import type { ImageOrdering } from './ordering';

export class ImageActions {
  private enabled = true;
  // Natural image sizes, reused until the file changes so repeated actions on large selections skip reloading.
  private sizes = new Map<string, { stamp: string; width: number; height: number }>();
  constructor(private app: App, private settings: () => Settings, private ordering: ImageOrdering, private save: () => Promise<void>) {}
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
      const path = canvas.view.file?.path;
      const source = this.source;
      const images = await this.dimensions(selected);
      if (!this.enabled) return;
      if (canvas.view.file?.path !== path) throw new Error('The active canvas changed. Try again.');
      const ids = new Set(selected.map(node => node.id));
      const obstacles = canvas.getData().nodes.filter(node => node.type !== 'group' && !ids.has(node.id));
      const gap = this.settings().gap;
      const order = isOrderAction(action) ? this.ordering.prepare(canvas, images, action) : undefined;
      const rectangles = action === 'pack'
        ? pack(images, gap, obstacles, canvas.wrapperEl.clientWidth / Math.max(1, canvas.wrapperEl.clientHeight))
        : order ? orderedPack(order.images, gap, obstacles)
        : isAlignAction(action) ? alignImages(images, action, gap)
        : matchSizes(images, action as 'height' | 'width' | 'size' | 'area' | 'scale', source);
      commitLayout(canvas, selected, rectangles);
      order?.accept();
    } catch (error) { this.report(error); }
  }

  scale(canvas: NativeCanvas, percent: number, selected = imageSelection(canvas)): void {
    if (!this.enabled) return;
    try {
      if (!selected.length) throw new Error('Select images or a group containing images.');
      commitLayout(canvas, selected, scaleSelection(selected, percent / 100));
    } catch (error) { this.report(error); }
  }

  private async dimensions(selected: NodeData[]): Promise<ImageRect[]> {
    const files = [...new Set(selected.map(node => node.file!))].map(path => {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) throw new Error('An image is missing: ' + path);
      return file;
    });
    const stamp = (file: TFile): string => file.stat.mtime + ':' + file.stat.size;
    const pending = files.filter(file => this.sizes.get(file.path)?.stamp !== stamp(file));
    const progress = pending.length > 50 ? new Notice(`Reading image sizes… 0/${pending.length}`, 0) : undefined;
    let next = 0, done = 0;
    try {
      // Keep a fixed number of loads in flight, starting the next as soon as one finishes.
      await Promise.all(Array.from({ length: Math.min(16, pending.length) }, async () => {
        while (next < pending.length) {
          const file = pending[next++]!;
          try { this.sizes.set(file.path, { stamp: stamp(file), ...await this.naturalSize(file) }); }
          catch (error) { next = pending.length; throw error; }
          progress?.setMessage(`Reading image sizes… ${++done}/${pending.length}`);
        }
      }));
    } finally { progress?.hide(); }
    return selected.map(node => {
      const source = this.sizes.get(node.file!)!;
      return fitted(node, source.width / source.height, source);
    });
  }

  private async naturalSize(file: TFile): Promise<{ width: number; height: number }> {
    // Wait for load, not decode(): the size is known once the image loads, and Chromium can reject
    // full decodes of large images under memory pressure even when the file is valid.
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Could not load image: ' + file.path));
      image.src = this.app.vault.getResourcePath(file);
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('Could not read image dimensions: ' + file.path);
    return { width: image.naturalWidth, height: image.naturalHeight };
  }

  private report(error: unknown): void {
    new Notice(error instanceof Error ? error.message : 'Could not arrange the selected images.');
  }
}
