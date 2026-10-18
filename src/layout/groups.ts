import type { NodeData, Rect } from '../canvas/types';
import { bounds, contains } from '../canvas/selection';

export const groupPadding = { side: 20, top: 40, bottom: 20 } as const;

/** Fit group boundaries to their original contents without moving any cards. */
export function optimizedGroupBounds(nodes: NodeData[], groups: NodeData[]): Map<string, Rect> {
  const result = new Map<string, Rect>();
  // Resize nested selections first so their parents fit the resulting boundaries.
  const ordered = groups.filter(group => group.type === 'group').sort((a, b) => a.width * a.height - b.width * b.height);
  for (const group of ordered) {
    const children = nodes.filter(node => node.id !== group.id && contains(group, node)
      // Groups with identical boundaries are peers, avoiding circular containment.
      && (node.type !== 'group' || !contains(node, group)));
    if (!children.length) continue;
    const box = bounds(children.map(node => result.get(node.id) ?? node));
    // Round outwards to retain the padding after native Canvas pixel rounding.
    const x = Math.floor(box.x - groupPadding.side), y = Math.floor(box.y - groupPadding.top);
    result.set(group.id, {
      x, y,
      width: Math.ceil(box.x + box.width + groupPadding.side) - x,
      height: Math.ceil(box.y + box.height + groupPadding.bottom) - y,
    });
  }
  return result;
}
