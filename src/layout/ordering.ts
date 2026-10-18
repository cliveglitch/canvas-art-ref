import type { NodeData } from '../canvas/types';

export type OrderMode = 'name' | 'path' | 'order' | 'addition' | 'random';

export function orderImages<T extends NodeData>(images: T[], mode: OrderMode, additions: string[] = [], random: () => number = Math.random): T[] {
  const result = [...images];
  if (mode === 'name' || mode === 'path') {
    const value = (node: T): string => mode === 'path' ? node.file ?? '' : node.file?.split('/').pop() ?? '';
    result.sort((a, b) => value(a).localeCompare(value(b), undefined, { numeric: true, sensitivity: 'base' }));
  }
  if (mode === 'addition') {
    const positions = new Map(additions.map((id, index) => [id, index]));
    result.sort((a, b) => (positions.get(a.id) ?? Infinity) - (positions.get(b.id) ?? Infinity));
  }
  if (mode === 'random' && result.length > 1) {
    for (let index = result.length - 1; index > 0; index--) {
      const other = Math.floor(random() * (index + 1));
      [result[index], result[other]] = [result[other]!, result[index]!];
    }
  }
  return result;
}

export class SortHistory {
  private previous?: { signature: string; mode: OrderMode; base: string[]; reversed: boolean };

  prepare<T extends NodeData>(images: T[], mode: OrderMode, additions: string[]): { images: T[]; accept: () => void } {
    const signature = JSON.stringify(images.map(node => [node.id, node.file]).sort((a, b) => a[0]!.localeCompare(b[0]!)));
    const previous = this.previous;
    const repeated = mode !== 'random' && previous?.signature === signature && previous.mode === mode;
    const base = repeated ? previous.base : orderImages(images, mode, additions).map(node => node.id);
    const reversed = repeated ? !previous.reversed : false;
    const ids = reversed ? [...base].reverse() : base;
    const byId = new Map(images.map(image => [image.id, image]));
    return {
      images: ids.map(id => byId.get(id)!),
      accept: () => { this.previous = mode === 'random' ? undefined : { signature, mode, base, reversed }; },
    };
  }
}
