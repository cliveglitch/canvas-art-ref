import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  stdin: { contents: `export * from './src/canvas/selection'; export * from './src/canvas/bridge'; export * from './src/layout/packing'; export * from './src/layout/sizing'; export * from './src/layout/alignment'; export * from './src/layout/ordering'; export * from './src/layout/groups'; export * from './src/settings';`, resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'esm', write: false,
});
const api = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const image = (id, x = 0, y = 0, width = 100, height = 100) => ({ id, x, y, width, height, type: 'file', file: id + '.png' });

test('selection includes contained group images, excluding notes, edges and partly overlapping images', () => {
  const group = { id: 'g', type: 'group', x: 0, y: 0, width: 500, height: 500 };
  const nodes = [group, image('inside', 10, 10), image('partial', 450, 450), image('outside', 600, 600), { ...image('note'), file: 'note.md' }];
  assert.deepEqual(api.selectedImages(nodes, new Set(['g', 'outside', 'edge'])).map(n => n.id), ['inside', 'outside']);
  assert.deepEqual(api.selectedImages(nodes, new Set()), []);
});

test('packing keeps every image and its proportions, with no overlap or collisions with contextual notes', () => {
  const images = Array.from({ length: 70 }, (_, i) => image('image' + i, i * 70, i % 4 * 60, 30 + i % 7 * 29, 50 + i % 5 * 37));
  const obstacle = { x: 40, y: 60, width: 240, height: 300 };
  const packed = api.pack(images, 12, [obstacle]);
  assert.equal(packed.size, images.length);
  for (const original of images) {
    const rect = packed.get(original.id);
    assert.equal(rect.width, original.width); assert.equal(rect.height, original.height);
    assert.equal(api.overlaps(rect, obstacle, 12), false);
    for (const [otherId, other] of packed) if (otherId !== original.id) assert.equal(api.overlaps(rect, other, 12), false);
  }
  assert.deepEqual(api.pack(images, 12, [obstacle]), packed);
});

test('ordered layouts use natural filename ordering', () => {
  const nodes = [image('sprite10', 0, 0), image('sprite2', 150, 0), image('sprite1', 300, 0)];
  assert.deepEqual([...api.orderedPack(api.orderImages(nodes, 'name'), 10).keys()], ['sprite1', 'sprite2', 'sprite10']);
});

test('matching width, height and area preserves intrinsic proportions for portraits and landscapes', () => {
  const images = [api.fitted(image('wide', 0, 0, 400, 400), 2), api.fitted(image('tall', 500, 0, 400, 400), .5)];
  for (const mode of ['width', 'height', 'area']) {
    const values = [...api.matchSizes(images, mode).values()];
    assert.equal(values[0].width / values[0].height, 2);
    assert.equal(values[1].width / values[1].height, .5);
    const measure = rect => mode === 'area' ? rect.width * rect.height : rect[mode];
    assert.ok(Math.abs(measure(values[0]) - measure(values[1])) < .0001);
  }
});

test('scaling preserves the whole arrangement and rejects invalid factors', () => {
  const nodes = [image('a', -100, 50, 100, 200), image('b', 100, 100, 50, 80)];
  const scaled = api.scaleSelection(nodes, 2);
  assert.deepEqual(scaled.get('a'), { x: -100, y: 50, width: 200, height: 400 });
  assert.deepEqual(scaled.get('b'), { x: 300, y: 150, width: 100, height: 160 });
  for (const factor of [0, -1, NaN, Infinity, 11]) assert.throws(() => api.scaleSelection(nodes, factor));
});

function canvasFixture() {
  const data = { nodes: [image('a', 20, 50), { id: 'g', type: 'group', label: 'References', x: 0, y: 0, width: 160, height: 180 }, { ...image('note', 200, 50), file: 'context.md', custom: 'keep' }], edges: [{ id: 'edge', fromNode: 'a', toNode: 'note', label: 'context' }], custom: { untouched: true } };
  const calls = [];
  const nodes = new Map(data.nodes.map(n => [n.id, { id: n.id, getData: () => n, setData: value => Object.assign(n, value) }]));
  const canvas = { readonly: false, nodes, getData: () => structuredClone(data), requestPushHistory: { run: () => calls.push('flush') }, markMoved: n => calls.push('move:' + n.id), updateSelection: f => f(), requestSave: history => calls.push(['save', history]), pushHistory: snapshot => calls.push(['history', snapshot]) };
  return { canvas, data, calls };
}

test('a layout makes exactly one history snapshot, retains edges, notes and custom data, and expands the group', () => {
  const { canvas, data, calls } = canvasFixture();
  const before = structuredClone(data.nodes[0]);
  const note = structuredClone(data.nodes[2]);
  api.commitLayout(canvas, [before], new Map([['a', { x: 20, y: 50, width: 300, height: 100 }]]));
  assert.deepEqual(data.nodes[2], note);
  assert.deepEqual(data.edges, [{ id: 'edge', fromNode: 'a', toNode: 'note', label: 'context' }]);
  assert.deepEqual(data.custom, { untouched: true });
  assert.equal(data.nodes[1].width, 340);
  assert.equal(calls.filter(call => call[0] === 'history').length, 1);
  assert.deepEqual(calls.find(call => call[0] === 'save'), ['save', false]);
});

test('stale or read-only canvases are not mutated', () => {
  const { canvas, data, calls } = canvasFixture();
  const before = structuredClone(data.nodes[0]);
  data.nodes[0].x++;
  assert.throws(() => api.commitLayout(canvas, [before], new Map([['a', { ...before, x: 500 }]])), /selection changed/);
  canvas.readonly = true;
  assert.throws(() => api.commitLayout(canvas, [structuredClone(data.nodes[0])], new Map()), /read-only/);
  assert.deepEqual(calls, []);
});

test('folder overrides inherit independently and reject paths outside the vault or inside configuration folders', () => {
  const settings = api.defaults();
  settings.images = 'Art/Images'; settings.notes = 'Art/Notes';
  settings.canvases['Hero.canvas'] = { images: '/' };
  assert.deepEqual(api.foldersFor(settings, 'Hero.canvas'), { images: '/', notes: 'Art/Notes' });
  assert.equal(api.folderSetting('Art\\Images'), 'Art/Images');
  for (const path of ['../secret', 'C:\\secret', '/absolute', '.obsidian/plugins', 'Art/../Secret', 'Art//Images']) assert.throws(() => api.folderSetting(path));
  assert.equal(api.loadSettings({ images: '../secret' }).images, '');
});

await (await import('./image-actions.mjs')).checkImageActions(api, image);
await (await import('./group-actions.mjs')).checkGroupActions(api, image);
await import('./storage-routing.mjs');
