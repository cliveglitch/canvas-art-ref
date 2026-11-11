import type { App, EventRef, Menu, TFile, TFolder, TextFileView } from 'obsidian';
import type { CanvasData, NodeData } from './data';

// Undocumented runtime internals of Obsidian's Canvas and importer.
export interface CanvasNode {
  id: string;
  canvas: NativeCanvas;
  isEditing?: boolean;
  getData(): NodeData;
  setData(data: NodeData): void;
}
export interface NativeCanvas {
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
  posCenter(): { x: number; y: number };
  createFileNode(options: { pos: { x: number; y: number }; file: TFile; save?: boolean; focus?: boolean }): CanvasNode;
  showCreationMenu(menu: Menu, ...args: unknown[]): void;
}
export interface CanvasView extends TextFileView { canvas: NativeCanvas }
export interface Attachment {
  name: string;
  extension: string;
  filepath?: string;
  isDirectory?: boolean;
  data?: ArrayBuffer | Promise<ArrayBuffer>;
}
export interface ImportApp extends App {
  importAttachments(items: Attachment[], folder: TFolder | null): Promise<TFile[]>;
}

declare module 'obsidian' {
  interface Workspace {
    on(name: 'canvas:selection-menu', callback: (menu: Menu, canvas: NativeCanvas) => void): EventRef;
    on(name: 'canvas:node-menu', callback: (menu: Menu, node: CanvasNode) => void): EventRef;
  }
}
