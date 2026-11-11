import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api } from './bundle.mjs';

const image = (id, x = 0, y = 0, width = 100, height = 100) => ({ id, x, y, width, height, type: 'file', file: id + '.png' });
const group = (id, x, y, width, height) => ({ id, type: 'group', label: id, color: '4', x, y, width, height });

function fixture() {
  const data = {
    nodes: [group('outer', -500, -400, 1600, 1400), image('left', -125, 50), { id: 'note', type: 'text', text: 'Keep me', x: 550, y: 370, width: 160, height: 120, custom: 'keep' }, group('inner', 100, 100, 400, 200)],
    edges: [{ id: 'edge', fromNode: 'left', toNode: 'note', label: 'Keep this edge' }], custom: { untouched: true },
  };
  const calls = [];
  const nodes = new Map(data.nodes.map(node => [node.id, { id: node.id, getData: () => node, setData: value => Object.assign(node, value) }]));
  const canvas = {
    readonly: false, nodes, selection: new Set([nodes.get('outer')]), getData: () => structuredClone(data),
    requestPushHistory: { run: () => calls.push('flush') }, markMoved: node => calls.push('move:' + node.id),
    updateSelection: update => update(), requestSave: history => calls.push(['save', history]), pushHistory: snapshot => calls.push(['history', snapshot]),
  };
  return { canvas, data, calls };
}

test('group selection respects a right-clicked group and excludes images and edges', () => {
  const { canvas } = fixture();
  canvas.selection = new Set([canvas.nodes.get('outer'), canvas.nodes.get('left'), { id: 'edge' }]);
  assert.deepEqual(api.groupSelection(canvas).map(node => node.id), ['outer']);
  assert.deepEqual(api.groupSelection(canvas, canvas.nodes.get('inner')).map(node => node.id), ['inner']);
  assert.deepEqual(api.groupSelection(canvas, canvas.nodes.get('left')).map(node => node.id), ['outer']);
  canvas.selection.clear();
  assert.deepEqual(api.groupSelection(canvas, canvas.nodes.get('left')), []);
});

test('applying a layout is one history step that keeps edges, notes and custom data', () => {
  const { canvas, data, calls } = fixture();
  const before = structuredClone(data);
  api.applyLayout(canvas, new Map([['left', { x: 0, y: 0, width: 300, height: 100 }], ['inner', { x: 100, y: 100, width: 400, height: 200 }], ['outer', { x: -20, y: -40, width: 340, height: 160 }]]));
  assert.deepEqual(data.nodes[1], { ...before.nodes[1], x: 0, y: 0, width: 300 });
  assert.deepEqual(data.nodes[0], { ...before.nodes[0], x: -20, y: -40, width: 340, height: 160 });
  assert.deepEqual(data.nodes.slice(2), before.nodes.slice(2));
  assert.deepEqual(data.edges, before.edges);
  assert.deepEqual(data.custom, before.custom);
  assert.deepEqual(calls.filter(call => typeof call === 'string'), ['flush', 'move:left', 'move:outer']);
  assert.equal(calls.filter(call => call[0] === 'history').length, 1);
  assert.deepEqual(calls.find(call => call[0] === 'save'), ['save', false]);
  calls.length = 0;
  api.applyLayout(canvas, new Map([['left', { x: 0, y: 0, width: 300, height: 100 }]]));
  assert.deepEqual(calls, [], 'Unchanged bounds must not add an undo step');
});

test('read-only canvases are not changed', () => {
  const { canvas, calls } = fixture();
  canvas.readonly = true;
  assert.throws(() => api.applyLayout(canvas, new Map([['left', { x: 500, y: 0, width: 100, height: 100 }]])), /read-only/);
  assert.deepEqual(calls, []);
});
