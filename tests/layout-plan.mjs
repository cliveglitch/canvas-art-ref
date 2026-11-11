import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api } from './bundle.mjs';

const image = (id, x = 0, y = 0, width = 100, height = 100) => ({ id, x, y, width, height, type: 'file', file: id + '.png' });
const group = (id, x, y, width, height) => ({ id, type: 'group', label: id, x, y, width, height });
const note = (id, x, y, width = 100, height = 100) => ({ id, type: 'text', text: id, x, y, width, height });
const close = (a, b) => assert.ok(Math.abs(a - b) < .000001, `${a} != ${b}`);
const overlaps = (a, b, gap = 0) => a.x < b.x + b.width + gap && a.x + a.width + gap > b.x && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
/** Plan an operation on `nodes`, selecting their images unless told otherwise. Natural sizes default to each card's own proportions. */
function plan(nodes, operation, { selection = nodes.filter(node => node.type === 'file'), natural = {}, ...options } = {}) {
  const sizes = new Map(nodes.filter(node => node.type === 'file').map(node => [node.file, natural[node.id] ?? { width: node.width, height: node.height }]));
  return api.planLayout({ data: { nodes, edges: [] }, selection, operation, sizes, ...options });
}
/** Ids in reading order of their planned positions. */
const readingOrder = (changes, ids) => [...ids].sort((a, b) => changes.get(a).y - changes.get(b).y || changes.get(a).x - changes.get(b).x);

const nodes = [image('wide', -50, 20, 200, 100), image('tall', 200, -100, 100, 200), image('square', 400, 300, 90, 90)];
const natural = { wide: { width: 1000, height: 500 }, tall: { width: 100, height: 200 }, square: { width: 300, height: 300 } };

test('packing keeps every image and its proportions, with no overlap or collisions with other cards', () => {
  const images = Array.from({ length: 70 }, (_, i) => image('image' + i, i * 70, i % 4 * 60, 30 + i % 7 * 29, 50 + i % 5 * 37));
  const context = note('context', 40, 60, 240, 300);
  const { changes } = plan([...images, context], { kind: 'pack' }, { gap: 12 });
  assert.equal(changes.size, images.length);
  for (const original of images) {
    const rect = changes.get(original.id);
    close(rect.width, original.width); close(rect.height, original.height);
    assert.equal(overlaps(rect, context, 12), false);
    for (const [otherId, other] of changes) if (otherId !== original.id) assert.equal(overlaps(rect, other, 12), false);
  }
  assert.deepEqual(plan([...images, context], { kind: 'pack' }, { gap: 12 }).changes, changes);
});

test('optimal packing responds to a wide or tall viewport', () => {
  const input = Array.from({ length: 24 }, (_, index) => image(String(index), index * 110, 0));
  const wide = api.bounds([...plan(input, { kind: 'pack' }, { gap: 10, aspect: 3 }).changes.values()]);
  const tall = api.bounds([...plan(input, { kind: 'pack' }, { gap: 10, aspect: 1 / 3 }).changes.values()]);
  assert.ok(wide.width / wide.height > tall.width / tall.height);
});

test('a wider viewport never gives a narrower optimal collage', () => {
  let seed = 7;
  const random = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  for (const count of [6, 17, 35, 80]) {
    const input = Array.from({ length: count }, (_, index) => image(String(index), index * 50, 0, 120 + random() * 400, 120 + random() * 400));
    let previous = 0;
    for (let aspect = .5; aspect <= 3; aspect += .05) {
      const box = api.bounds([...plan(input, { kind: 'pack' }, { gap: 24, aspect }).changes.values()]);
      assert.ok(box.width / box.height >= previous - 1e-9, `${count} images: viewport ${aspect.toFixed(2)} gave a narrower collage`);
      previous = box.width / box.height;
    }
  }
});

test('packing and sorted arrangements of a very large selection stay fast and never overlap', () => {
  let seed = 1;
  const random = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  const input = Array.from({ length: 1500 }, (_, index) => image(String(index), index % 40 * 400, Math.floor(index / 40) * 600, 80 + random() * 600, 200 + random() * 500));
  const obstacle = note('obstacle', 2000, 2000, 800, 800);
  for (const operation of [{ kind: 'pack' }, { kind: 'arrange', mode: 'order' }]) {
    const started = performance.now();
    const rects = [...plan([...input, obstacle], operation, { gap: 24, aspect: 1.8 }).changes.values()];
    // Generous bound: the previous packing took minutes at this size.
    assert.ok(performance.now() - started < 10000, 'arranging 1500 images took too long');
    assert.equal(rects.length, input.length);
    for (let a = 0; a < rects.length; a++) {
      assert.equal(overlaps(rects[a], obstacle, 24), false);
      for (let b = a + 1; b < rects.length; b++) if (overlaps(rects[a], rects[b], 24)) assert.fail(`images ${a} and ${b} overlap`);
    }
  }
});

