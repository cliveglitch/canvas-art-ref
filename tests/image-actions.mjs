import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api } from './bundle.mjs';
import { memoryCanvas, pluginData } from './fakes.mjs';

const { AdditionOrder, ImageActions, ImageSizes, sections, obsidian: { TFile, notices } } = api;
const image = (id, x = 0, y = 0, width = 100, height = 100) => ({ id, x, y, width, height, type: 'file', file: id + '.png' });
const group = (id, x, y, width, height) => ({ id, type: 'group', label: id, x, y, width, height });

/** Image actions over the in-memory canvas, with every image file a 1:1 image. `load` can delay or vary natural sizes. */
async function fixture({ load = async () => ({ width: 100, height: 100 }) } = {}) {
  const canvas = memoryCanvas();
  const { data } = await pluginData({ gap: 10 });
  const app = { vault: { getAbstractFileByPath: path => new TFile(path) } };
  const additions = new AdditionOrder(data, canvas);
  const actions = new ImageActions(app, data, additions, canvas, new ImageSizes(app, load));
  const entry = id => actions.entries.find(entry => entry.id === id);
  return { canvas, data, actions, entry, run: (board, id, selection) => actions.run(board, entry(id), selection) };
}
const lastNotice = () => notices.at(-1);

test('the catalog offers every image action and Optimize group as one command each, in menu order', async () => {
  const { actions } = await fixture();
  assert.deepEqual(actions.entries.map(entry => entry.id), [
    'pack-images', 'arrange-images-by-name', 'arrange-images-by-path', 'arrange-images-by-order', 'arrange-images-by-addition', 'arrange-images-randomly',
    'align-images-left', 'align-images-right', 'align-images-top', 'align-images-bottom', 'stack-images', 'distribute-images-horizontal', 'distribute-images-vertical',
    'match-image-height', 'match-image-width', 'match-image-size', 'match-image-area', 'normalize-image-scale', 'scale-images', 'optimize-groups',
  ]);
  assert.deepEqual(sections.map(section => [section.title, section.entries.length]), [['Arrange images', 6], ['Align images', 7], ['Normalize images', 6]]);
});

test('commands are available on an active, editable canvas with selected images or groups', async () => {
  const { canvas, actions } = await fixture();
  const command = id => actions.commands().find(command => command.id === id);
  assert.equal(command('pack-images').checkCallback(true), false, 'no active canvas');
  const board = canvas.board([group('g', 0, 0, 500, 500), image('inside', 10, 50), image('outside', 600, 600)], { selected: ['g'] });
  assert.equal(command('pack-images').checkCallback(true), true);
  assert.equal(command('optimize-groups').checkCallback(true), true);
  board.selection = new Set(['outside']);
  assert.equal(command('optimize-groups').checkCallback(true), false);
  board.readonly = true;
  assert.equal(command('pack-images').checkCallback(true), false);
});

test('targets are the selected images or groups, and a right-clicked card outside the selection replaces it', async () => {
  const { canvas, actions } = await fixture();
  const board = canvas.board([group('g', 0, 0, 500, 500), image('inside', 10, 50), image('outside', 600, 600)], { selected: ['g', 'edge'] });
  assert.deepEqual(actions.targets(board, 'images').map(node => node.id), ['inside']);
  assert.deepEqual(actions.targets(board, 'groups').map(node => node.id), ['g']);
  assert.deepEqual(actions.targets(board, 'images', 'outside').map(node => node.id), ['outside']);
  assert.deepEqual(actions.targets(board, 'groups', 'inside').map(node => node.id), []);
  assert.deepEqual(actions.targets(board, 'groups', 'g').map(node => node.id), ['g']);
});

test('running an image action applies its whole plan, groups included, as one undo step', async () => {
  const { canvas, run } = await fixture();
  const board = canvas.board([group('g', 0, 0, 1000, 1000), image('a', 100, 100), image('b', 300, 400)], { selected: ['g'] });
  await run(board, 'align-images-left');
  assert.equal(board.steps.length, 1);
  assert.deepEqual(board.nodes.map(({ id, x, y, width, height }) => [id, x, y, width, height]), [['g', 80, 60, 140, 460], ['a', 100, 100, 100, 100], ['b', 100, 400, 100, 100]]);
  await run(board, 'align-images-left');
  assert.equal(board.steps.length, 1, 'an action that changes nothing adds no undo step');
});

test('an action stops with a notice when its cards changed, the canvas is read-only, or the canvas changed while measuring', async () => {
  const pending = [];
  const release = () => { for (const resolve of pending.splice(0)) resolve({ width: 100, height: 100 }); };
  const { canvas, actions, run } = await fixture({ load: () => new Promise(resolve => pending.push(resolve)) });
  const board = canvas.board([image('a', 0, 0), image('b', 300, 0)], { selected: ['a', 'b'] });
  const captured = actions.targets(board, 'images');
  board.nodes[0].x = 50;
  const stale = run(board, 'align-images-top', captured);
  release(); await stale;
  assert.equal(lastNotice(), 'The selection changed. Try the action again.');
  board.readonly = true;
  await run(board, 'pack-images');
  assert.equal(lastNotice(), 'This canvas is read-only.');
  board.readonly = false;
  const moved = run(board, 'pack-images');
  board.path = 'Other.canvas';
  release(); await moved;
  assert.equal(lastNotice(), 'The active canvas changed. Try again.');
  assert.equal(board.steps.length, 0);
});

test('repeating a sort reverses it on the same canvas file, but not after the file changes', async () => {
  const { canvas, run } = await fixture();
  const board = canvas.board([image('b', 0, 0), image('a', 0, 200)], { selected: ['b', 'a'] });
  const order = () => [...board.nodes].sort((p, q) => p.y - q.y || p.x - q.x).map(node => node.id);
  await run(board, 'arrange-images-by-name');
  assert.deepEqual(order(), ['a', 'b']);
  await run(board, 'arrange-images-by-name');
  assert.deepEqual(order(), ['b', 'a']);
  board.path = 'Renamed.canvas';
  await run(board, 'arrange-images-by-name');
  assert.deepEqual(order(), ['a', 'b']);
});

test('arranging by addition follows the order cards were first seen, not their drawing order', async () => {
  const { canvas, data, run } = await fixture();
  const board = canvas.board([image('first', 0, 400), { id: 'note', type: 'text', x: 600, y: 0, width: 100, height: 100 }]);
  canvas.open(board);
  canvas.addCard(board, image('second', 0, 200));
  canvas.addCard(board, image('third', 0, 0));
  assert.deepEqual(data.additions('Board.canvas'), ['first', 'second', 'third']);
  board.selection = new Set(['third', 'first', 'second']);
  await run(board, 'arrange-images-by-addition');
  assert.deepEqual(['first', 'second', 'third'].map(id => board.nodes.find(node => node.id === id).y), [0, 110, 220]);
});

test('Optimize group fits only the selected groups, without moving cards', async () => {
  const { canvas, run } = await fixture();
  const board = canvas.board([group('outer', -500, -500, 2000, 2000), group('other', 3000, 0, 500, 500), image('a', 100, 100), image('b', 3100, 100)], { selected: ['outer'] });
  await run(board, 'optimize-groups');
  assert.deepEqual(board.steps, [new Map([['outer', { x: 80, y: 60, width: 140, height: 160 }]])]);
});
