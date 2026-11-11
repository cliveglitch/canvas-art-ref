import type { App } from 'obsidian';
import type { CanvasNode, CanvasView, NativeCanvas } from './types';
import { selectedImages, type NodeData, type Rect } from './data';

export function activeCanvas(app: App): NativeCanvas | undefined {
  const view = app.workspace.getMostRecentLeaf()?.view;
  if (view?.getViewType() !== 'canvas') return undefined;
  const canvas = (view as CanvasView).canvas;
  if (!canvas || !(canvas.nodes instanceof Map) || !(canvas.selection instanceof Set) || typeof canvas.requestSave !== 'function' || typeof canvas.pushHistory !== 'function') return undefined;
  return canvas;
}

function selectedIds(canvas: NativeCanvas, clicked?: CanvasNode): Set<string> {
  return clicked && !canvas.selection.has(clicked) ? new Set([clicked.id]) : new Set([...canvas.selection].map(node => node.id));
}

export function imageSelection(canvas: NativeCanvas, clicked?: CanvasNode): NodeData[] {
  return selectedImages(canvas.getData().nodes, selectedIds(canvas, clicked));
}

export function groupSelection(canvas: NativeCanvas, clicked?: CanvasNode): NodeData[] {
  const selected = selectedIds(canvas, clicked);
  return canvas.getData().nodes.filter(node => node.type === 'group' && selected.has(node.id));
}

/** Apply a layout plan's changes as one native undo step. */
export function applyLayout(canvas: NativeCanvas, changes: Map<string, Rect>): void {
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
