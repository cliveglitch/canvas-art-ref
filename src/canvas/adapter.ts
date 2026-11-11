import { Component, type App, type EventRef, type FileManager, type Menu, type MenuItem, type TFile, type TFolder, type TextFileView } from 'obsidian';
import type { CanvasData, NodeData, Rect } from './data';

export interface Point { x: number; y: number }
/** An item handed to Obsidian's attachment importer. */
export interface ImportItem { name: string; extension: string; filepath?: string; isDirectory?: boolean; data?: ArrayBuffer | Promise<ArrayBuffer> }
export type NativeImport = (items: ImportItem[], folder: TFolder | null) => Promise<TFile[]>;

/** An open canvas, seen through its `.canvas` file-format data. */
export interface Board {
  /** The canvas file's path, or '' when it has none. */
  readonly path: string;
  readonly readonly: boolean;
  data(): CanvasData;
  /** Ids of the selected cards and edges. */
  selectedIds(): Set<string>;
  /** Viewport width divided by height. */
  aspect(): number;
  center(): Point;
  /** Set card bounds as one native undo step, skipping cards already there. Throws on read-only canvases. */
  apply(changes: Map<string, Rect>): void;
  addFileCard(file: TFile, position: Point): void;
}

/**
 * Everything the plugin uses from Obsidian's undocumented Canvas, importer and menu internals.
 * Listeners subscribe before the adapter loads; after it unloads, native behaviour is restored and nothing is called.
 */
export interface CanvasAdapter {
  /** The canvas in the most recent leaf, when this version of Canvas supports it. */
  active(): Board | undefined;
  /** Called for every open canvas whenever canvases open or the layout changes. */
  onBoardOpened(listener: (board: Board) => void): void;
  onCardAdded(listener: (board: Board, card: NodeData) => void): void;
  /** Canvas context menus; `clicked` is the right-clicked card's id for card menus. */
  onContextMenu(listener: (menu: Menu, board: Board, clicked?: string) => void): void;
  /** The menu for empty canvas space, with the canvas position it opened at. */
  onCreationMenu(listener: (menu: Menu, board: Board, position: Point) => void): void;
  /** Route imports from a paste or drop on a canvas. Returning undefined imports natively. */
  routeImports(route: (board: Board, items: ImportItem[], folder: TFolder | null, native: NativeImport) => Promise<TFile[]> | undefined): void;
  /** Choose the folder for new Markdown notes created from a canvas. Returning undefined keeps Obsidian's choice. */
  routeNewNotes(route: (canvasPath: string) => TFolder | undefined): void;
}

/** The submenu of a context menu item. */
export function submenu(item: MenuItem): Menu {
  // setSubmenu exists in the native Menu API but is not in the published typings.
  return (item as MenuItem & { setSubmenu(): Menu }).setSubmenu();
}

// Undocumented runtime internals, used only by the live adapter below.
interface CanvasNode {
  id: string;
  canvas: NativeCanvas;
  getData(): NodeData;
  setData(data: NodeData): void;
}
interface NativeCanvas {
  view: CanvasView;
  nodes: Map<string, CanvasNode>;
  addNode(node: CanvasNode): void;
  selection: Set<CanvasNode | { id: string }>;
  wrapperEl: HTMLElement;
  readonly: boolean;
  getData(): CanvasData;
  requestSave(history?: boolean): void;
  requestPushHistory: { run(): void; cancel(): void };
  pushHistory(data: CanvasData): void;
  markMoved(node: CanvasNode): void;
  updateSelection(update: () => void): void;
  posCenter(): Point;
  createFileNode(options: { pos: Point; file: TFile; save?: boolean; focus?: boolean }): CanvasNode;
  showCreationMenu(menu: Menu, ...args: unknown[]): void;
}
interface CanvasView extends TextFileView { canvas: NativeCanvas }
interface ImportApp extends App { importAttachments: NativeImport }

declare module 'obsidian' {
  interface Workspace {
    on(name: 'canvas:selection-menu', callback: (menu: Menu, canvas: NativeCanvas) => void): EventRef;
    on(name: 'canvas:node-menu', callback: (menu: Menu, node: CanvasNode) => void): EventRef;
  }
}

