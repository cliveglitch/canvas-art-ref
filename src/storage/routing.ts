import { Component, Notice, TFolder, type App, type TFile } from 'obsidian';
import type { Attachment, ImportApp, NativeCanvas } from '../canvas/types';
import { activeCanvas } from '../canvas/bridge';
import { isImagePath } from '../canvas/data';
import type { PluginData } from '../plugin-data';
import { ensureFolder } from './folders';

/** Route native imports; leave native selection, file reuse and node creation intact. */
export class StorageRouting extends Component {
  private enabled = true;
  private scope?: { canvas: NativeCanvas };
  private windows = new WeakSet<Window>();
  constructor(private app: App, private data: PluginData) { super(); }

  onload(): void {
    this.register(() => { this.enabled = false; this.scope = undefined; });
    this.patchImports();
    this.patchNotes();
  }

  attach(canvas: NativeCanvas): void {
    const win = canvas.wrapperEl.ownerDocument.defaultView;
    if (!win || this.windows.has(win)) return;
    this.windows.add(win);
    for (const type of ['paste', 'drop'] as const) {
      this.registerDomEvent(win, type, event => {
        const view = this.app.workspace.getLeavesOfType('canvas').find(leaf => {
          const candidate = (leaf.view as { canvas?: NativeCanvas }).canvas;
          return candidate && event.composedPath().includes(candidate.wrapperEl);
        })?.view as { canvas?: NativeCanvas } | undefined;
        const target = event.target;
        const element = target && 'nodeType' in target ? target as Element : null;
        if (!view?.canvas || view.canvas.readonly || element?.closest?.('input, textarea, [contenteditable="true"], .cm-editor')) return;
        const scope = { canvas: view.canvas };
        this.scope = scope;
        // Native events run microtasks between listeners, before Canvas handles the import.
        win.setTimeout(() => { if (this.scope === scope) this.scope = undefined; }, 0);
      }, { capture: true });
    }
  }

  private patchImports(): void {
    const app = this.app as ImportApp;
    if (typeof app.importAttachments !== 'function') return;
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Preserve and restore the native method; invoke with its original receiver.
    const original = app.importAttachments;
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- A method wrapper needs both the routing and native app receivers.
    const routing = this;
    const wrapped = function(this: ImportApp, items: Attachment[], folder: TFolder | null): Promise<TFile[]> {
      const canvas = routing.enabled ? routing.scope?.canvas : undefined;
      const setting = canvas?.view.file ? routing.data.folders(canvas.view.file.path).images : '';
      if (!canvas || canvas.readonly || folder || !setting || !items.some(item => !item.isDirectory && isImagePath('image.' + item.extension))) return original.call(this, items, folder);
      // Capture the destination before awaiting so changing tabs cannot redirect the import.
      return routing.importTo(original.bind(this), items, setting).catch((error: unknown) => {
        new Notice(error instanceof Error ? error.message : 'Could not import images into the configured folder.');
        return [];
      });
    };
    app.importAttachments = wrapped;
    this.register(() => { if (app.importAttachments === wrapped) app.importAttachments = original; });
  }

  private async importTo(original: ImportApp['importAttachments'], items: Attachment[], setting: string): Promise<TFile[]> {
    const folder = await ensureFolder(this.app, setting);
    const files: TFile[] = [];
    for (const item of items) {
      const image = !item.isDirectory && isImagePath('image.' + item.extension);
      files.push(...await original([item], image ? folder : null));
    }
    return files;
  }

  private patchNotes(): void {
    const manager = this.app.fileManager;
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Preserve and restore the native method; invoke with its original receiver.
    const original = manager.getNewFileParent;
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- A method wrapper needs both receivers.
    const routing = this;
    const wrapped = function(this: typeof manager, sourcePath: string, newFilePath?: string): TFolder {
      const canvas = routing.enabled ? activeCanvas(routing.app) : undefined;
      const canvasPath = routing.enabled && sourcePath?.endsWith('.canvas') ? sourcePath : !sourcePath ? canvas?.view.file?.path : undefined;
      const extension = newFilePath?.match(/\.([^/.]+)$/)?.[1]?.toLowerCase();
      const creators = (manager as typeof manager & { fileParentCreatorByType?: Record<string, unknown> }).fileParentCreatorByType;
      const markdown = !extension || extension === 'md' || (!!creators && !creators[extension]);
      if (canvasPath && markdown) {
        const setting = routing.data.folders(canvasPath).notes;
        const folder = setting === '/' ? routing.app.vault.getRoot() : routing.app.vault.getAbstractFileByPath(setting);
        if (setting && folder instanceof TFolder) return folder;
      }
      return original.call(this, sourcePath, newFilePath);
    };
    manager.getNewFileParent = wrapped;
    this.register(() => { if (manager.getNewFileParent === wrapped) manager.getNewFileParent = original; });
  }
}
