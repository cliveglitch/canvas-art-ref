import assert from 'node:assert/strict';
import { test } from 'node:test';

export function checkGroupActions(api, image) {
  const group = (id, x, y, width, height) => ({ id, type: 'group', label: id, color: '4', x, y, width, height });
  const fixture = () => {
    const data = {
      nodes: [group('outer', -500, -400, 1600, 1400), image('left', -125.25, 50.5, 90.5, 110.25),
        image('right', 320.75, -120.5, 180.5, 90), { id: 'note', type: 'text', text: 'Keep me', x: 550, y: 370, width: 160, height: 120 },
        group('inner', 100, 100, 400, 200), image('outside', 1400, 0), image('partial', 1000, 20, 200, 100)],
      edges: [{ id: 'edge', fromNode: 'left', toNode: 'note', label: 'Keep this edge' }], custom: 'keep',
    };
    const calls = [];
    const nodes = new Map(data.nodes.map(node => [node.id, { id: node.id, getData: () => node, setData: value => Object.assign(node, value) }]));
    const canvas = {
      readonly: false, nodes, selection: new Set([nodes.get('outer')]), getData: () => structuredClone(data),
      requestPushHistory: { run: () => calls.push('flush') }, markMoved: node => calls.push('move:' + node.id),
      updateSelection: update => update(), requestSave: history => calls.push(['save', history]), pushHistory: snapshot => calls.push(['history', snapshot]),
    };
    return { canvas, data, calls };
  };

  test('group selection respects a right-clicked group and excludes images and edges', () => {
    const { canvas } = fixture();
    canvas.selection = new Set([canvas.nodes.get('outer'), canvas.nodes.get('left'), { id: 'edge' }]);
    assert.deepEqual(api.groupSelection(canvas).map(node => node.id), ['outer']);
    assert.deepEqual(api.groupSelection(canvas, canvas.nodes.get('inner')).map(node => node.id), ['inner']);
    assert.deepEqual(api.groupSelection(canvas, canvas.nodes.get('left')).map(node => node.id), ['outer']);
    canvas.selection.clear();
    assert.deepEqual(api.groupSelection(canvas, canvas.nodes.get('left')), []);
  });

  test('optimization fits scattered contents with outward padding, retaining cards, metadata, edges and unselected groups', () => {
    const { canvas, data, calls } = fixture();
    const before = structuredClone(data);
    api.optimizeGroups(canvas);
    assert.deepEqual(data.nodes[0], { ...before.nodes[0], x: -146, y: -161, width: 876, height: 671 });
    assert.deepEqual(data.nodes.slice(1), before.nodes.slice(1));
    assert.deepEqual(data.edges, before.edges);
    assert.equal(data.custom, before.custom);
    assert.deepEqual(calls.filter(call => typeof call === 'string'), ['flush', 'move:outer']);
    assert.equal(calls.filter(call => call[0] === 'history').length, 1);
    assert.deepEqual(calls.find(call => call[0] === 'save'), ['save', false]);
    calls.length = 0;
    api.optimizeGroups(canvas);
    assert.deepEqual(calls, [], 'Repeating optimization must not add an undo step');
  });

  test('nested selected groups fit from the inside out independently of selection order', () => {
    const nodes = [group('parent', -500, -500, 2000, 2000), group('child', -100, -100, 900, 900), image('a', 100, 100, 100, 100)];
    const before = structuredClone(nodes);
    const result = api.optimizedGroupBounds(nodes, nodes.slice(0, 2));
    assert.deepEqual(result.get('child'), { x: 80, y: 60, width: 140, height: 160 });
    assert.deepEqual(result.get('parent'), { x: 60, y: 20, width: 180, height: 220 });
    assert.deepEqual(api.optimizedGroupBounds(nodes, [nodes[1], nodes[0]]), result);
    assert.deepEqual(nodes, before);
  });

  test('unselected nested group boundaries and notes count as contents even without images', () => {
    const nodes = [group('parent', 0, 0, 1000, 1000), group('child', 200, 300, 400, 200)];
    assert.deepEqual(api.optimizedGroupBounds(nodes, [nodes[0]]).get('parent'), { x: 180, y: 260, width: 440, height: 260 });
    nodes[1] = { ...nodes[1], type: 'text', text: 'Only a note' };
    assert.deepEqual(api.optimizedGroupBounds(nodes, [nodes[0]]).get('parent'), { x: 180, y: 260, width: 440, height: 260 });
  });

  test('empty groups and coextensive peer groups do not grow or create history', () => {
    const { canvas, data, calls } = fixture();
    data.nodes = [data.nodes[0]];
    api.optimizeGroups(canvas);
    assert.deepEqual(calls, []);
    const peers = [group('a', 0, 0, 500, 500), group('b', 0, 0, 500, 500)];
    assert.equal(api.optimizedGroupBounds(peers, peers).size, 0);
    const nodes = [...peers, image('image', 100, 100)];
    const fitted = api.optimizedGroupBounds(nodes, peers);
    assert.deepEqual(fitted.get('a'), fitted.get('b'));
    assert.deepEqual(api.optimizedGroupBounds(nodes.map(node => ({ ...node, ...fitted.get(node.id) })), peers.map(node => ({ ...node, ...fitted.get(node.id) }))), fitted);
  });

  test('multiple selected groups share one history step and retain nested image positions', () => {
    const { canvas, data, calls } = fixture();
    data.nodes.push(image('inner-image', 200, 180, 100, 80));
    const before = structuredClone(data);
    canvas.selection.add(canvas.nodes.get('inner'));
    api.optimizeGroups(canvas);
    assert.equal(calls.filter(call => call[0] === 'history').length, 1);
    assert.deepEqual(data.nodes.filter(node => node.type !== 'group'), before.nodes.filter(node => node.type !== 'group'));
    assert.deepEqual(data.nodes[4], { ...before.nodes[4], x: 180, y: 140, width: 140, height: 140 });
  });

  test('group optimization can expand for padding when contents touch the boundary', () => {
    const nodes = [group('g', 0, 0, 100, 100), image('a', 0, 0, 100, 100)];
    assert.deepEqual(api.optimizedGroupBounds(nodes, [nodes[0]]).get('g'), { x: -20, y: -40, width: 140, height: 160 });
  });

  test('read-only canvases, stale groups and non-group selections are rejected without changes', () => {
    const { canvas, data, calls } = fixture();
    const selected = api.groupSelection(canvas);
    data.nodes[0].width++;
    assert.throws(() => api.optimizeGroups(canvas, selected), /selection changed/);
    canvas.readonly = true;
    assert.throws(() => api.optimizeGroups(canvas), /read-only/);
    canvas.readonly = false;
    canvas.selection = new Set([canvas.nodes.get('left')]);
    assert.throws(() => api.optimizeGroups(canvas), /Select at least one group/);
    assert.deepEqual(calls, []);
  });
}
