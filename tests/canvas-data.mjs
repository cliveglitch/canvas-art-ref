import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api } from './bundle.mjs';

const image = (id, x = 0, y = 0, width = 100, height = 100) => ({ id, x, y, width, height, type: 'file', file: id + '.png' });

test('selected images include images fully inside selected groups, but not notes, edges or partly overlapping images', () => {
  const group = { id: 'g', type: 'group', x: 0, y: 0, width: 500, height: 500 };
  const nodes = [group, image('inside', 10, 10), image('partial', 450, 450), image('outside', 600, 600), { ...image('note'), file: 'note.md' }];
  assert.deepEqual(api.selectedImages(nodes, new Set(['g', 'outside', 'edge'])).map(n => n.id), ['inside', 'outside']);
  assert.deepEqual(api.selectedImages(nodes, new Set()), []);
});

test('selection order lists selected images first, then group images in reading order, independent of drawing order', () => {
  const nodes = [image('wide', -50, 20, 200, 100), image('tall', 200, -100, 100, 200), image('square', 400, 300, 90, 90)];
  const group = { id: 'g', type: 'group', x: -100, y: -200, width: 1000, height: 1000 };
  assert.deepEqual(api.selectedImages(nodes, new Set(['square', 'wide', 'tall'])).map(node => node.id), ['square', 'wide', 'tall']);
  assert.deepEqual(api.selectedImages([group, ...nodes], new Set(['g'])).map(node => node.id), ['tall', 'wide', 'square']);
  assert.deepEqual(api.selectedImages([group, ...nodes], new Set(['square', 'g'])).map(node => node.id), ['square', 'tall', 'wide']);
});

test('bounds handle more rectangles than a spread call can take', () => {
  assert.equal(api.bounds(Array.from({ length: 200000 }, (_, x) => ({ x, y: 0, width: 1, height: 1 }))).width, 200000);
});
