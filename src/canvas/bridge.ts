import type { App } from 'obsidian';
import type { CanvasNode, CanvasView, NativeCanvas, NodeData, Rect } from './types';
import { contains, selectedImages } from './selection';
import { groupPadding, optimizedGroupBounds } from '../layout/groups';

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

export function optimizeGroups(canvas: NativeCanvas, selected = groupSelection(canvas)): void {
  if (!selected.length) throw new Error('Select at least one group.');
  commitRectangles(canvas, selected, optimizedGroupBounds(canvas.getData().nodes, selected));
}

export function commitLayout(canvas: NativeCanvas, before: NodeData[], rectangles: Map<string, Rect>): void {
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
      left = Math.min(left, rect.x - groupPadding.side); top = Math.min(top, rect.y - groupPadding.top);
      right = Math.max(right, rect.x + rect.width + groupPadding.side); bottom = Math.max(bottom, rect.y + rect.height + groupPadding.bottom);
    }
    changes.set(group.id, { x: left, y: top, width: right - left, height: bottom - top });
  }
  commitRectangles(canvas, before, changes);
}

function commitRectangles(canvas: NativeCanvas, before: NodeData[], rectangles: Map<string, Rect>): void {
  if (canvas.readonly) throw new Error('This canvas is read-only.');
  for (const node of before) {
    const current = canvas.nodes.get(node.id)?.getData();
    if (!current || ['type', 'x', 'y', 'width', 'height', 'file'].some(key => current[key] !== node[key])) throw new Error('The selection changed. Try the action again.');
  }
  if (typeof canvas.requestPushHistory?.run !== 'function' || typeof canvas.markMoved !== 'function') throw new Error('This version of Canvas does not support layout history.');
  const actual = [...rectangles].filter(([id, rect]) => {
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
