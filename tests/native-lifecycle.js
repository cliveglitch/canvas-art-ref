/* global app -- Obsidian CLI supplies the application object to native integration tests. */
(async () => {
  const state = window.canvasArtRefSmoke, canvas = state.leaf.view.canvas, checks = [];
  const check = (value, label) => { if (!value) throw new Error(label); checks.push(label); };
  state.menu?.hide();
  await app.plugins.disablePlugin('canvas-art-ref-plugin');
  const nativeImport = app.importAttachments;
  const nativeParent = app.fileManager.getNewFileParent;
  const nativeCreation = canvas.showCreationMenu;
  const canvasParent = app.fileManager.getNewFileParent(state.path, 'Another.canvas').path;
  check(!app.commands.commands['canvas-art-ref-plugin:pack-images'], 'Disabling removes plugin commands');
  await app.plugins.enablePlugin('canvas-art-ref-plugin');
  check(app.fileManager.getNewFileParent(state.path, 'Another.canvas').path === canvasParent, 'Creating another native canvas keeps its normal destination');
  check(app.fileManager.getNewFileParent(state.path, 'Character.v2').path === state.root + '/Notes', 'Dotted Markdown note names use the notes destination');
  await app.plugins.disablePlugin('canvas-art-ref-plugin');
  check(app.importAttachments === nativeImport && app.fileManager.getNewFileParent === nativeParent && canvas.showCreationMenu === nativeCreation, 'Unloading restores native import, note-folder and menu methods');
  await app.plugins.enablePlugin('canvas-art-ref-plugin');
  check(Object.keys(app.commands.commands).filter(id => id.startsWith('canvas-art-ref-plugin:')).length === 21, 'Reloading registers each command once');
  canvas.selectOnly(canvas.nodes.get('demo-group'));
  const reference = app.workspace.on('canvas:node-menu', (menu, node) => {
    if (node.id === 'demo-group') { state.menu = menu; app.workspace.offref(reference); }
  });
  canvas.nodes.get('demo-group').nodeEl.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 550, clientY: 250 }));
  const titles = state.menu.items.map(item => item.titleEl?.innerText || item.title);
  check(['Arrange images', 'Align images', 'Normalize images'].every(label => titles.filter(title => title === label).length === 1), 'Reloading adds image menus exactly once');
  check(titles.includes('Zoom to selection') && titles.includes('Edit label') && titles.includes('Remove'), 'Native group menu actions remain available');
  state.menu.hide();
  state.lifecycle = checks;
  return JSON.stringify({ passed: checks });
})().catch(error => { window.canvasArtRefSmoke.lifecycleFailure = error.message; throw error; })
