import type { NodeData } from '../canvas/data';

export type OrderMode = 'name' | 'path' | 'order' | 'addition' | 'random';

export function orderImages<T extends NodeData>(images: T[], mode: OrderMode, additions: readonly string[] = [], random: () => number = Math.random): T[] {
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

/** What reverse on repeat remembers about the last sort applied to a canvas. */
export interface SortMemory { signature: string; mode: OrderMode; base: string[]; reversed: boolean }

/** Order images for a sorted arrangement; repeating the remembered sort on the same images reverses it. */
export function sortImages<T extends NodeData>(images: T[], mode: OrderMode, additions: readonly string[], memory?: SortMemory, random?: () => number): { images: T[]; memory?: SortMemory } {
  const signature = JSON.stringify(images.map(node => [node.id, node.file]).sort((a, b) => a[0]!.localeCompare(b[0]!)));
  const repeated = mode !== 'random' && memory?.signature === signature && memory.mode === mode;
  const base = repeated ? memory.base : orderImages(images, mode, additions, random).map(node => node.id);
  const reversed = repeated ? !memory.reversed : false;
  const ids = reversed ? [...base].reverse() : base;
  const byId = new Map(images.map(image => [image.id, image]));
  return { images: ids.map(id => byId.get(id)!), memory: mode === 'random' ? undefined : { signature, mode, base, reversed } };
}