test('name, path, selection and addition orders have distinct meanings, with natural filename sorting', () => {
  const input = [image('3'), image('2'), image('1')];
  input[0].file = 'A/zebra10.png'; input[1].file = 'C/apple2.png'; input[2].file = 'B/apple1.png';
  const order = (mode, additions) => readingOrder(plan(input, { kind: 'arrange', mode }, { additions }).changes, ['1', '2', '3']);
  assert.deepEqual(order('name'), ['1', '2', '3']);
  assert.deepEqual(order('path'), ['3', '1', '2']);
  assert.deepEqual(order('order'), ['3', '2', '1']);
  assert.deepEqual(order('addition', ['2', '3', '1']), ['2', '3', '1']);
  const sprites = [image('sprite10', 0, 0), image('sprite2', 150, 0), image('sprite1', 300, 0)];
  assert.deepEqual(readingOrder(plan(sprites, { kind: 'arrange', mode: 'name' }, { gap: 10 }).changes, ['sprite10', 'sprite2', 'sprite1']), ['sprite1', 'sprite2', 'sprite10']);
});

test('repeating a sort reverses it and then restores it, even when the selection order changes', () => {
  const ids = nodes.map(node => node.id);
  for (const mode of ['name', 'path', 'order', 'addition']) {
    const first = plan(nodes, { kind: 'arrange', mode }, { additions: ['tall', 'square', 'wide'] });
    const second = plan(nodes, { kind: 'arrange', mode }, { selection: [...nodes].reverse(), additions: ['tall', 'square', 'wide'], memory: first.memory });
    assert.deepEqual(readingOrder(second.changes, ids), readingOrder(first.changes, ids).reverse());
    const third = plan(nodes, { kind: 'arrange', mode }, { additions: [], memory: second.memory });
    assert.deepEqual(readingOrder(third.changes, ids), readingOrder(first.changes, ids));
  }
});

test('only remembered sorts reverse, and other operations keep the memory', () => {
  const first = plan(nodes, { kind: 'arrange', mode: 'name' });
  assert.deepEqual(plan(nodes, { kind: 'arrange', mode: 'name' }).changes, first.changes, 'a plan that was never applied is not remembered');
  assert.equal(plan(nodes, { kind: 'pack' }, { memory: first.memory }).memory, first.memory);
  assert.equal(plan(nodes, { kind: 'arrange', mode: 'random' }, { memory: first.memory }).memory, undefined);
});

test('random arrangement keeps every image and can produce both orders of a two-image selection', () => {
  const ids = nodes.map(node => node.id);
  for (const random of [() => 0, () => .9999]) assert.deepEqual([...plan(nodes, { kind: 'arrange', mode: 'random' }, { random }).changes.keys()].sort(), [...ids].sort());
  const pair = [image('a', 0, 0), image('b', 0, 200)];
  const order = random => readingOrder(plan(pair, { kind: 'arrange', mode: 'random' }, { random }).changes, ['a', 'b']);
  assert.deepEqual(order(() => .9999), ['a', 'b']);
  assert.deepEqual(order(() => 0), ['b', 'a']);
});

for (const mode of ['left', 'right', 'top', 'bottom']) test(`align ${mode} matches edges while retaining the other axis and image dimensions`, () => {
  const { changes } = plan(nodes, { kind: 'align', mode }, { gap: 24 }), box = api.bounds(nodes);
  for (const original of nodes) {
    const rect = changes.get(original.id);
    assert.equal(rect.width, original.width); assert.equal(rect.height, original.height);
    if (mode === 'left') { close(rect.x, box.x); close(rect.y, original.y); }
    if (mode === 'right') { close(rect.x + rect.width, box.x + box.width); close(rect.y, original.y); }
    if (mode === 'top') { close(rect.y, box.y); close(rect.x, original.x); }
    if (mode === 'bottom') { close(rect.y + rect.height, box.y + box.height); close(rect.x, original.x); }
  }
});

test('stack centers images without changing their sizes', () => {
  const { changes } = plan(nodes, { kind: 'align', mode: 'stack' }), box = api.bounds(nodes);
  for (const original of nodes) {
    const rect = changes.get(original.id);
    close(rect.x + rect.width / 2, box.x + box.width / 2);
    close(rect.y + rect.height / 2, box.y + box.height / 2);
    assert.equal(rect.width, original.width); assert.equal(rect.height, original.height);
  }
});