class LiveBoard implements Board {
  constructor(private canvas: NativeCanvas) {}
  get path(): string { return this.canvas.view.file?.path ?? ''; }
  get readonly(): boolean { return this.canvas.readonly; }
  data(): CanvasData { return this.canvas.getData(); }
  selectedIds(): Set<string> { return new Set([...this.canvas.selection].map(node => node.id)); }
  aspect(): number { return this.canvas.wrapperEl.clientWidth / Math.max(1, this.canvas.wrapperEl.clientHeight); }
  center(): Point { return this.canvas.posCenter(); }
  addFileCard(file: TFile, position: Point): void { this.canvas.createFileNode({ pos: position, file }); }

  apply(changes: Map<string, Rect>): void {
    const canvas = this.canvas;
    if (canvas.readonly) throw new Error('This canvas is read-only.');
    if (typeof canvas.requestPushHistory?.run !== 'function' || typeof canvas.markMoved !== 'function') throw new Error('This version of Canvas does not support layout history.');
    const actual = [...changes].filter(([id, rect]) => {
      const node = canvas.nodes.get(id)?.getData();
      return node && (node.x !== rect.x || node.y !== rect.y || node.width !== rect.width || node.height !== rect.height);
    });
    if (!actual.length) return;
    canvas.requestPushHistory.run();
    for (const [id, rect] of actual) {
      const node = canvas.nodes.get(id)!;
      node.setData({ ...node.getData(), ...rect });
      canvas.markMoved(node);
    }
    canvas.updateSelection(() => {});
    canvas.requestSave(false);
    canvas.pushHistory(canvas.getData());
  }
}

/** The live adapter over Obsidian's running Canvas. */
export class ObsidianCanvas extends Component implements CanvasAdapter {
  private enabled = true;
  private boards = new WeakMap<NativeCanvas, LiveBoard>();
  private attached = new WeakSet<NativeCanvas>();
  private windows = new WeakSet<Window>();
  private scope?: { board: Board };
  private listeners = {
    opened: [] as ((board: Board) => void)[],
    added: [] as ((board: Board, card: NodeData) => void)[],
    context: [] as ((menu: Menu, board: Board, clicked?: string) => void)[],
    creation: [] as ((menu: Menu, board: Board, position: Point) => void)[],
  };
  private importRoute?: Parameters<CanvasAdapter['routeImports']>[0];
  private noteRoute?: Parameters<CanvasAdapter['routeNewNotes']>[0];
  constructor(private app: App) { super(); }

  active(): Board | undefined {
    const view = this.app.workspace.getMostRecentLeaf()?.view;
    return view?.getViewType() === 'canvas' ? this.board((view as CanvasView).canvas) : undefined;
  }
  onBoardOpened(listener: (board: Board) => void): void { this.listeners.opened.push(listener); }
  onCardAdded(listener: (board: Board, card: NodeData) => void): void { this.listeners.added.push(listener); }
  onContextMenu(listener: (menu: Menu, board: Board, clicked?: string) => void): void { this.listeners.context.push(listener); }
  onCreationMenu(listener: (menu: Menu, board: Board, position: Point) => void): void { this.listeners.creation.push(listener); }
  routeImports(route: Parameters<CanvasAdapter['routeImports']>[0]): void { this.importRoute = route; }
  routeNewNotes(route: Parameters<CanvasAdapter['routeNewNotes']>[0]): void { this.noteRoute = route; }

  onload(): void {
    this.register(() => { this.enabled = false; this.scope = undefined; });
    const workspace = this.app.workspace;
    this.registerEvent(workspace.on('canvas:selection-menu', (menu, canvas) => this.emit(canvas, board => this.listeners.context.forEach(listener => listener(menu, board)))));
    this.registerEvent(workspace.on('canvas:node-menu', (menu, node) => this.emit(node.canvas, board => this.listeners.context.forEach(listener => listener(menu, board, node.id)))));
    this.registerEvent(workspace.on('layout-change', () => this.attachAll()));
    this.registerEvent(workspace.on('active-leaf-change', () => this.attachAll()));
    workspace.onLayoutReady(() => { if (this.enabled) this.attachAll(); });
    this.patchImports();
    this.patchNewFileParent();
  }

  /** The board for a canvas that has everything this plugin relies on. */
  private board(canvas: NativeCanvas | undefined): Board | undefined {
    if (!canvas || !(canvas.nodes instanceof Map) || !(canvas.selection instanceof Set) || typeof canvas.getData !== 'function' || typeof canvas.requestSave !== 'function' || typeof canvas.pushHistory !== 'function') return undefined;
    let board = this.boards.get(canvas);
    if (!board) this.boards.set(canvas, board = new LiveBoard(canvas));
    return board;
  }

