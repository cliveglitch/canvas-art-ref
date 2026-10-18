import type { AlignMode } from '../layout/alignment';
import type { OrderMode } from '../layout/ordering';
import type { SizeMode } from '../layout/sizing';

export type ImageAction = 'pack' | OrderMode | AlignMode | SizeMode;
export const arrangeActions = [
  { action: 'pack', title: 'Optimal', id: 'pack-images', name: 'Pack selected images' },
  { action: 'name', title: 'By name', id: 'arrange-images-by-name', name: 'Arrange selected images by name' },
  { action: 'path', title: 'By path', id: 'arrange-images-by-path', name: 'Arrange selected images by path' },
  { action: 'order', title: 'By order', id: 'arrange-images-by-order', name: 'Arrange selected images by selection order' },
  { action: 'addition', title: 'By addition', id: 'arrange-images-by-addition', name: 'Arrange selected images by addition' },
  { action: 'random', title: 'Randomly', id: 'arrange-images-randomly', name: 'Arrange selected images randomly' },
] as const;
export const alignActions = [
  { action: 'left', title: 'Left', id: 'align-images-left', name: 'Align selected images left' },
  { action: 'right', title: 'Right', id: 'align-images-right', name: 'Align selected images right' },
  { action: 'top', title: 'Top', id: 'align-images-top', name: 'Align selected images top' },
  { action: 'bottom', title: 'Bottom', id: 'align-images-bottom', name: 'Align selected images bottom' },
  { action: 'stack', title: 'Stack', id: 'stack-images', name: 'Stack selected images' },
  { action: 'horizontal', title: 'Distribute horizontal', id: 'distribute-images-horizontal', name: 'Distribute selected images horizontally' },
  { action: 'vertical', title: 'Distribute vertical', id: 'distribute-images-vertical', name: 'Distribute selected images vertically' },
] as const;
export const normalizeActions = [
  { action: 'height', title: 'Height', id: 'match-image-height', name: 'Match selected image heights' },
  { action: 'width', title: 'Width', id: 'match-image-width', name: 'Match selected image widths' },
  { action: 'size', title: 'Size', id: 'match-image-size', name: 'Match selected image longest sides' },
  { action: 'area', title: 'Area', id: 'match-image-area', name: 'Match selected image areas' },
  { action: 'scale', title: 'Scale', id: 'normalize-image-scale', name: 'Normalize selected image scales' },
] as const;

export const isAlignAction = (action: ImageAction): action is AlignMode => alignActions.some(item => item.action === action);
export const isOrderAction = (action: ImageAction): action is OrderMode => action !== 'pack' && arrangeActions.some(item => item.action === action);