for (const mode of ['horizontal', 'vertical']) test(`distribution ${mode} forms a centered line with the configured gap`, () => {
  for (const gap of [0, 24]) {
    const result = [...plan(nodes, { kind: 'align', mode }, { gap }).changes.values()].sort((a, b) => mode === 'horizontal' ? a.x - b.x : a.y - b.y);
    for (let index = 1; index < result.length; index++) {
      const a = result[index - 1], b = result[index];
      if (mode === 'horizontal') { close(b.x - (a.x + a.width), gap); close(a.y + a.height / 2, b.y + b.height / 2); }
      else { close(b.y - (a.y + a.height), gap); close(a.x + a.width / 2, b.x + b.width / 2); }
    }
  }
});

for (const source of ['average', 'first']) for (const mode of ['width', 'height', 'size', 'area', 'scale']) test(`normalize ${mode} from ${source} preserves proportions and uses the intended measure`, () => {
  const measure = rect => mode === 'area' ? rect.width * rect.height
    : mode === 'size' ? Math.max(rect.width, rect.height)
    : mode === 'scale' ? rect.width / natural[rect.id].width : rect[mode];
  const initial = nodes.map(measure);
  const target = source === 'first' ? initial[0] : initial.reduce((sum, value) => sum + value, 0) / initial.length;
  const { changes } = plan(nodes, { kind: 'normalize', mode }, { natural, source });
  for (const original of nodes) {
    const rect = { id: original.id, ...changes.get(original.id) };
    close(measure(rect), target); close(rect.width / rect.height, original.width / original.height);
    close(rect.x, original.x); close(rect.y, original.y);
  }
  if (source === 'first') { close(changes.get('wide').width, 200); close(changes.get('wide').height, 100); }
});

test('longest-side, area and natural scale normalizations produce different results', () => {
  const result = mode => [...plan(nodes, { kind: 'normalize', mode }, { natural }).changes.values()];
  assert.notDeepEqual(result('size'), result('area'));
  assert.notDeepEqual(result('size'), result('scale'));
  const scale = plan(nodes, { kind: 'normalize', mode: 'scale' }, { natural }).changes;
  close(scale.get('wide').width, 500); close(scale.get('tall').width, 50);
});

test('image actions trim each card to its natural proportions, and need every natural size', () => {
  const card = image('card', 0, 0, 200, 200);
  assert.deepEqual(plan([card], { kind: 'align', mode: 'left' }, { natural: { card: { width: 400, height: 200 } } }).changes.get('card'), { x: 0, y: 0, width: 200, height: 100 });
  assert.throws(() => api.planLayout({ data: { nodes: [card], edges: [] }, selection: [card], operation: { kind: 'pack' }, sizes: new Map() }), /Could not read image dimensions: card\.png/);
});

test('Scale selection scales the whole arrangement and rejects invalid percentages', () => {
  const input = [image('a', -100, 50, 100, 200), image('b', 100, 100, 50, 80)];
  const { changes } = plan(input, { kind: 'scale', percent: 200 });
  assert.deepEqual(changes.get('a'), { x: -100, y: 50, width: 200, height: 400 });
  assert.deepEqual(changes.get('b'), { x: 300, y: 150, width: 100, height: 160 });
  for (const percent of [0, -100, NaN, Infinity, 1100]) assert.throws(() => plan(input, { kind: 'scale', percent }));
});

test('stale or empty selections are rejected', () => {
  const data = { nodes: structuredClone(nodes), edges: [] };
  const selection = structuredClone(nodes);
  data.nodes[0].x++;
  assert.throws(() => api.planLayout({ data, selection, operation: { kind: 'scale', percent: 50 } }), /selection changed/);
  assert.throws(() => api.planLayout({ data, selection: [], operation: { kind: 'pack' } }), /Select images or a group containing images/);
  assert.throws(() => api.planLayout({ data, selection: [], operation: { kind: 'optimize-groups' } }), /Select at least one group/);
});

test('groups around moved images fit everything they contain, shrinking as well as growing', () => {
  const input = [group('g', 0, 0, 1000, 1000), image('a', 100, 100), note('context', 300, 300), group('elsewhere', 2000, 0, 500, 500), image('b', 2100, 100)];
  const { changes } = plan(input, { kind: 'scale', percent: 200 }, { selection: [input[1]] });
  assert.deepEqual(changes.get('a'), { x: 100, y: 100, width: 200, height: 200 });
  assert.deepEqual(changes.get('g'), { x: 80, y: 60, width: 340, height: 360 });
  assert.equal(changes.has('elsewhere'), false);
  const grown = plan(input, { kind: 'align', mode: 'left' }, { selection: [input[1], input[4]] }).changes;
  assert.deepEqual(grown.get('elsewhere'), { x: 80, y: 60, width: 140, height: 160 }, 'a group follows its image even when the image moves out');
  assert.deepEqual(grown.get('g'), { x: 80, y: 60, width: 340, height: 360 });
});

