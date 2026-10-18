/* global app -- Verify group optimization on a temporary native Canvas, then clean it up. */
(async () => {
  const root = 'Canvas Art Ref group checks ' + Date.now();
  const path = root + '/Groups.canvas';
  const previousLeaf = app.workspace.activeLeaf;
  const checks = [];
  const check = (condition, label) => { if (!condition) throw new Error(label); checks.push(label); };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const wait = delay => new Promise(resolve => window.setTimeout(resolve, delay));
  const plugin = app.plugins.plugins['canvas-art-ref-plugin'];
  const integration = plugin._children.find(child => child.actions);
  const command = app.commands.commands['canvas-art-ref-plugin:optimize-groups'];
  const adapter = app.vault.adapter;
  const base = adapter.getFullPath('').replaceAll('\\', '/').replace(/\/$/, '');
  const resolved = adapter.getFullPath(root).replaceAll('\\', '/');
  if (!/^Canvas Art Ref group checks \d+$/.test(root) || resolved.toLowerCase() !== (base + '/' + root).toLowerCase()) throw new Error('Unexpected scratch-folder path.');
  let leaf, canvas, menu;
  window.canvasArtRefGroupChecks = { root, path, phase: 'setup', checks };
  try {
    await app.vault.createFolder(root);
    await app.vault.create(root + '/Image.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="100%" height="100%" fill="#6f9b9a"/></svg>');
    const nodes = [
      { id: 'group', type: 'group', label: 'Optimize checks', color: '4', x: -500, y: -400, width: 1600, height: 1400 },
      { id: 'a', type: 'file', file: root + '/Image.svg', x: -125, y: 50, width: 100, height: 100 },
      { id: 'b', type: 'file', file: root + '/Image.svg', x: 320, y: -120, width: 180, height: 90 },
      { id: 'note', type: 'text', text: 'Keep this note and connection.', x: 550, y: 370, width: 160, height: 120 },
      { id: 'inner', type: 'group', label: 'Nested group', x: 100, y: 100, width: 400, height: 200 },
      { id: 'nested-image', type: 'file', file: root + '/Image.svg', x: 200, y: 180, width: 100, height: 80 },
      { id: 'outside', type: 'file', file: root + '/Image.svg', x: 1400, y: 0, width: 200, height: 100 },
      { id: 'empty', type: 'group', label: 'Empty group', x: 1800, y: 0, width: 300, height: 300 },
    ];
    const file = await app.vault.create(path, JSON.stringify({ nodes, edges: [{ id: 'edge', fromNode: 'a', toNode: 'note', label: 'Keep this edge' }] }));
    leaf = app.workspace.getLeaf('tab');
    await leaf.openFile(file); app.workspace.setActiveLeaf(leaf, { focus: true });
    await wait(100);
    canvas = leaf.view.canvas;
    const baseline = structuredClone(canvas.getData());
    const select = ids => canvas.updateSelection(() => { canvas.selection.clear(); for (const id of ids) canvas.selection.add(canvas.nodes.get(id)); });
    const rect = id => { const { x, y, width, height } = canvas.nodes.get(id).getData(); return { x, y, width, height }; };
    const restore = async ids => { canvas.setData(structuredClone(baseline)); await wait(60); canvas.requestPushHistory.run(); select(ids); };
    const menuTitles = value => value.items.map(item => item.titleEl?.innerText || item.title);
    const nodeMenu = id => {
      canvas.nodes.get(id).attach(); canvas.nodes.get(id).render();
      const ref = app.workspace.on('canvas:node-menu', (value, node) => { if (node.id === id) menu = value; });
      try { canvas.nodes.get(id).nodeEl.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 500, clientY: 250 })); }
      finally { app.workspace.offref(ref); }
      check(!!menu, id + ': native node menu received');
      return menu;
    };
    window.canvasArtRefGroupChecks.phase = 'single group';
    await restore(['group']);
    check(command?.checkCallback(true), 'Optimize command is available for a selected group');
    const before = structuredClone(canvas.getData()), history = canvas.history.current;
    nodeMenu('group');
    const Menu = menu.constructor;
    check(menuTitles(menu).filter(title => title === 'Optimize group').length === 1, 'Group menu offers Optimize group exactly once');
    check(['Edit label', 'Remove', 'Zoom to selection'].every(title => menuTitles(menu).includes(title)), 'Native group menu actions remain available');
    const item = menu.items.find(item => (item.titleEl?.innerText || item.title) === 'Optimize group');
    item.dom.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await wait(40); menu.hide(); menu = undefined;
    const after = structuredClone(canvas.getData());
    check(same(rect('group'), { x: -145, y: -160, width: 875, height: 670 }), 'Menu action fits scattered images, notes and nested groups with padding');
    check(same(after.nodes.filter(node => node.id !== 'group'), before.nodes.filter(node => node.id !== 'group')), 'All images and unselected groups retain their exact data');
    check(same(after.edges, before.edges), 'Connections retain their exact data');
    check(canvas.history.current === history + 1, 'Optimization is exactly one native undo step');
    canvas.undo(); check(same(canvas.getData(), before), 'One undo restores the full canvas');
    canvas.redo(); check(same(canvas.getData(), after), 'One redo restores optimized group bounds');
    integration.optimize();
    check(canvas.history.current === history + 1, 'Repeating optimization creates no extra undo step');

    window.canvasArtRefGroupChecks.phase = 'multiple groups';
    await restore(['group', 'inner']);
    const multiBefore = structuredClone(canvas.getData()), multiHistory = canvas.history.current;
    const selectionMenu = new Menu();
    app.workspace.trigger('canvas:selection-menu', selectionMenu, canvas);
    check(menuTitles(selectionMenu).filter(title => title === 'Optimize groups').length === 1, 'Selection menu offers Optimize groups exactly once');
    check(command.checkCallback(false), 'Command executes for selected nested groups');
    const multiAfter = structuredClone(canvas.getData());
    check(same(rect('inner'), { x: 180, y: 140, width: 140, height: 140 }), 'Selected nested group fits its image with padding');
    check(same(rect('group'), { x: -145, y: -160, width: 875, height: 670 }), 'Parent group includes all final contents');
    check(same(multiAfter.nodes.filter(node => node.type !== 'group'), multiBefore.nodes.filter(node => node.type !== 'group')), 'Multiple-group optimization preserves all card data');
    check(canvas.history.current === multiHistory + 1, 'Multiple groups share one undo step');
    canvas.undo(); check(same(canvas.getData(), multiBefore), 'One undo restores both groups');
    canvas.redo(); check(same(canvas.getData(), multiAfter), 'One redo restores both groups');

    await restore(['a']);
    check(!command.checkCallback(true), 'Image-only selections do not enable Optimize');
    nodeMenu('a'); check(!menuTitles(menu).some(title => /^Optimize groups?$/.test(title)), 'Image menu does not offer Optimize');
    menu.hide(); menu = undefined;
    select(['empty']);
    const emptyBefore = structuredClone(canvas.getData()), emptyHistory = canvas.history.current;
    command.checkCallback(false);
    check(same(canvas.getData(), emptyBefore) && canvas.history.current === emptyHistory, 'Empty groups remain unchanged without an undo step');
    select(['group']); canvas.setReadonly(true);
    check(!command.checkCallback(true), 'Read-only mode disables Optimize');
    integration.optimize(); check(same(canvas.getData(), emptyBefore), 'Read-only mode prevents resizing');
    canvas.setReadonly(false);
    select([]); check(!command.checkCallback(true), 'Empty selection disables Optimize');

    const report = { checks: checks.length, passed: checks };
    window.canvasArtRefGroupChecks.report = report;
    const output = plugin.manifest.dir + '/output';
    if (!await app.vault.adapter.exists(output)) await app.vault.adapter.mkdir(output);
    await app.vault.adapter.write(output + '/group-action-checks.json', JSON.stringify(report, null, 2));
    return JSON.stringify({ passed: checks.length });
  } finally {
    menu?.hide();
    if (canvas?.readonly) canvas.setReadonly(false);
    if (leaf?.view?.containerEl?.isConnected) { await leaf.view.save(); leaf.detach(); }
    await wait(100);
    const expected = new Set([path, root + '/Image.svg']);
    const files = app.vault.getFiles().filter(file => file.path.startsWith(root + '/'));
    if (files.every(file => expected.has(file.path))) {
      const folder = app.vault.getAbstractFileByPath(root);
      if (folder) await app.vault.delete(folder, true);
      delete plugin.settings.imageOrder[path]; delete plugin.settings.canvases[path];
      await plugin.saveSettings();
      window.canvasArtRefGroupChecks.cleaned = true;
    }
    if (previousLeaf?.view?.containerEl?.isConnected) app.workspace.setActiveLeaf(previousLeaf, { focus: true });
  }
})().catch(error => { window.canvasArtRefGroupChecks.failure = error.message; throw error; })
