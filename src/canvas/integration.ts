import { Component, TFile, type App, type Command } from 'obsidian';
import type { Board, CanvasAdapter, Point } from './adapter';
import type { ImageActions } from './image-actions';
import { ensureFolder, uniqueNotePath } from '../storage/folders';
import type { PluginData } from '../plugin-data';
import { CanvasFoldersModal } from '../ui/settings';
import { NoteModal } from '../ui/dialogs';
import { actionMenu } from '../ui/menus';

/** The plugin's menus and commands on native Canvas: image actions, Canvas folders and Create Markdown note. */
export class CanvasIntegration extends Component {
  private enabled = true;
  constructor(private app: App, private data: PluginData, actions: ImageActions, private canvas: CanvasAdapter) {
    super();
    canvas.onContextMenu((menu, board, clicked) => actionMenu(menu, board, actions, clicked));
    canvas.onCreationMenu((menu, board, position) => {
      menu.addItem(item => item.setTitle('Create Markdown note…').setIcon('file-plus').onClick(() => this.note(board, position)));
      menu.addItem(item => item.setTitle('Canvas folders…').setIcon('folder-cog').onClick(() => this.folders(board)));
    });
  }

  onload(): void {
    this.register(() => { this.enabled = false; });
    this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
      if (file instanceof TFile && file.extension === 'canvas') menu.addItem(item => item.setTitle('Canvas folders…').setIcon('folder-cog').onClick(() => new CanvasFoldersModal(this.app, this.data, file.path).open()));
    }));
  }

  /** Canvas folders and Create Markdown note, available on any editable canvas. */
  commands(): Command[] {
    return ([
      ['canvas-folders', 'Canvas folders', (board: Board) => this.folders(board)],
      ['create-note', 'Create Markdown note in canvas', (board: Board) => this.note(board)],
    ] as const).map(([id, name, callback]) => ({
      id, name,
      checkCallback: checking => {
        const board = this.canvas.active();
        const available = !!board && !board.readonly;
        if (available && !checking) callback(board);
        return available;
      },
    }));
  }

  private folders(board: Board): void {
    if (board.path) new CanvasFoldersModal(this.app, this.data, board.path).open();
  }

  private note(board: Board, position: Point = board.center()): void {
    if (board.readonly) return;
    const path = board.path;
    new NoteModal(this.app, async name => {
      const setting = this.data.folders(path).notes;
      const folder = setting ? await ensureFolder(this.app, setting) : this.app.fileManager.getNewFileParent(path);
      if (!this.enabled || board.readonly || board.path !== path) throw new Error('The canvas changed. Try creating the note again.');
      const file = await this.app.vault.create(uniqueNotePath(this.app, folder, name), '');
      board.addFileCard(file, position);
    }).open();
  }
}
