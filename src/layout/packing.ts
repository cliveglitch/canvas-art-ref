import { bounds, type NodeData, type Rect } from '../canvas/data';

/** Placed rectangles bucketed into grid cells, so checking a position only scans its neighbourhood. */
class Grid {
  private columns = new Map<number, Map<number, Rect[]>>();
  private width: number;
  private height: number;
  constructor(images: NodeData[], private gap: number, private area: Rect) {
    this.width = Math.max(1, images.reduce((sum, image) => sum + image.width, 0) / images.length + gap);
    this.height = Math.max(1, images.reduce((sum, image) => sum + image.height, 0) / images.length + gap);
  }

  add(rect: Rect): void {
    // Rectangles reaching past the packing area only need the cells inside it.
    const left = Math.max(this.column(rect.x - this.gap), this.column(this.area.x)) - 1;
    const right = Math.min(this.column(rect.x + rect.width + this.gap), this.column(this.area.x + this.area.width)) + 1;
    const top = Math.max(this.row(rect.y - this.gap), this.row(this.area.y)) - 1;
    const bottom = this.row(rect.y + rect.height + this.gap) + 1;
    for (let x = left; x <= right; x++) {
      let column = this.columns.get(x);
      if (!column) this.columns.set(x, column = new Map<number, Rect[]>());
      for (let y = top; y <= bottom; y++) {
        const cell = column.get(y);
        if (cell) cell.push(rect); else column.set(y, [rect]);
      }
    }
  }

  /**
   * The first position at or below `y` where the rectangle overlaps nothing, moving below each overlap in turn.
   * Stops early once its bottom passes `limit`, since it can no longer beat the best position.
   */
  drop(x: number, y: number, width: number, height: number, limit = Infinity): number {
    const gap = this.gap;
    for (;;) {
      let lowest = -Infinity;
      for (let column = this.column(x); column <= this.column(x + width); column++) {
        const cells = this.columns.get(column);
        if (cells) for (let row = this.row(y); row <= this.row(y + height); row++) {
          for (const other of cells.get(row) ?? []) {
            if (x < other.x + other.width + gap && x + width + gap > other.x && y < other.y + other.height + gap && y + height + gap > other.y) lowest = Math.max(lowest, other.y + other.height + gap);
          }
        }
      }
      if (lowest === -Infinity) return y;
      y = lowest;
      if (y + height > limit) return y;
    }
  }

  private column(x: number): number { return Math.floor(x / this.width); }
  private row(y: number): number { return Math.floor(y / this.height); }
}

function arrange(images: NodeData[], origin: Rect, width: number, gap: number, obstacles: Rect[], ordered: boolean): Map<string, Rect> {
  const result = new Map<string, Rect>();
  const grid = new Grid(images, gap, { ...origin, width: width + 0.01 });
  for (const obstacle of obstacles) grid.add(obstacle);
  // Candidate columns: the left edge, and just right of every placed rectangle. Each keeps the highest
  // position where even the smallest image could still fit; space only fills up, so it never moves back up.
  const smallest = images.reduce((size, image) => ({ width: Math.min(size.width, image.width), height: Math.min(size.height, image.height) }), { width: Infinity, height: Infinity });
  const columns = new Map([origin.x, ...obstacles.map(rect => rect.x + rect.width + gap)].map(x => [x, origin.y]));
  let cursorX = origin.x, cursorY = origin.y, rowBottom = origin.y;
  for (const image of images) {
    let best: Rect | undefined;
    if (ordered) {
      if (cursorX + image.width > origin.x + width && cursorX > origin.x) { cursorX = origin.x; cursorY = rowBottom + gap; }
      if (cursorX + image.width <= origin.x + width + 0.01) best = { x: cursorX, y: grid.drop(cursorX, cursorY, image.width, image.height), width: image.width, height: image.height };
    } else for (const [x, free] of columns) {
      if (x < origin.x || x + image.width > origin.x + width + 0.01) continue;
      const limit = best ? best.y + best.height : Infinity;
      if (free + image.height > limit) continue;
      const highest = grid.drop(x, free, smallest.width, smallest.height);
      columns.set(x, highest);
      if (highest + image.height > limit) continue;
      const y = grid.drop(x, highest, image.width, image.height, limit);
      if (!best || y + image.height < best.y + best.height || (y + image.height === best.y + best.height && x < best.x)) best = { x, y, width: image.width, height: image.height };
    }
    if (!best) throw new Error('Could not fit the selected images.');
    grid.add(best); result.set(image.id, best);
    if (!columns.has(best.x + best.width + gap)) columns.set(best.x + best.width + gap, origin.y);
    if (ordered) { cursorX = best.x + best.width + gap; cursorY = best.y; rowBottom = Math.max(rowBottom, best.y + best.height); }
  }
  return result;
}

/** Deterministic packing: no rotation, cropping, or source-file changes. */
export function pack(images: NodeData[], gap: number, obstacles: Rect[] = [], aspect = 1): Map<string, Rect> {
  const origin = bounds(images);
  const sorted = [...images].sort((a, b) => b.height - a.height || b.width - a.width || a.id.localeCompare(b.id));
  const area = images.reduce((sum, image) => sum + (image.width + gap) * (image.height + gap), 0);
  const minimum = images.reduce((widest, image) => Math.max(widest, image.width), 0);
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
  return arrange(images, origin, images.reduce((widest, image) => Math.max(widest, image.width), origin.width), gap, obstacles, true);
}
