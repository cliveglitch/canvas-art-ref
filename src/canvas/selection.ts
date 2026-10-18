import type { NodeData, Rect } from './types';

export const isImagePath = (path: string): boolean => /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(path);
export const isImage = (node: NodeData): boolean => node.type === 'file' && typeof node.file === 'string' && isImagePath(node.file);
export const contains = (outer: Rect, inner: Rect): boolean => inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
export const overlaps = (a: Rect, b: Rect, gap = 0): boolean => a.x < b.x + b.width + gap && a.x + a.width + gap > b.x && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;

export function selectedImages(nodes: NodeData[], selected: ReadonlySet<string>): NodeData[] {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const result = new Map<string, NodeData>();
  for (const id of selected) {
    const node = byId.get(id);
    if (!node) continue;
    if (isImage(node)) result.set(node.id, node);
    if (node.type === 'group') {
      const children = nodes.filter(child => isImage(child) && contains(node, child));
      children.sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
      for (const child of children) if (!result.has(child.id)) result.set(child.id, child);
    }
  }
  return [...result.values()];
}

export function bounds(rects: Rect[]): Rect {
  if (!rects.length) throw new Error('Select at least one image.');
  const x = Math.min(...rects.map(rect => rect.x)), y = Math.min(...rects.map(rect => rect.y));
  return { x, y, width: Math.max(...rects.map(rect => rect.x + rect.width)) - x, height: Math.max(...rects.map(rect => rect.y + rect.height)) - y };
}
