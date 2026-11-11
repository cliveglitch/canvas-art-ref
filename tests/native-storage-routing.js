/* global app, nativeTest -- Obsidian CLI supplies app; tests/native-harness.js supplies nativeTest. */
// Clipboard timing, external drops, missing image folders and existing-file reuse.
nativeTest('storage routing', async t => {
  const { check, until } = t;
  const path = t.path('Imports.canvas'), images = t.path('assets');
  await t.canvasFolders(path, { images });
  const canvas = await t.open(await t.create('Imports.canvas', JSON.stringify({ nodes: [], edges: [] })));
  const transfer = () => {
    const data = new DataTransfer();
    data.items.add(new File([t.png()], t.name('import') + '.png', { type: 'image/png' }));
    return data;
  };
  const imported = [];
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
    await until(() => [...canvas.nodes.keys()].some(id => !before.has(id)), 'Timed out waiting for the native import.');
    const node = [...canvas.nodes.values()].find(node => !before.has(node.id));
    const added = app.vault.getAbstractFileByPath(node.getData().file);
    imported.push(added);
    return added;
  };
  check((await importImage('paste', true)).parent.path === images, 'Clipboard images use assets after an event listener microtask checkpoint');
  check(!!app.vault.getAbstractFileByPath(images), 'Missing configured image folder is created');
  check((await importImage('paste')).parent.path === images, 'Synchronous clipboard imports still use assets');
  check((await importImage('drop')).parent.path === images, 'External image drops use assets');
  const source = imported[0];
  const reused = await app.importAttachments([{ name: source.basename, extension: source.extension, filepath: app.vault.adapter.getFullPath(source.path) }], app.vault.getAbstractFileByPath(images));
  check(reused[0] === source, 'Existing vault images are reused in place');
});
