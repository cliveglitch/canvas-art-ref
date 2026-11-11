import { Component, Notice, TFile, type Menu } from 'obsidian';
import { activeCanvas, applyLayout, groupSelection, imageSelection } from './bridge';
import type { CanvasView, NativeCanvas } from './types';
import type { NodeData } from './data';
import { planLayout } from '../layout/plan';
import { ImageActions } from './actions';
import type { ImageAction } from './action-catalog';
import { ImageOrdering } from './ordering';
import { StorageRouting } from '../storage/routing';
import { ensureFolder, uniqueNotePath } from '../storage/folders';
import { foldersFor } from '../settings';
import { CanvasFoldersModal, type SettingsHost } from '../ui/settings';
import { NoteModal, ScaleModal } from '../ui/dialogs';
import { groupMenu, imageMenu } from '../ui/menus';

export class CanvasIntegration extends Component {
  readonly actions: ImageActions;
  private routing: StorageRouting;
  private ordering: ImageOrdering;
  private attached = new WeakSet<NativeCanvas>();
  private enabled = true;
  constructor(private host: SettingsHost) {
    super();
    this.ordering = this.addChild(new ImageOrdering(host));
    this.actions = new ImageActions(host.app, () => host.settings, this.ordering, () => host.saveSettings());
    this.routing = this.addChild(new StorageRouting(host));
  }

  onload(): void {
    const workspace = this.host.app.workspace;
    this.register(() => { this.enabled = false; this.actions.stop(); });
    this.registerEvent(workspace.on('canvas:selection-menu', (menu, canvas) => {
      imageMenu(menu, canvas, imageSelection(canvas), this.actions, this.host.app);
      const groups = groupSelection(canvas);
      groupMenu(menu, canvas, groups, () => this.optimize(canvas, groups));
    }));
    this.registerEvent(workspace.on('canvas:node-menu', (menu, node) => {
      imageMenu(menu, node.canvas, imageSelection(node.canvas, node), this.actions, this.host.app);
      const groups = groupSelection(node.canvas, node);
      groupMenu(menu, node.canvas, groups, () => this.optimize(node.canvas, groups));
    }));
    this.registerEvent(workspace.on('file-menu', (menu, file) => {
      if (file instanceof TFile && file.extension === 'canvas') menu.addItem(item => item.setTitle('Canvas folders…').setIcon('folder-cog').onClick(() => new CanvasFoldersModal(this.host, file.path).open()));
    }));
    this.registerEvent(workspace.on('layout-change', () => this.attachViews()));
    this.registerEvent(workspace.on('active-leaf-change', () => this.attachViews()));
    workspace.onLayoutReady(() => { if (this.enabled) this.attachViews(); });
  }

  run(action: ImageAction): void {
    const canvas = activeCanvas(this.host.app);
    if (canvas) void this.actions.run(canvas, action);
  }
  optimize(canvas = activeCanvas(this.host.app), groups?: NodeData[]): void {
    if (!this.enabled || !canvas) return;
    try { applyLayout(canvas, planLayout({ data: canvas.getData(), selection: groups ?? groupSelection(canvas), operation: { kind: 'optimize-groups' } }).changes); }
    catch (error) { new Notice(error instanceof Error ? error.message : 'Could not optimize the selected groups.'); }
  }
  scale(): void {
    const canvas = activeCanvas(this.host.app);
    if (!canvas) return;
    const images = imageSelection(canvas);
    new ScaleModal(this.host.app, percent => this.actions.scale(canvas, percent, images)).open();
  }
  folders(): void {
    const canvas = activeCanvas(this.host.app);
    if (canvas?.view.file) new CanvasFoldersModal(this.host, canvas.view.file.path).open();
  }
  note(canvas = activeCanvas(this.host.app), position = canvas?.posCenter()): void {
    if (!canvas || canvas.readonly || !position) return;
    const path = canvas.view.file?.path;
    new NoteModal(this.host.app, async name => {
      const setting = foldersFor(this.host.settings, path ?? '').notes;
      const folder = setting ? await ensureFolder(this.host.app, setting) : this.host.app.fileManager.getNewFileParent(path ?? '');
      if (!this.enabled || canvas.readonly || canvas.view.file?.path !== path) throw new Error('The canvas changed. Try creating the note again.');
      const file = await this.host.app.vault.create(uniqueNotePath(this.host.app, folder, name), '');
      canvas.createFileNode({ pos: position, file });
    }).open();
  }

  private attachViews(): void {
    for (const leaf of this.host.app.workspace.getLeavesOfType('canvas')) {
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
        menu.addItem(item => item.setTitle('Canvas folders…').setIcon('folder-cog').onClick(() => { if (this.view.file) new CanvasFoldersModal(integration.host, this.view.file.path).open(); }));
      };
      canvas.showCreationMenu = wrapped;
      const target = new WeakRef(canvas);
      this.register(() => { const live = target.deref(); if (live?.showCreationMenu === wrapped) live.showCreationMenu = original; });
    }
  }
}
