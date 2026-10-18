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
    const dimensions = new Map<string, { width: number; height: number }>();
    const paths = [...new Set(selected.map(node => node.file!))];
    for (let start = 0; start < paths.length; start += 8) {
      await Promise.all(paths.slice(start, start + 8).map(async path => {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) throw new Error('An image is missing: ' + path);
        const image = new Image();
        image.src = this.app.vault.getResourcePath(file);
        await image.decode();
        if (!image.naturalWidth || !image.naturalHeight) throw new Error('Could not read image dimensions: ' + path);
        dimensions.set(path, { width: image.naturalWidth, height: image.naturalHeight });
      }));
    }
    return selected.map(node => {
      const source = dimensions.get(node.file!)!;
      return fitted(node, source.width / source.height, source);
    });
  }

  private report(error: unknown): void {
    new Notice(error instanceof Error ? error.message : 'Could not arrange the selected images.');
  }
}
