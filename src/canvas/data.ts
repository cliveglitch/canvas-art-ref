/** The stable `.canvas` file format, and geometry on it. Nothing here depends on Obsidian's runtime. */
export interface Rect { x: number; y: number; width: number; height: number }
export interface NodeData extends Rect {
  id: string;
  type: string;
  file?: string;
  text?: string;
  label?: string;
  [key: string]: unknown;
}
export interface CanvasData {
  nodes: NodeData[];
  edges: { id: string; [key: string]: unknown }[];
  [key: string]: unknown;
}

export const isImagePath = (path: string): boolean => /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(path);
export const isImage = (node: NodeData): boolean => node.type === 'file' && typeof node.file === 'string' && isImagePath(node.file);
export const contains = (outer: Rect, inner: Rect): boolean => inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;

/** Selected images: selected image cards, then each selected group's images in reading order. */
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
  // A loop rather than Math.min(...spread), which overflows the call stack on very large selections.
  let x = Infinity, y = Infinity, right = -Infinity, bottom = -Infinity;
  for (const rect of rects) {
    x = Math.min(x, rect.x); y = Math.min(y, rect.y);
    right = Math.max(right, rect.x + rect.width); bottom = Math.max(bottom, rect.y + rect.height);
  }
  return { x, y, width: right - x, height: bottom - y };
}
