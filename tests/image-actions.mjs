import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api } from './bundle.mjs';

const { ImageActions, sections } = api;
const image = (id, x = 0, y = 0) => ({ id, x, y, width: 100, height: 100, type: 'file', file: id + '.png' });

test('the catalog offers every image action and Optimize group as one command each, in menu order', () => {
  const actions = new ImageActions({}, {}, {});
  assert.deepEqual(actions.entries.map(entry => entry.id), [
    'pack-images', 'arrange-images-by-name', 'arrange-images-by-path', 'arrange-images-by-order', 'arrange-images-by-addition', 'arrange-images-randomly',
    'align-images-left', 'align-images-right', 'align-images-top', 'align-images-bottom', 'stack-images', 'distribute-images-horizontal', 'distribute-images-vertical',
    'match-image-height', 'match-image-width', 'match-image-size', 'match-image-area', 'normalize-image-scale', 'scale-images', 'optimize-groups',
  ]);
  assert.deepEqual(sections.map(section => [section.title, section.entries.length]), [['Arrange images', 6], ['Align images', 7], ['Normalize images', 6]]);
  assert.deepEqual(actions.commands().map(command => command.id), actions.entries.map(entry => entry.id));
});

test('actions are available on an editable canvas with selected images or groups, and a right-clicked card wins', () => {
  const actions = new ImageActions({}, {}, {});
  const nodes = [{ id: 'g', type: 'group', x: 0, y: 0, width: 500, height: 500 }, image('inside', 10, 10), image('outside', 600, 600)];
  const canvas = { readonly: false, selection: new Set([{ id: 'g' }]), getData: () => ({ nodes, edges: [] }) };
  assert.equal(actions.available(canvas, 'images'), true);
  assert.equal(actions.available(canvas, 'groups'), true);
  assert.deepEqual(actions.targets(canvas, 'images').map(node => node.id), ['inside']);
  assert.deepEqual(actions.targets(canvas, 'images', { id: 'outside' }).map(node => node.id), ['outside']);
  assert.equal(actions.available(canvas, 'groups', { id: 'outside' }), false);
  canvas.readonly = true;
  assert.equal(actions.available(canvas, 'images'), false);
  assert.equal(actions.available(undefined, 'images'), false);
});
