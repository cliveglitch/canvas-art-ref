import type { NodeData, Rect } from '../canvas/types';
import { bounds } from '../canvas/selection';

export type AlignMode = 'left' | 'right' | 'top' | 'bottom' | 'stack' | 'horizontal' | 'vertical';

export function alignImages(images: NodeData[], mode: AlignMode, gap: number): Map<string, Rect> {
  const box = bounds(images);
  const centerX = box.x + box.width / 2, centerY = box.y + box.height / 2;
  const ordered = [...images];
  if (mode === 'horizontal') ordered.sort((a, b) => a.x - b.x || a.y - b.y);
  if (mode === 'vertical') ordered.sort((a, b) => a.y - b.y || a.x - b.x);
  let cursor = mode === 'horizontal' ? box.x : box.y;
  return new Map(ordered.map(image => {
    const rect = { x: image.x, y: image.y, width: image.width, height: image.height };
    if (mode === 'left') rect.x = box.x;
    if (mode === 'right') rect.x = box.x + box.width - image.width;
    if (mode === 'top') rect.y = box.y;
    if (mode === 'bottom') rect.y = box.y + box.height - image.height;
    if (mode === 'stack') { rect.x = centerX - image.width / 2; rect.y = centerY - image.height / 2; }
    if (mode === 'horizontal') {
      rect.x = cursor; rect.y = centerY - image.height / 2; cursor += image.width + gap;
    }
    if (mode === 'vertical') {
      rect.x = centerX - image.width / 2; rect.y = cursor; cursor += image.height + gap;
    }
    return [image.id, rect];
  }));
}