  private emit(canvas: NativeCanvas, call: (board: Board) => void): void {
    const board = this.enabled ? this.board(canvas) : undefined;
    if (board) call(board);
  }

  private attachAll(): void {
    for (const leaf of this.app.workspace.getLeavesOfType('canvas')) {
      const canvas = (leaf.view as CanvasView).canvas;
      const board = canvas?.wrapperEl ? this.board(canvas) : undefined;
      if (!board) continue;
      if (!this.attached.has(canvas)) {
        this.attached.add(canvas);
        this.listen(canvas.wrapperEl.ownerDocument.defaultView);
        const added = (target: NativeCanvas, node: CanvasNode): void => this.emit(target, board => this.listeners.added.forEach(listener => listener(board, node.getData())));
        this.patch(canvas, 'addNode', original => function(this: NativeCanvas, node: CanvasNode): void {
          const result = original.call(this, node);
          added(this, node);
          return result;
        });
        const creation = (target: NativeCanvas, menu: Menu, position: Point): void => this.emit(target, board => this.listeners.creation.forEach(listener => listener(menu, board, position)));
        this.patch(canvas, 'showCreationMenu', original => function(this: NativeCanvas, menu: Menu, ...args: unknown[]): void {
          original.call(this, menu, ...args);
          creation(this, menu, args[0] as Point);
        });
      }
      this.listeners.opened.forEach(listener => listener(board));
    }
  }

  /** Remember which canvas a paste or drop targets, for the importer that Canvas calls next. */
  private listen(win: Window | null): void {
    if (!win || this.windows.has(win)) return;
    this.windows.add(win);
    for (const type of ['paste', 'drop'] as const) {
      this.registerDomEvent(win, type, event => {
        const canvas = this.app.workspace.getLeavesOfType('canvas').map(leaf => (leaf.view as Partial<CanvasView>).canvas)
          .find(candidate => candidate && event.composedPath().includes(candidate.wrapperEl));
        const target = event.target;
        const element = target && 'nodeType' in target ? target as Element : null;
        const board = this.board(canvas);
        if (!board || element?.closest?.('input, textarea, [contenteditable="true"], .cm-editor')) return;
        const scope = { board };
        this.scope = scope;
        // Native events run microtasks between listeners, before Canvas handles the import.
        win.setTimeout(() => { if (this.scope === scope) this.scope = undefined; }, 0);
      }, { capture: true });
    }
  }

  private patchImports(): void {
    const scoped = (): Board | undefined => this.enabled ? this.scope?.board : undefined;
    const route = (board: Board, items: ImportItem[], folder: TFolder | null, native: NativeImport): Promise<TFile[]> | undefined => this.importRoute?.(board, items, folder, native);
    this.patch(this.app as ImportApp, 'importAttachments', original => function(this: ImportApp, items: ImportItem[], folder: TFolder | null): Promise<TFile[]> {
      const board = scoped();
      return (board && route(board, items, folder, original.bind(this))) ?? original.call(this, items, folder);
    });
  }

  private patchNewFileParent(): void {
    const manager = this.app.fileManager as FileManager & { fileParentCreatorByType?: Record<string, unknown> };
    const choose = (sourcePath: string, newFilePath?: string): TFolder | undefined => {
      if (!this.enabled || !this.noteRoute) return undefined;
      const canvasPath = sourcePath?.endsWith('.canvas') ? sourcePath : !sourcePath ? this.active()?.path : undefined;
      const extension = newFilePath?.match(/\.([^/.]+)$/)?.[1]?.toLowerCase();
      const creators = manager.fileParentCreatorByType;
      const markdown = !extension || extension === 'md' || (!!creators && !creators[extension]);
      return canvasPath && markdown ? this.noteRoute(canvasPath) : undefined;
    };
    this.patch(manager, 'getNewFileParent', original => function(this: FileManager, sourcePath: string, newFilePath?: string): TFolder {
      return choose(sourcePath, newFilePath) ?? original.call(this, sourcePath, newFilePath);
    });
  }

  /** Wrap a native method; on unload, restore it unless something else has replaced it since. */
  private patch<T extends object, K extends keyof T>(owner: T, key: K, wrap: (original: T[K]) => T[K]): void {
    const original = owner[key];
    if (typeof original !== 'function') return;
    const wrapped = wrap(original);
    owner[key] = wrapped;
    const target = new WeakRef(owner);
    this.register(() => { const live = target.deref(); if (live?.[key] === wrapped) live[key] = original; });
  }
}
