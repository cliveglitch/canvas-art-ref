/* global app -- Obsidian CLI supplies the application object to native integration tests. */
(async () => {
  const state = window.canvasArtRefSmoke, canvas = state.leaf.view.canvas, checks = [];
  const check = (value, label) => { if (!value) throw new Error(label); checks.push(label); };
  const clean = structuredClone(state.before);
  clean.nodes.find(node => node.id === 'demo-group').label = 'References';
  const context = clean.nodes.find(node => node.id === 'demo-context');
  context.text = '## Canvas Art Ref\n\nSelect images, or the References group, then right-click.\n\n- Arrange images: Optimal, name, path, order, addition, random\n- Align images: Edges, stack, rows and columns\n- Normalize images: First-selected or average sizing\n\nNative undo and redo work normally.\n\nRight-click empty space to choose Canvas folders or create a Markdown note. Native Canvas notes, groups and connections remain available.';
  canvas.setData(clean); canvas.requestSave(); canvas.requestPushHistory.run();
  canvas.selectOnly(canvas.nodes.get('demo-group'));
  const before = structuredClone(canvas.nodes.get('demo-image-0').getData());
  let previous = new Set(document.querySelectorAll('.modal-container'));
  app.commands.commands['canvas-art-ref-plugin:scale-images'].checkCallback(false);
  let modal = [...document.querySelectorAll('.modal-container')].find(element => !previous.has(element));
  check(!!modal && modal.querySelector('.modal-title').innerText === 'Scale selected images', 'Scale command opens its own dialog');
  const scaleInput = modal.querySelector('input'); scaleInput.value = '200'; scaleInput.dispatchEvent(new Event('input', { bubbles: true }));
  modal.querySelector('button.mod-cta').click();
  check(canvas.nodes.get('demo-image-0').getData().width === before.width * 2, 'Scale dialog applies the entered percentage');
  canvas.undo();
  check(canvas.nodes.get('demo-image-0').getData().width === before.width, 'Scale dialog action is one native undo step');
  previous = new Set(document.querySelectorAll('.modal-container'));
  app.commands.commands['canvas-art-ref-plugin:create-note'].checkCallback(false);
  modal = [...document.querySelectorAll('.modal-container')].find(element => !previous.has(element));
  check(!!modal && modal.querySelector('.modal-title').innerText === 'Create note in canvas', 'Create-note command opens its own dialog');
  const nameInput = modal.querySelector('input'); nameInput.value = 'Board notes'; nameInput.dispatchEvent(new Event('input', { bubbles: true }));
  modal.querySelector('button.mod-cta').click();
  const path = state.root + '/Notes/Board notes.md';
  let note;
  for (let attempt = 0; attempt < 60; attempt++) {
    note = [...canvas.nodes.values()].find(node => node.getData().file === path);
    if (note) break;
    await new Promise(resolve => window.setTimeout(resolve, 50));
  }
  check(!!note, 'Create-note dialog saves a Markdown file directly in the configured folder');
  await app.vault.modify(app.vault.getAbstractFileByPath(path), 'This is a regular Markdown note in the board\'s configured Notes folder.\n\nPaste or drop an image onto this canvas to save it in Imported images. Existing vault images are reused in place.');
  note.setData({ ...note.getData(), x: 1400, y: 650, width: 420, height: 280 }); canvas.markMoved(note);
  context.text = clean.nodes.find(node => node.id === 'demo-context').text;
  canvas.nodes.get('demo-context').setData({ ...canvas.nodes.get('demo-context').getData(), text: context.text });
  canvas.selectOnly(canvas.nodes.get('demo-group'));
  app.commands.commands['canvas-art-ref-plugin:pack-images'].checkCallback(false);
  await new Promise(resolve => window.setTimeout(resolve, 350));
  // Keep the demo frame close to its artwork; users can resize native groups normally.
  const images = [...canvas.nodes.values()].filter(node => node.id.startsWith('demo-image')).map(node => node.getData());
  const right = Math.max(...images.map(node => node.x + node.width)) + 30;
  const bottom = Math.max(...images.map(node => node.y + node.height)) + 30;
  const group = canvas.nodes.get('demo-group'); group.setData({ ...group.getData(), width: right, height: bottom }); canvas.markMoved(group);
  canvas.nodes.get('demo-context').setData({ ...canvas.nodes.get('demo-context').getData(), x: right + 80, y: 40, width: 420, height: 450 });
  note.setData({ ...note.getData(), x: right + 80, y: 550 }); canvas.markMoved(note);
  canvas.requestSave(); canvas.requestPushHistory.run(); canvas.zoomToFit();
  state.dialogs = checks;
  return JSON.stringify({ passed: checks });
})().catch(error => { window.canvasArtRefSmoke.dialogFailure = error.message; throw error; })
