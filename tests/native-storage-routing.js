/* global app -- Check clipboard timing and external drops on a temporary native Canvas. */
(async () => {
  const root = 'Canvas Art Ref storage checks ' + Date.now();
  const path = root + '/Imports.canvas', images = root + '/assets';
  const previousLeaf = app.workspace.activeLeaf;
  const checks = [], imported = new Set();
  const plugin = app.plugins.plugins['canvas-art-ref-plugin'];
  const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5bkAAAAASUVORK5CYII='), char => char.charCodeAt(0));
  const check = (condition, label) => { if (!condition) throw new Error(label); checks.push(label); };
  const wait = delay => new Promise(resolve => window.setTimeout(resolve, delay));
  const until = async condition => {
    for (let attempt = 0; attempt < 60; attempt++) { if (condition()) return; await wait(50); }
    throw new Error('Timed out waiting for the native import.');
  };
  const adapter = app.vault.adapter;
  const base = adapter.getFullPath('').replaceAll('\\', '/').replace(/\/$/, '');
  const resolved = adapter.getFullPath(root).replaceAll('\\', '/');
  if (!/^Canvas Art Ref storage checks \d+$/.test(root) || resolved.toLowerCase() !== (base + '/' + root).toLowerCase()) throw new Error('Unexpected scratch-folder path.');
  let leaf, canvas;
  window.canvasArtRefStorageChecks = { root, path, checks };
  try {
    await app.vault.createFolder(root);
    const file = await app.vault.create(path, JSON.stringify({ nodes: [], edges: [] }));
    plugin.settings.canvases[path] = { images, notes: '' };
    leaf = app.workspace.getLeaf('tab');
    await leaf.openFile(file); app.workspace.setActiveLeaf(leaf, { focus: true });
    await wait(100);
    canvas = leaf.view.canvas;
    const transfer = () => {
      const data = new DataTransfer();
      data.items.add(new File([bytes], root + '.png', { type: 'image/png' }));
      return data;
    };
    const importImage = async (type, microtask = false) => {
      const before = new Set(canvas.nodes.keys()), data = transfer();
      canvas.wrapperEl.focus();
      if (microtask) {
        // Model the browser's microtask checkpoint between capture and native listeners.
        canvas.wrapperEl.addEventListener('paste', event => {
          event.preventDefault();
          queueMicrotask(() => canvas.handlePaste(new ClipboardEvent('paste', { clipboardData: data })));
        }, { once: true, capture: true });
      }
      if (type === 'paste') canvas.wrapperEl.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true, composed: true }));
      else {
        const rect = canvas.wrapperEl.getBoundingClientRect();
        for (const event of ['dragenter', 'dragover', 'drop']) canvas.wrapperEl.dispatchEvent(new DragEvent(event, { dataTransfer: data, clientX: rect.x + 150, clientY: rect.y + 150, bubbles: true, cancelable: true, composed: true }));
      }
      await until(() => [...canvas.nodes.keys()].some(id => !before.has(id)));
      const node = [...canvas.nodes.values()].find(node => !before.has(node.id));
      const added = app.vault.getAbstractFileByPath(node.getData().file);
      imported.add(added);
      return added;
    };
    check((await importImage('paste', true)).parent.path === images, 'Clipboard images use assets after an event listener microtask checkpoint');
    check(!!app.vault.getAbstractFileByPath(images), 'Missing configured image folder is created');
    check((await importImage('paste')).parent.path === images, 'Synchronous clipboard imports still use assets');
    check((await importImage('drop')).parent.path === images, 'External image drops use assets');
    const source = [...imported][0];
    const reused = await app.importAttachments([{ name: source.basename, extension: source.extension, filepath: adapter.getFullPath(source.path) }], app.vault.getAbstractFileByPath(images));
    check(reused[0] === source, 'Existing vault images are reused in place');
    const report = { checks: checks.length, passed: checks };
    window.canvasArtRefStorageChecks.report = report;
    const output = plugin.manifest.dir + '/output';
    if (!await adapter.exists(output)) await adapter.mkdir(output);
    await adapter.write(output + '/storage-routing-checks.json', JSON.stringify(report, null, 2));
    return JSON.stringify(report);
  } finally {
    if (leaf?.view?.containerEl?.isConnected) { await leaf.view.save(); leaf.detach(); }
    await wait(100);
    for (const file of imported) {
      if (app.vault.getAbstractFileByPath(file.path) !== file) continue;
      const data = new Uint8Array(await app.vault.readBinary(file));
      if (data.length === bytes.length && data.every((byte, index) => byte === bytes[index])) await app.vault.delete(file);
    }
    const remaining = app.vault.getFiles().filter(file => file.path.startsWith(root + '/'));
    if (remaining.every(file => file.path === path)) {
      const folder = app.vault.getAbstractFileByPath(root);
      if (folder) await app.vault.delete(folder, true);
      delete plugin.settings.canvases[path]; delete plugin.settings.imageOrder[path];
      await plugin.saveSettings();
      window.canvasArtRefStorageChecks.cleaned = true;
    }
    if (previousLeaf?.view?.containerEl?.isConnected) app.workspace.setActiveLeaf(previousLeaf, { focus: true });
  }
})().catch(error => { window.canvasArtRefStorageChecks.failure = error.message; throw error; })
