import type { NodeData, Rect } from '../canvas/types';
import { bounds } from '../canvas/selection';

export type SizeMode = 'width' | 'height' | 'size' | 'area' | 'scale';
export type SizeSource = 'first' | 'average';
export interface ImageRect extends NodeData { ratio: number; naturalWidth: number; naturalHeight: number }

/** Remove empty space around the displayed image, without cropping it. */
export function fitted(node: NodeData, ratio: number, source?: { width: number; height: number }): ImageRect {
  const width = Math.min(node.width, node.height * ratio);
  return { ...node, width, height: width / ratio, ratio, naturalWidth: source?.width ?? width, naturalHeight: source?.height ?? width / ratio };
}

export function matchSizes(images: ImageRect[], mode: SizeMode, source: SizeSource = 'average'): Map<string, Rect> {
  if (!images.length) throw new Error('Select at least one image.');
  const measure = (image: ImageRect): number => {
    if (mode === 'area') return image.width * image.height;
    if (mode === 'size') return Math.max(image.width, image.height);
    if (mode === 'scale') return image.width / image.naturalWidth;
    return image[mode];
  };
  const target = source === 'first' ? measure(images[0]!) : images.reduce((sum, image) => sum + measure(image), 0) / images.length;
  return new Map(images.map(image => {
    const width = mode === 'width' ? target
      : mode === 'height' ? target * image.ratio
      : mode === 'size' ? target * Math.min(1, image.ratio)
      : mode === 'scale' ? image.naturalWidth * target
      : Math.sqrt(target * image.ratio);
    return [image.id, { x: image.x, y: image.y, width, height: width / image.ratio }];
  }));
}

export function scaleSelection(images: NodeData[], factor: number): Map<string, Rect> {
  if (!Number.isFinite(factor) || factor <= 0 || factor > 10) throw new Error('Enter a scale greater than 0% and no more than 1000%.');
  const origin = bounds(images);
  return new Map(images.map(image => [image.id, {
    x: origin.x + (image.x - origin.x) * factor,
    y: origin.y + (image.y - origin.y) * factor,
    width: image.width * factor, height: image.height * factor,
  }]));
}
