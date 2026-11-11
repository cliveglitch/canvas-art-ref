import { bounds, contains, type NodeData, type Rect } from '../canvas/data';

const padding = { side: 20, top: 40, bottom: 20 } as const;

/**
 * Group fit: size each group around every card it contained before `moved`, innermost groups first,
 * without moving any cards. Returns `moved` plus the fitted bounds of each group that has contents.
 */
export function fitGroups(nodes: NodeData[], groups: NodeData[], moved: ReadonlyMap<string, Rect> = new Map()): Map<string, Rect> {
  const result = new Map(moved);
  // Fit nested groups first so their parents fit the resulting boundaries.
  const ordered = groups.filter(group => group.type === 'group').sort((a, b) => a.width * a.height - b.width * b.height);
  for (const group of ordered) {
    const children = nodes.filter(node => node.id !== group.id && contains(group, node)
      // Groups with identical boundaries are peers, avoiding circular containment.
      && (node.type !== 'group' || !contains(node, group)));
    if (!children.length) continue;
    const box = bounds(children.map(node => result.get(node.id) ?? node));
    // Round outwards to retain the padding after native Canvas pixel rounding.
    const x = Math.floor(box.x - padding.side), y = Math.floor(box.y - padding.top);
    result.set(group.id, {
      x, y,
      width: Math.ceil(box.x + box.width + padding.side) - x,
      height: Math.ceil(box.y + box.height + padding.bottom) - y,
    });
  }
  return result;
}
