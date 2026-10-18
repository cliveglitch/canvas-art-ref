/* global app -- Obsidian CLI supplies the application object to native integration tests. */
(async () => {
  const state = window.canvasArtRefSmoke;
  state.interactions = undefined; state.interactionFailure = undefined;
  const canvas = state.leaf.view.canvas;
  const checks = [];
  function check(condition, label) { if (!condition) throw new Error(label); checks.push(label); }
  async function until(condition) {
    for (let attempt = 0; attempt < 60; attempt++) { if (condition()) return; await new Promise(resolve => window.setTimeout(resolve, 50)); }
    throw new Error('Timed out waiting for the native interaction.');
  }
  canvas.setReadonly(false); canvas.wrapperEl.focus();
  state.phase = 'drop';
  const beforeDrop = new Set([...canvas.nodes.keys()]);
  const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5bkAAAAASUVORK5CYII='), char => char.charCodeAt(0));
  const transfer = new DataTransfer();
  const name = 'Dropped reference ' + Date.now();
  transfer.items.add(new File([bytes], name + '.png', { type: 'image/png' }));
  const rect = canvas.wrapperEl.getBoundingClientRect();
  for (const type of ['dragenter', 'dragover', 'drop']) canvas.wrapperEl.dispatchEvent(new DragEvent(type, { dataTransfer: transfer, clientX: rect.x + 300, clientY: rect.y + 300, bubbles: true, cancelable: true, composed: true }));
  await until(() => [...canvas.nodes.keys()].some(id => !beforeDrop.has(id)));
  const dropped = [...canvas.nodes.values()].find(node => !beforeDrop.has(node.id));
  check(dropped?.getData().file.startsWith(state.root + '/Imported images/'), 'Native external image drop saved directly into the configured folder');
  canvas.requestPushHistory.run(); canvas.undo();
  state.phase = 'reuse';
  const source = app.vault.getAbstractFileByPath(state.root + '/Images/Warm light.svg');
  const reused = await app.importAttachments([{ name: source.basename, extension: source.extension, filepath: app.vault.adapter.getFullPath(source.path) }], app.vault.getAbstractFileByPath(state.root + '/Imported images'));
  check(reused.length === 1 && reused[0] === source, 'Native importer reuses an existing vault image in place');
  const before = structuredClone(canvas.getData());
  state.phase = 'convert';
  const existingModals = new Set(document.querySelectorAll('.modal-container'));
  canvas.nodes.get('demo-context').convertToFile();
  const modal = [...document.querySelectorAll('.modal-container')].find(element => !existingModals.has(element));
  if (!modal) throw new Error('Native conversion did not open its name dialog.');
  const input = modal.querySelector('textarea, input');
  const noteName = 'Reference context ' + Date.now();
  input.value = noteName; input.dispatchEvent(new Event('input', { bubbles: true }));
  modal.querySelector('button.mod-cta').click();
  await until(() => !canvas.nodes.has('demo-context'));
  const converted = [...canvas.nodes.values()].find(node => node.getData().file?.endsWith('/' + noteName + '.md'));
  check(converted?.getData().file === state.root + '/Notes/' + noteName + '.md', 'Native Convert to file saves directly in the configured notes folder');
  check(canvas.getData().edges.some(edge => edge.toNode === converted.id), 'Native conversion retains the connection to the note');
  canvas.requestPushHistory.run(); canvas.undo();
  check(canvas.nodes.has('demo-context') && canvas.getData().edges[0].toNode === before.edges[0].toNode, 'Native conversion undo still restores the text card and connection');
  canvas.selectOnly(canvas.nodes.get('demo-group'));
  canvas.zoomToFit();
  state.interactions = checks;
  state.phase = 'complete';
  return JSON.stringify({ passed: checks });
})().catch(error => { window.canvasArtRefSmoke.interactionFailure = error.message; throw error; })
