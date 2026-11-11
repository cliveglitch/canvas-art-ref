import { Notice, TFolder, type App, type TFile } from 'obsidian';
import type { Board, CanvasAdapter, ImportItem, NativeImport } from '../canvas/adapter';
import { isImagePath } from '../canvas/data';
import type { PluginData } from '../plugin-data';
import { ensureFolder } from './folders';

const isImageItem = (item: ImportItem): boolean => !item.isDirectory && isImagePath('image.' + item.extension);

/** Send new images and notes from a canvas to its folders; leave native selection, file reuse and node creation intact. */
export class StorageRouting {
  constructor(private app: App, private data: PluginData, canvas: CanvasAdapter) {
    canvas.routeImports((board, items, folder, native) => this.importFor(board, items, folder, native));
    canvas.routeNewNotes(canvasPath => this.notesFolder(canvasPath));
  }

  private importFor(board: Board, items: ImportItem[], folder: TFolder | null, native: NativeImport): Promise<TFile[]> | undefined {
    const setting = board.path ? this.data.folders(board.path).images : '';
    if (board.readonly || folder || !setting || !items.some(isImageItem)) return undefined;
    // Capture the destination before awaiting so changing tabs cannot redirect the import.
    return this.importTo(native, items, setting).catch((error: unknown) => {
      new Notice(error instanceof Error ? error.message : 'Could not import images into the configured folder.');
      return [];
    });
  }

  private async importTo(native: NativeImport, items: ImportItem[], setting: string): Promise<TFile[]> {
    const folder = await ensureFolder(this.app, setting);
    const files: TFile[] = [];
    for (const item of items) files.push(...await native([item], isImageItem(item) ? folder : null));
    return files;
  }

  /** The canvas's notes folder when it exists; Obsidian creates notes synchronously, so a missing folder keeps its choice. */
  private notesFolder(canvasPath: string): TFolder | undefined {
    const setting = this.data.folders(canvasPath).notes;
    const folder = setting === '/' ? this.app.vault.getRoot() : this.app.vault.getAbstractFileByPath(setting);
    return setting && folder instanceof TFolder ? folder : undefined;
  }
}
