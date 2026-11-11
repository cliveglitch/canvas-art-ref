import { Notice, TFile, type App } from 'obsidian';
import type { Size } from '../layout/plan';

/** Reads natural image sizes from the vault, reusing each until its file changes. */
export class ImageSizes {
  private cache = new Map<string, { stamp: string; size: Size }>();
  constructor(private app: App, private load: (file: TFile) => Promise<Size> = file => naturalSize(app, file)) {}

  /** The natural size of each image file path. Throws when a file is missing or unreadable. */
  async measure(paths: string[]): Promise<Map<string, Size>> {
    const files = [...new Set(paths)].map(path => {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) throw new Error('An image is missing: ' + path);
      return file;
    });
    const stamp = (file: TFile): string => file.stat.mtime + ':' + file.stat.size;
    const pending = files.filter(file => this.cache.get(file.path)?.stamp !== stamp(file));
    const progress = pending.length > 50 ? new Notice(`Reading image sizes… 0/${pending.length}`, 0) : undefined;
    let next = 0, done = 0;
    try {
      // Keep a fixed number of loads in flight, starting the next as soon as one finishes.
      await Promise.all(Array.from({ length: Math.min(16, pending.length) }, async () => {
        while (next < pending.length) {
          const file = pending[next++]!;
          try { this.cache.set(file.path, { stamp: stamp(file), size: await this.load(file) }); }
          catch (error) { next = pending.length; throw error; }
          progress?.setMessage(`Reading image sizes… ${++done}/${pending.length}`);
        }
      }));
    } finally { progress?.hide(); }
    return new Map(files.map(file => [file.path, this.cache.get(file.path)!.size]));
  }
}

async function naturalSize(app: App, file: TFile): Promise<Size> {
  // Wait for load, not decode(): the size is known once the image loads, and Chromium can reject
  // full decodes of large images under memory pressure even when the file is valid.
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Could not load image: ' + file.path));
    image.src = app.vault.getResourcePath(file);
  });
  if (!image.naturalWidth || !image.naturalHeight) throw new Error('Could not read image dimensions: ' + file.path);
  return { width: image.naturalWidth, height: image.naturalHeight };
}
