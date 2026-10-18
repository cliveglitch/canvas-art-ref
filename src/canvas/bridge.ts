import type { App } from 'obsidian';
import type { CanvasNode, CanvasView, NativeCanvas, NodeData, Rect } from './types';
import { contains, selectedImages } from './selection';

export function activeCanvas(app: App): NativeCanvas | undefined {
  const view = app.workspace.getMostRecentLeaf()?.view;
  if (view?.getViewType() !== 'canvas') return undefined;
  const canvas = (view as CanvasView).canvas;
  if (!canvas || !(canvas.nodes instanceof Map) || !(canvas.selection instanceof Set) || typeof canvas.requestSave !== 'function' || typeof canvas.pushHistory !== 'function') return undefined;
  return canvas;
}

export function imageSelection(canvas: NativeCanvas, clicked?: CanvasNode): NodeData[] {
  const selected = clicked && !canvas.selection.has(clicked) ? new Set([clicked.id]) : new Set([...canvas.selection].map(node => node.id));
  return selectedImages(canvas.getData().nodes, selected);
}

export function commitLayout(canvas: NativeCanvas, before: NodeData[], rectangles: Map<string, Rect>): void {
  if (canvas.readonly) throw new Error('This canvas is read-only.');
  for (const node of before) {
    const current = canvas.nodes.get(node.id)?.getData();
    if (!current || ['x', 'y', 'width', 'height', 'file'].some(key => current[key] !== node[key])) throw new Error('The selection changed. Try the action again.');
  }
  if (typeof canvas.requestPushHistory?.run !== 'function' || typeof canvas.markMoved !== 'function') throw new Error('This version of Canvas does not support image layout history.');
  const data = canvas.getData();
  const changes = new Map(rectangles);
  // Keep images inside their existing groups, including groups that were not selected.
  for (const group of data.nodes.filter(node => node.type === 'group')) {
    const children = before.filter(node => contains(group, node));
    if (!children.length) continue;
    let left = group.x, top = group.y, right = group.x + group.width, bottom = group.y + group.height;
    for (const child of children) {
      const rect = rectangles.get(child.id);
      if (!rect) continue;
      left = Math.min(left, rect.x - 20); top = Math.min(top, rect.y - 40);
      right = Math.max(right, rect.x + rect.width + 20); bottom = Math.max(bottom, rect.y + rect.height + 20);
    }
    changes.set(group.id, { x: left, y: top, width: right - left, height: bottom - top });
  }
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
