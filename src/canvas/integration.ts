import { Component, TFile, type App, type Command, type Menu } from 'obsidian';
import { activeCanvas } from './bridge';
import type { CanvasView, NativeCanvas } from './types';
import type { ImageActions } from './image-actions';
import type { ImageOrdering } from './ordering';
import { StorageRouting } from '../storage/routing';
import { ensureFolder, uniqueNotePath } from '../storage/folders';
import type { PluginData } from '../plugin-data';
import { CanvasFoldersModal } from '../ui/settings';
import { NoteModal } from '../ui/dialogs';
import { actionMenu } from '../ui/menus';

export class CanvasIntegration extends Component {
  private routing: StorageRouting;
  private attached = new WeakSet<NativeCanvas>();
  private enabled = true;
  constructor(private app: App, private data: PluginData, private actions: ImageActions, private ordering: ImageOrdering) {
    super();
    this.routing = this.addChild(new StorageRouting(app, data));
  }

  onload(): void {
    const workspace = this.app.workspace;
    this.register(() => { this.enabled = false; });
    this.registerEvent(workspace.on('canvas:selection-menu', (menu, canvas) => actionMenu(menu, canvas, this.actions)));
    this.registerEvent(workspace.on('canvas:node-menu', (menu, node) => actionMenu(menu, node.canvas, this.actions, node)));
    this.registerEvent(workspace.on('file-menu', (menu, file) => {
      if (file instanceof TFile && file.extension === 'canvas') menu.addItem(item => item.setTitle('Canvas folders…').setIcon('folder-cog').onClick(() => new CanvasFoldersModal(this.app, this.data, file.path).open()));
    }));
    this.registerEvent(workspace.on('layout-change', () => this.attachViews()));
    this.registerEvent(workspace.on('active-leaf-change', () => this.attachViews()));
    workspace.onLayoutReady(() => { if (this.enabled) this.attachViews(); });
  }

  /** Canvas folders and Create Markdown note, available on any editable canvas. */
  commands(): Command[] {
    return ([
      ['canvas-folders', 'Canvas folders', (canvas: NativeCanvas) => this.folders(canvas)],
      ['create-note', 'Create Markdown note in canvas', (canvas: NativeCanvas) => this.note(canvas)],
    ] as const).map(([id, name, callback]) => ({
      id, name,
      checkCallback: checking => {
        const canvas = activeCanvas(this.app);
        const available = !!canvas && !canvas.readonly;
        if (available && !checking) callback(canvas);
        return available;
      },
    }));
  }

  private folders(canvas: NativeCanvas): void {
    if (canvas.view.file) new CanvasFoldersModal(this.app, this.data, canvas.view.file.path).open();
  }

  private note(canvas: NativeCanvas, position = canvas.posCenter()): void {
    if (canvas.readonly || !position) return;
    const path = canvas.view.file?.path;
    new NoteModal(this.app, async name => {
      const setting = this.data.folders(path ?? '').notes;
      const folder = setting ? await ensureFolder(this.app, setting) : this.app.fileManager.getNewFileParent(path ?? '');
      if (!this.enabled || canvas.readonly || canvas.view.file?.path !== path) throw new Error('The canvas changed. Try creating the note again.');
      const file = await this.app.vault.create(uniqueNotePath(this.app, folder, name), '');
      canvas.createFileNode({ pos: position, file });
    }).open();
  }

  private attachViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType('canvas')) {
      const canvas = (leaf.view as CanvasView).canvas;
      if (!canvas?.wrapperEl) continue;
      this.routing.attach(canvas);
      this.ordering.attach(canvas);
      if (this.attached.has(canvas) || typeof canvas.showCreationMenu !== 'function') continue;
      this.attached.add(canvas);
      // eslint-disable-next-line @typescript-eslint/no-this-alias -- Preserve the native canvas receiver in the menu wrapper.
      const integration = this;
      // eslint-disable-next-line @typescript-eslint/unbound-method -- Invoke with the canvas receiver and restore on unload.
      const original = canvas.showCreationMenu;
      const wrapped = function(this: NativeCanvas, menu: Menu, ...args: unknown[]): void {
        original.call(this, menu, ...args);
        if (!integration.enabled) return;
        menu.addItem(item => item.setTitle('Create Markdown note…').setIcon('file-plus').onClick(() => integration.note(this, args[0] as { x: number; y: number })));
        menu.addItem(item => item.setTitle('Canvas folders…').setIcon('folder-cog').onClick(() => integration.folders(this)));
      };
      canvas.showCreationMenu = wrapped;
      const target = new WeakRef(canvas);
      this.register(() => { const live = target.deref(); if (live?.showCreationMenu === wrapped) live.showCreationMenu = original; });
    }
  }
}
