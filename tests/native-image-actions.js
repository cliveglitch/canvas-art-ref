/* global app, nativeTest -- Obsidian CLI supplies app; tests/native-harness.js supplies nativeTest. */
// All 18 image actions, first/average normalization, native undo/redo, addition order and menus.
nativeTest('image actions', async t => {
  const { check, wait } = t;
  const actions = () => t.plugin()._children.find(child => child.actions).actions;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const near = (a, b) => Math.abs(a - b) < .00001;
  for (const folder of ['A', 'B']) await t.folder(folder);
  const specs = [
    ['a', 'B/zebra10', 400, 200, 300, 300, 180, 90],
    ['b', 'A/apple2', 100, 200, 50, 500, 100, 200],
    ['c', 'B/apple1', 300, 300, 600, 80, 140, 140],
  ];
  const nodes = [{ id: 'group', type: 'group', label: 'Image action checks', x: 0, y: 0, width: 1100, height: 900 }];
  for (const [id, name, width, height, x, y, displayWidth, displayHeight] of specs) {
    const file = await t.create(name + '.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#6f9b9a"/></svg>`);
    nodes.push({ id, type: 'file', file: file.path, x, y, width: displayWidth, height: displayHeight });
  }
  nodes.push({ id: 'context', type: 'text', text: 'Keep this contextual note.', x: 800, y: 500, width: 180, height: 250, color: '3' });
  nodes.push({ id: 'outside', type: 'file', file: nodes[1].file, x: 1500, y: 50, width: 200, height: 100 });
  const path = t.path('Checks.canvas');
  const canvas = await t.open(await t.create('Checks.canvas', JSON.stringify({ nodes, edges: [{ id: 'edge', fromNode: 'a', toNode: 'context', label: 'Retain this connection' }] })));
  const baseline = structuredClone(canvas.getData());
  const selectedIds = ['c', 'a', 'b'];
  const select = ids => canvas.updateSelection(() => { canvas.selection.clear(); for (const id of ids) canvas.selection.add(canvas.nodes.get(id)); });
  const geometry = data => data.nodes.map(({ id, x, y, width, height }) => ({ id, x, y, width, height })).sort((a, b) => a.id.localeCompare(b.id));
  const restore = async (ids = selectedIds) => { canvas.setData(structuredClone(baseline)); await wait(60); canvas.requestPushHistory.run(); select(ids); };
  const definitions = [
    ['pack', 'pack-images'], ['name', 'arrange-images-by-name'], ['path', 'arrange-images-by-path'],
    ['order', 'arrange-images-by-order'], ['addition', 'arrange-images-by-addition'], ['random', 'arrange-images-randomly'],
    ['left', 'align-images-left'], ['right', 'align-images-right'], ['top', 'align-images-top'], ['bottom', 'align-images-bottom'],
    ['stack', 'stack-images'], ['horizontal', 'distribute-images-horizontal'], ['vertical', 'distribute-images-vertical'],
    ['height', 'match-image-height'], ['width', 'match-image-width'], ['size', 'match-image-size'], ['area', 'match-image-area'], ['scale', 'normalize-image-scale'],
  ];
  await actions().setSource('average');
  for (const [action, command] of definitions) {
    await restore();
    const before = structuredClone(canvas.getData()), current = canvas.history.current;
    check(app.commands.commands['canvas-art-ref-plugin:' + command]?.checkCallback(true), action + ': native command available');
    await actions().run(canvas, action);
    const after = structuredClone(canvas.getData());
    check(canvas.history.current === current + 1, action + ': exactly one undo step');
    check(same(after.edges, before.edges), action + ': connection retained');
    for (const id of ['context', 'outside']) check(same(after.nodes.find(node => node.id === id), before.nodes.find(node => node.id === id)), action + ': ' + id + ' retained');
    for (const [id, , width, height] of specs) {
      const rect = canvas.nodes.get(id).getData();
      check(Math.abs(rect.width - rect.height * width / height) <= .51 * (1 + width / height), action + ': proportions retained for ' + id);
    }
    if (action === 'stack') check(same(after.nodes.map(node => node.id), before.nodes.map(node => node.id)), 'Stack retains native layer order');
    canvas.undo(); check(same(geometry(canvas.getData()), geometry(before)), action + ': one undo restores layout');
    canvas.redo(); check(same(geometry(canvas.getData()), geometry(after)), action + ': one redo restores layout');
  }
  await actions().setSource('first');
  for (const mode of ['height', 'width', 'size', 'area', 'scale']) {
    await restore(['context', 'b', 'c', 'a']);
    const reference = structuredClone(canvas.nodes.get('b').getData());
    await actions().run(canvas, mode);
    check(same(canvas.nodes.get('b').getData(), reference), mode + ': first selected image stays the reference');
    const measures = specs.map(([id, , sourceWidth]) => {
      const rect = canvas.nodes.get(id).getData();
      return mode === 'size' ? Math.max(rect.width, rect.height) : mode === 'area' ? rect.width * rect.height : mode === 'scale' ? rect.width / sourceWidth : rect[mode];
    });
    check(measures.every((value, index) => Math.abs(value - measures[0]) <= (mode === 'area'
      ? canvas.nodes.get(specs[index][0]).getData().width + canvas.nodes.get(specs[index][0]).getData().height + 1
      : mode === 'scale' ? .6 * (1 / specs[index][2] + 1 / specs[0][2]) : 1.01)), mode + ': from-first target applied to all images');
  }
  await restore(['group']);
  await actions().run(canvas, 'height');
  check(near(canvas.nodes.get('a').getData().height, 140), 'Group normalization uses the first image in reading order');
  check(same(canvas.nodes.get('context').getData(), baseline.nodes.find(node => node.id === 'context')), 'Selected group keeps its contextual note unchanged');
  await restore();
  await actions().run(canvas, 'name');
  const visualOrder = () => ['a', 'b', 'c'].sort((a, b) => canvas.nodes.get(a).getData().y - canvas.nodes.get(b).getData().y || canvas.nodes.get(a).getData().x - canvas.nodes.get(b).getData().x);
  check(same(visualOrder(), ['c', 'b', 'a']), 'Name arrangement uses natural filename order');
  await actions().run(canvas, 'name'); check(same(visualOrder(), ['a', 'b', 'c']), 'Repeating a sort reverses its order');
  const recorded = t.additionOrder(path);
  check(same(recorded.filter(id => selectedIds.includes(id)), ['a', 'b', 'c']), 'Addition order tracks native node insertion');
  await t.plugin().saveSettings();
  await app.plugins.disablePlugin('canvas-art-ref-plugin');
  const nativeAdd = canvas.addNode;
  await app.plugins.enablePlugin('canvas-art-ref-plugin');
  check(same(t.additionOrder(path), recorded), 'Addition order survives plugin reload');
  check(t.sizeSource() === 'first', 'Normalization source survives plugin reload');
  await restore();
  canvas.nodes.get('a').updateZIndex();
  await actions().run(canvas, 'addition');
  check(same(visualOrder(), ['a', 'b', 'c']), 'Addition arrangement ignores changed native layer order');
  await app.plugins.disablePlugin('canvas-art-ref-plugin');
  check(canvas.addNode === nativeAdd, 'Unloading restores native node creation');
  await app.plugins.enablePlugin('canvas-art-ref-plugin');
  await restore(['group']);
  canvas.nodes.get('group').attach(); canvas.nodes.get('group').render();
  let menu;
  const reference = app.workspace.on('canvas:node-menu', (value, node) => { if (node.id === 'group') menu = value; });
  try { canvas.nodes.get('group').nodeEl.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 500, clientY: 250 })); }
  finally { app.workspace.offref(reference); }
  try {
    const title = item => item.titleEl?.innerText || item.title;
    const rootTitles = menu.items.map(title);
    for (const [label, expected] of [['Arrange images', 6], ['Align images', 7], ['Normalize images', 8]]) {
      const item = menu.items.find(item => title(item) === label);
      check(rootTitles.filter(value => value === label).length === 1, label + ': appears once');
      check(item.submenu.items.filter(item => title(item)).length === expected, label + ': contains all expected controls');
    }
    check(rootTitles.includes('Zoom to selection') && rootTitles.includes('Edit label') && rootTitles.includes('Remove'), 'All native group menu entries retained');
    await wait(30);
  } finally { menu?.hide(); }
  canvas.setReadonly(true);
  check(definitions.every(([, id]) => !app.commands.commands['canvas-art-ref-plugin:' + id].checkCallback(true)), 'Read-only mode disables all 18 image commands');
  canvas.setReadonly(false); select([]);
  check(definitions.every(([, id]) => !app.commands.commands['canvas-art-ref-plugin:' + id].checkCallback(true)), 'All image commands remain selection-based');
});
