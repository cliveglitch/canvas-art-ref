import { contains, type CanvasData, type NodeData, type Rect } from '../canvas/data';
import { alignImages, type AlignMode } from './alignment';
import { fitGroups } from './groups';
import { sortImages, type OrderMode, type SortMemory } from './ordering';
import { orderedPack, pack } from './packing';
import { fitted, matchSizes, scaleSelection, type SizeMode, type SizeSource } from './sizing';

/** One layout operation on a canvas. */
export type LayoutOperation =
  | { kind: 'pack' }
  | { kind: 'arrange'; mode: OrderMode }
  | { kind: 'align'; mode: AlignMode }
  | { kind: 'normalize'; mode: SizeMode }
  | { kind: 'scale'; percent: number }
  | { kind: 'optimize-groups' };

export interface Size { width: number; height: number }

export interface LayoutInput {
  /** The canvas as it is now. */
  data: CanvasData;
  /** The selected images, or the selected groups for Optimize group, as they were when selected. */
  selection: NodeData[];
  operation: LayoutOperation;
  /** Natural size by image file path, for every selected image. Not needed by Scale selection or Optimize group. */
  sizes?: ReadonlyMap<string, Size>;
  gap?: number;
  /** Viewport width divided by height, which Optimal packs for. */
  aspect?: number;
  source?: SizeSource;
  additions?: readonly string[];
  /** The memory returned by the last plan applied to this canvas. */
  memory?: SortMemory;
  random?: () => number;
}

export interface LayoutPlan {
  /** The new bounds of every card the operation sets, including the groups fitted around them. */
  changes: Map<string, Rect>;
  /** Keep this for the canvas's next plan once this one is applied. */
  memory?: SortMemory;
}

/** Every position and size change one layout operation makes. Throws when the selection no longer matches the canvas. */
export function planLayout(input: LayoutInput): LayoutPlan {
  const { data, selection, operation } = input;
  const current = new Map(data.nodes.map(node => [node.id, node]));
  for (const node of selection) {
    const live = current.get(node.id);
    if (!live || (['type', 'x', 'y', 'width', 'height', 'file'] as const).some(key => live[key] !== node[key])) throw new Error('The selection changed. Try the action again.');
  }
  if (operation.kind === 'optimize-groups') {
    if (!selection.length) throw new Error('Select at least one group.');
    return { changes: fitGroups(data.nodes, selection), memory: input.memory };
  }
  if (!selection.length) throw new Error('Select images or a group containing images.');
  const { moved, memory } = operation.kind === 'scale'
    ? { moved: scaleSelection(selection, operation.percent / 100), memory: input.memory }
    : arrange(input, operation);
  // Groups fit around everything they contained, as PureRef groups adjust to their content.
  const touched = data.nodes.filter(group => group.type === 'group' && selection.some(node => moved.has(node.id) && contains(group, node)));
  return { changes: fitGroups(data.nodes, touched, moved), memory };
}

function arrange(input: LayoutInput, operation: Exclude<LayoutOperation, { kind: 'scale' | 'optimize-groups' }>): { moved: Map<string, Rect>; memory?: SortMemory } {
  const { data, selection, gap = 0 } = input;
  const images = selection.map(node => {
    const size = input.sizes?.get(node.file ?? '');
    if (!size?.width || !size.height) throw new Error('Could not read image dimensions: ' + node.file);
    return fitted(node, size.width / size.height, size);
  });
  const ids = new Set(selection.map(node => node.id));
  const obstacles = data.nodes.filter(node => node.type !== 'group' && !ids.has(node.id));
  switch (operation.kind) {
    case 'pack': return { moved: pack(images, gap, obstacles, input.aspect), memory: input.memory };
    case 'align': return { moved: alignImages(images, operation.mode, gap), memory: input.memory };
    case 'normalize': return { moved: matchSizes(images, operation.mode, input.source), memory: input.memory };
    case 'arrange': {
      const sorted = sortImages(images, operation.mode, input.additions ?? [], input.memory, input.random);
      return { moved: orderedPack(sorted.images, gap, obstacles), memory: sorted.memory };
    }
  }
}