test('nested groups fit from the inside out, so parents keep their own padding', () => {
  const input = [group('outer', 0, 0, 1000, 1000), group('inner', 100, 100, 400, 400), image('a', 200, 200)];
  const { changes } = plan(input, { kind: 'scale', percent: 200 });
  assert.deepEqual(changes.get('inner'), { x: 180, y: 160, width: 240, height: 260 });
  assert.deepEqual(changes.get('outer'), { x: 160, y: 120, width: 280, height: 320 });
});

test('fitted group edges round outward to whole canvas pixels', () => {
  const input = [group('g', 0, 0, 500, 500), image('a', 100.25, 100.75, 33.3, 33.3)];
  const rect = plan(input, { kind: 'scale', percent: 150 }).changes.get('g');
  for (const value of Object.values(rect)) assert.ok(Number.isInteger(value));
  assert.ok(rect.x <= 100.25 - 20 && rect.y <= 100.75 - 40);
});

const optimize = (nodes, groups) => api.planLayout({ data: { nodes, edges: [] }, selection: groups, operation: { kind: 'optimize-groups' } }).changes;
const scattered = [group('outer', -500, -400, 1600, 1400), image('left', -125.25, 50.5, 90.5, 110.25), image('right', 320.75, -120.5, 180.5, 90),
  note('note', 550, 370, 160, 120), group('inner', 100, 100, 400, 200), image('outside', 1400, 0), image('partial', 1000, 20, 200, 100)];

test('Optimize group fits scattered contents with outward padding, without changing any card', () => {
  assert.deepEqual(optimize(scattered, [scattered[0]]), new Map([['outer', { x: -146, y: -161, width: 876, height: 671 }]]));
  const touching = [group('g', 0, 0, 100, 100), image('a', 0, 0, 100, 100)];
  assert.deepEqual(optimize(touching, [touching[0]]).get('g'), { x: -20, y: -40, width: 140, height: 160 }, 'contents touching the boundary still get padding');
});

test('Optimize group fits selected nested groups from the inside out, in any selection order', () => {
  const input = [group('parent', -500, -500, 2000, 2000), group('child', -100, -100, 900, 900), image('a', 100, 100, 100, 100)];
  const before = structuredClone(input);
  const result = optimize(input, input.slice(0, 2));
  assert.deepEqual(result.get('child'), { x: 80, y: 60, width: 140, height: 160 });
  assert.deepEqual(result.get('parent'), { x: 60, y: 20, width: 180, height: 220 });
  assert.deepEqual(optimize(input, [input[1], input[0]]), result);
  assert.deepEqual(input, before);
});

test('Optimize group counts unselected nested groups and notes as contents, even without images', () => {
  const input = [group('parent', 0, 0, 1000, 1000), group('child', 200, 300, 400, 200)];
  assert.deepEqual(optimize(input, [input[0]]).get('parent'), { x: 180, y: 260, width: 440, height: 260 });
  input[1] = { ...input[1], type: 'text', text: 'Only a note' };
  assert.deepEqual(optimize(input, [input[0]]).get('parent'), { x: 180, y: 260, width: 440, height: 260 });
});

test('Optimize group leaves empty groups alone and treats coextensive groups as peers', () => {
  assert.equal(optimize([group('empty', 0, 0, 300, 300)], [group('empty', 0, 0, 300, 300)]).size, 0);
  const peers = [group('a', 0, 0, 500, 500), group('b', 0, 0, 500, 500)];
  assert.equal(optimize(peers, peers).size, 0);
  const input = [...peers, image('image', 100, 100)];
  const fitted = optimize(input, peers);
  assert.deepEqual(fitted.get('a'), fitted.get('b'));
  const refitted = input.map(node => ({ ...node, ...fitted.get(node.id) }));
  assert.deepEqual(optimize(refitted, refitted.slice(0, 2)), fitted);
});

test('Optimize group rejects stale groups', () => {
  const selection = [structuredClone(scattered[0])];
  const data = { nodes: structuredClone(scattered), edges: [] };
  data.nodes[0].width++;
  assert.throws(() => api.planLayout({ data, selection, operation: { kind: 'optimize-groups' } }), /selection changed/);
});
