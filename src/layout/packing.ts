import type { NodeData, Rect } from '../canvas/types';
import { bounds, overlaps } from '../canvas/selection';

function arrange(images: NodeData[], origin: Rect, width: number, gap: number, obstacles: Rect[], ordered: boolean): Map<string, Rect> {
  const placed: Rect[] = [];
  const result = new Map<string, Rect>();
  let cursorX = origin.x, cursorY = origin.y, rowBottom = origin.y;
  for (const image of images) {
    const occupied = [...obstacles, ...placed];
    let best: Rect | undefined;
    const xs = ordered ? [cursorX] : [origin.x, ...occupied.map(rect => rect.x + rect.width + gap)];
    if (ordered && cursorX + image.width > origin.x + width && cursorX > origin.x) {
      cursorX = origin.x; cursorY = rowBottom + gap; xs[0] = cursorX;
    }
    for (const x of xs) {
      if (x < origin.x || x + image.width > origin.x + width + 0.01) continue;
      const rect = { x, y: ordered ? cursorY : origin.y, width: image.width, height: image.height };
      for (;;) {
        const conflicts = occupied.filter(other => overlaps(rect, other, gap));
        if (!conflicts.length) break;
        rect.y = Math.max(...conflicts.map(other => other.y + other.height + gap));
      }
      if (!best || rect.y + rect.height < best.y + best.height || (rect.y + rect.height === best.y + best.height && rect.x < best.x)) best = rect;
    }
    if (!best) throw new Error('Could not fit the selected images.');
    placed.push(best); result.set(image.id, best);
    if (ordered) { cursorX = best.x + best.width + gap; cursorY = best.y; rowBottom = Math.max(rowBottom, best.y + best.height); }
  }
  return result;
}

/** Deterministic packing: no rotation, cropping, or source-file changes. */
export function pack(images: NodeData[], gap: number, obstacles: Rect[] = [], aspect = 1): Map<string, Rect> {
  const origin = bounds(images);
  const sorted = [...images].sort((a, b) => b.height - a.height || b.width - a.width || a.id.localeCompare(b.id));
  const area = images.reduce((sum, image) => sum + (image.width + gap) * (image.height + gap), 0);
  const minimum = Math.max(...images.map(image => image.width));
  const target = Number.isFinite(aspect) && aspect > 0 ? Math.max(.2, Math.min(5, aspect)) : 1;
  const widths = [.7, .9, 1.1, 1.4].map(factor => Math.max(minimum, Math.sqrt(area * target) * factor));
  let best = new Map<string, Rect>(), bestScore = Infinity;
  for (const width of widths) {
    const result = arrange(sorted, origin, width, gap, obstacles, false);
    const box = bounds([...result.values()]);
    const score = box.width * box.height * (1 + Math.abs(Math.log(box.width / box.height / target)) * .3);
    if (score < bestScore) { best = result; bestScore = score; }
  }
  return best;
}

export function orderedPack(images: NodeData[], gap: number, obstacles: Rect[] = []): Map<string, Rect> {
  const origin = bounds(images);
  return arrange(images, origin, Math.max(origin.width, ...images.map(image => image.width)), gap, obstacles, true);
}
