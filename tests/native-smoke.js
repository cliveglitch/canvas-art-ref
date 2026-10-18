/* global app -- Obsidian CLI supplies the application object to native integration tests. */
(async () => {
  const state = window.canvasArtRefSmoke;
  if (!state) throw new Error('Run native-setup.js first.');
  state.results = undefined; state.failure = undefined;
  const canvas = state.leaf.view.canvas;
  const results = [];
  function check(condition, label) { if (!condition) throw new Error(label); results.push(label); }
  async function until(condition) {
    for (let attempt = 0; attempt < 60; attempt++) {
      if (condition()) return;
      await new Promise(resolve => window.setTimeout(resolve, 50));
    }
    throw new Error('Timed out waiting for the native action.');
  }
  const geometry = data => data.nodes.map(({ id, x, y, width, height }) => ({ id, x, y, width, height })).sort((a, b) => a.id.localeCompare(b.id));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  canvas.requestPushHistory.run();
  const before = structuredClone(canvas.getData());
  const noteBefore = before.nodes.find(n => n.id === 'demo-context');
  const historyBefore = canvas.history.current;
  canvas.selectOnly(canvas.nodes.get('demo-group'));
  check(app.commands.executeCommandById('canvas-art-ref-plugin:pack-images'), 'Native selection command available');
  await until(() => canvas.history.current > historyBefore);
  const packed = structuredClone(canvas.getData());
  check(canvas.history.current === historyBefore + 1, 'Packing creates exactly one native undo step');
  check(same(packed.edges, before.edges), 'Connections and their properties retained');
  check(same(packed.nodes.find(n => n.id === 'demo-context'), noteBefore), 'Contextual text card retained');
  check(Math.abs(canvas.nodes.get('demo-image-0').getData().width / canvas.nodes.get('demo-image-0').getData().height - 480 / 270) < .001, 'Packing follows source image proportions');
  canvas.undo();
  check(same(geometry(canvas.getData()), geometry(before)), 'One undo restores the original layout');
  canvas.redo();
  check(same(geometry(canvas.getData()), geometry(packed)), 'One redo restores the packed layout');
  canvas.selectOnly(canvas.nodes.get('demo-group'));
  const matchHistory = canvas.history.current;
  app.commands.executeCommandById('canvas-art-ref-plugin:match-image-height');
  await until(() => canvas.history.current > matchHistory);
  const heights = [...canvas.nodes.values()].filter(n => n.id.startsWith('demo-image')).map(n => n.getData().height);
  check(Math.max(...heights) - Math.min(...heights) < .001, 'Matching heights works on a selected group');
  canvas.undo();
  const imagesFolder = state.root + '/Imported images';
  const notesFolder = state.root + '/Notes';
  check(app.fileManager.getNewFileParent(state.path).path === notesFolder, 'Native note creation receives the configured notes folder');
  check(app.fileManager.getNewFileParent(state.path, 'Untitled').path === notesFolder, 'Native text-card conversion receives the configured notes folder');
  const nodeCount = canvas.nodes.size;
  const transfer = new DataTransfer();
  const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5bkAAAAASUVORK5CYII='), c => c.charCodeAt(0));
  transfer.items.add(new File([bytes], 'Reference paste.png', { type: 'image/png' }));
  canvas.wrapperEl.focus();
  canvas.wrapperEl.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true, composed: true }));
  await until(() => canvas.nodes.size > nodeCount);
  const added = [...canvas.nodes.values()].find(n => !packed.nodes.some(old => old.id === n.id));
  check(added.getData().file.startsWith(imagesFolder + '/'), 'Native clipboard image saved directly into the canvas images folder');
  const addedFile = added.getData().file;
  canvas.requestPushHistory.run();
  canvas.undo();
  check(!!app.vault.getAbstractFileByPath(addedFile), 'Removing a card through undo retains its source file');
  canvas.setReadonly(true);
  check(!app.commands.commands['canvas-art-ref-plugin:pack-images'].checkCallback(true), 'Native read-only mode disables layout actions');
  canvas.setReadonly(false);
  canvas.selectOnly(canvas.nodes.get('demo-group'));
  canvas.zoomToFit();
  state.results = { passed: results, path: state.path };
  return JSON.stringify(state.results);
})().catch(error => { window.canvasArtRefSmoke.failure = error.message; throw error; })
