/* global app, nativeTest -- Obsidian CLI supplies app; tests/native-harness.js supplies nativeTest. */
// Commands, imports, notes, dialogs and reloading on a board of ordinary Canvas cards.
nativeTest('smoke', async t => {
  const { check, until } = t;
  for (const folder of ['Images', 'Imported images', 'Notes']) await t.folder(folder);
  const studies = [
    ['Warm light', 480, 270, '#eac191', '<path d="M0 270 170 80 310 270Z" fill="#6c7772"/><circle cx="370" cy="65" r="35" fill="#fff0c2"/>'],
    ['Character silhouette', 240, 480, '#a4b8b2', '<circle cx="120" cy="125" r="58" fill="#384652"/><path d="M30 430Q25 220 120 210Q215 220 210 430Z" fill="#384652"/>'],
    ['Forest shapes', 480, 320, '#bdcabc', '<path d="m70 270 60-210 60 210Zm130 0 80-260 80 260Zm150 0 50-170 50 170Z" fill="#4d6d61"/>'],
    ['Color study', 360, 360, '#ddc8b0', '<rect x="30" y="30" width="140" height="140" fill="#c77868"/><rect x="190" y="190" width="140" height="140" fill="#7f8d70"/>'],
    ['Sprite study', 160, 240, '#c8b6cd', '<path d="M60 40h40v20h20v40h-20v20h20v60h-20v40H80v-40H60v40H40v-60h20v-40H40V80h20Z" fill="#4c4667"/>'],
    ['Cloud forms', 480, 220, '#9fb9cc', '<path d="M40 150a40 40 0 0 1 40-40 65 65 0 0 1 125-15 40 40 0 0 1 65 55Z" fill="#f4eee5"/>'],
  ];
  const nodes = [{ id: 'demo-group', type: 'group', label: 'References', x: 0, y: 0, width: 1320, height: 900 }];
  for (let index = 0; index < studies.length; index++) {
    const [name, width, height, color, shapes] = studies[index];
    const file = await t.create('Images/' + name + '.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${color}"/>${shapes}</svg>`);
    nodes.push({ id: 'demo-image-' + index, type: 'file', file: file.path, x: 40 + index % 3 * 420, y: 80 + Math.floor(index / 3) * 390, width: 320, height: 320 });
  }
  nodes.push({ id: 'demo-context', type: 'text', text: 'Context for the references.', x: 1400, y: 60, width: 420, height: 520 });
  const path = t.path('Demo.canvas'), imagesFolder = t.path('Imported images'), notesFolder = t.path('Notes');
  const file = await t.create('Demo.canvas', JSON.stringify({ nodes, edges: [{ id: 'demo-edge', fromNode: 'demo-image-0', fromSide: 'right', toNode: 'demo-context', toSide: 'left', label: 'Lighting and mood' }] }));
  await t.canvasFolders(path, { images: imagesFolder, notes: notesFolder });
  const canvas = await t.open(file);
  const geometry = data => data.nodes.map(({ id, x, y, width, height }) => ({ id, x, y, width, height })).sort((a, b) => a.id.localeCompare(b.id));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const command = id => app.commands.commands['canvas-art-ref:' + id];
  const newModal = previous => [...document.querySelectorAll('.modal-container')].find(element => !previous.has(element));

  // Layout commands and native history.
  canvas.requestPushHistory.run();
  const before = structuredClone(canvas.getData());
  const historyBefore = canvas.history.current;
  canvas.selectOnly(canvas.nodes.get('demo-group'));
  check(app.commands.executeCommandById('canvas-art-ref:pack-images'), 'Native selection command available');
  await until(() => canvas.history.current > historyBefore);
  const packed = structuredClone(canvas.getData());
  check(canvas.history.current === historyBefore + 1, 'Packing creates exactly one native undo step');
  check(same(packed.edges, before.edges), 'Connections and their properties retained');
  check(same(packed.nodes.find(n => n.id === 'demo-context'), before.nodes.find(n => n.id === 'demo-context')), 'Contextual text card retained');
  check(Math.abs(canvas.nodes.get('demo-image-0').getData().width / canvas.nodes.get('demo-image-0').getData().height - 480 / 270) < .001, 'Packing follows source image proportions');
  canvas.undo();
  check(same(geometry(canvas.getData()), geometry(before)), 'One undo restores the original layout');
  canvas.redo();
  check(same(geometry(canvas.getData()), geometry(packed)), 'One redo restores the packed layout');
  canvas.selectOnly(canvas.nodes.get('demo-group'));
  const matchHistory = canvas.history.current;
  app.commands.executeCommandById('canvas-art-ref:match-image-height');
  await until(() => canvas.history.current > matchHistory);
  const heights = [...canvas.nodes.values()].filter(n => n.id.startsWith('demo-image')).map(n => n.getData().height);
  check(Math.max(...heights) - Math.min(...heights) < .001, 'Matching heights works on a selected group');
  canvas.undo();
  canvas.setReadonly(true);
  check(!command('pack-images').checkCallback(true), 'Native read-only mode disables layout actions');
  canvas.setReadonly(false);

  // Asset folders for native imports and notes.
  check(app.fileManager.getNewFileParent(path).path === notesFolder, 'Native note creation receives the configured notes folder');
  check(app.fileManager.getNewFileParent(path, 'Untitled').path === notesFolder, 'Native text-card conversion receives the configured notes folder');
  const nodeCount = canvas.nodes.size;
  const pasted = new DataTransfer();
  pasted.items.add(new File([t.png()], t.name('paste') + '.png', { type: 'image/png' }));
  canvas.wrapperEl.focus();
  canvas.wrapperEl.dispatchEvent(new ClipboardEvent('paste', { clipboardData: pasted, bubbles: true, cancelable: true, composed: true }));
  await until(() => canvas.nodes.size > nodeCount, 'Timed out waiting for the pasted image.');
  const added = [...canvas.nodes.values()].find(n => !packed.nodes.some(old => old.id === n.id));
  check(added.getData().file.startsWith(imagesFolder + '/'), 'Native clipboard image saved directly into the canvas images folder');
  const addedFile = added.getData().file;
  canvas.requestPushHistory.run(); canvas.undo();
  check(!!app.vault.getAbstractFileByPath(addedFile), 'Removing a card through undo retains its source file');
  const beforeDrop = new Set(canvas.nodes.keys());
  const dropped = new DataTransfer();
  dropped.items.add(new File([t.png()], t.name('drop') + '.png', { type: 'image/png' }));
  const rect = canvas.wrapperEl.getBoundingClientRect();
  for (const type of ['dragenter', 'dragover', 'drop']) canvas.wrapperEl.dispatchEvent(new DragEvent(type, { dataTransfer: dropped, clientX: rect.x + 300, clientY: rect.y + 300, bubbles: true, cancelable: true, composed: true }));
  await until(() => [...canvas.nodes.keys()].some(id => !beforeDrop.has(id)), 'Timed out waiting for the dropped image.');
  const drop = [...canvas.nodes.values()].find(node => !beforeDrop.has(node.id));
  check(drop?.getData().file.startsWith(imagesFolder + '/'), 'Native external image drop saved directly into the configured folder');
  canvas.requestPushHistory.run(); canvas.undo();
  const source = app.vault.getAbstractFileByPath(t.path('Images/Warm light.svg'));
  const reused = await app.importAttachments([{ name: source.basename, extension: source.extension, filepath: app.vault.adapter.getFullPath(source.path) }], app.vault.getAbstractFileByPath(imagesFolder));
  check(reused.length === 1 && reused[0] === source, 'Native importer reuses an existing vault image in place');
  const beforeConvert = structuredClone(canvas.getData());
  let previous = new Set(document.querySelectorAll('.modal-container'));
  canvas.nodes.get('demo-context').convertToFile();
  let modal = newModal(previous);
  if (!modal) throw new Error('Native conversion did not open its name dialog.');
  const noteName = t.name('context');
  const input = modal.querySelector('textarea, input');
  input.value = noteName; input.dispatchEvent(new Event('input', { bubbles: true }));
  modal.querySelector('button.mod-cta').click();
  await until(() => !canvas.nodes.has('demo-context'), 'Timed out waiting for Convert to file.');
  const converted = [...canvas.nodes.values()].find(node => node.getData().file?.endsWith('/' + noteName + '.md'));
  check(converted?.getData().file === notesFolder + '/' + noteName + '.md', 'Native Convert to file saves directly in the configured notes folder');
  check(canvas.getData().edges.some(edge => edge.toNode === converted.id), 'Native conversion retains the connection to the note');
  canvas.requestPushHistory.run(); canvas.undo();
  check(canvas.nodes.has('demo-context') && canvas.getData().edges[0].toNode === beforeConvert.edges[0].toNode, 'Native conversion undo still restores the text card and connection');

  // Plugin dialogs.
  canvas.selectOnly(canvas.nodes.get('demo-group'));
  const image = structuredClone(canvas.nodes.get('demo-image-0').getData());
  previous = new Set(document.querySelectorAll('.modal-container'));
  command('scale-images').checkCallback(false);
  modal = newModal(previous);
  check(!!modal && modal.querySelector('.modal-title').innerText === 'Scale selected images', 'Scale command opens its own dialog');
  const scaleInput = modal.querySelector('input'); scaleInput.value = '200'; scaleInput.dispatchEvent(new Event('input', { bubbles: true }));
  modal.querySelector('button.mod-cta').click();
  check(canvas.nodes.get('demo-image-0').getData().width === image.width * 2, 'Scale dialog applies the entered percentage');
  canvas.undo();
  check(canvas.nodes.get('demo-image-0').getData().width === image.width, 'Scale dialog action is one native undo step');
  previous = new Set(document.querySelectorAll('.modal-container'));
  command('create-note').checkCallback(false);
  modal = newModal(previous);
  check(!!modal && modal.querySelector('.modal-title').innerText === 'Create note in canvas', 'Create-note command opens its own dialog');
  const nameInput = modal.querySelector('input'); nameInput.value = t.name('board notes'); nameInput.dispatchEvent(new Event('input', { bubbles: true }));
  modal.querySelector('button.mod-cta').click();
  const notePath = notesFolder + '/' + t.name('board notes') + '.md';
  const created = () => [...canvas.nodes.values()].some(node => node.getData().file === notePath);
  await until(created, 'Timed out waiting for the created note.');
  check(created(), 'Create-note dialog saves a Markdown file directly in the configured folder');

  // Reloading the plugin.
  await app.plugins.disablePlugin('canvas-art-ref');
  const nativeImport = app.importAttachments;
  const nativeParent = app.fileManager.getNewFileParent;
  const nativeCreation = canvas.showCreationMenu;
  const canvasParent = app.fileManager.getNewFileParent(path, 'Another.canvas').path;
  check(!command('pack-images'), 'Disabling removes plugin commands');
  await app.plugins.enablePlugin('canvas-art-ref');
  check(app.fileManager.getNewFileParent(path, 'Another.canvas').path === canvasParent, 'Creating another native canvas keeps its normal destination');
  check(app.fileManager.getNewFileParent(path, 'Character.v2').path === notesFolder, 'Dotted Markdown note names use the notes destination');
  await app.plugins.disablePlugin('canvas-art-ref');
  check(app.importAttachments === nativeImport && app.fileManager.getNewFileParent === nativeParent && canvas.showCreationMenu === nativeCreation, 'Unloading restores native import, note-folder and menu methods');
  await app.plugins.enablePlugin('canvas-art-ref');
  check(Object.keys(app.commands.commands).filter(id => id.startsWith('canvas-art-ref:')).length === 22, 'Reloading registers each command once');
  canvas.selectOnly(canvas.nodes.get('demo-group'));
  let menu;
  const reference = app.workspace.on('canvas:node-menu', (value, node) => { if (node.id === 'demo-group') menu = value; });
  try { canvas.nodes.get('demo-group').nodeEl.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 550, clientY: 250 })); }
  finally { app.workspace.offref(reference); }
  try {
    const titles = menu.items.map(item => item.titleEl?.innerText || item.title);
    check(['Arrange images', 'Align images', 'Normalize images'].every(label => titles.filter(title => title === label).length === 1), 'Reloading adds image menus exactly once');
    check(titles.includes('Zoom to selection') && titles.includes('Edit label') && titles.includes('Remove'), 'Native group menu actions remain available');
  } finally { menu?.hide(); }
});
