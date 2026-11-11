/* global app -- Obsidian CLI supplies the application object; tests/native.mjs evaluates this before each native-*.js script. */
// Every run works inside its own folder under "Canvas Art Ref tests" and always removes it, its plugin data
// entries, its tabs and anything it leaked elsewhere, even when a check fails.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Called by the native-*.js script evaluated after this one.
const nativeTest = async (name, body) => {
  const base = 'Canvas Art Ref tests';
  const id = Date.now().toString(36);
  const root = base + '/' + name + ' ' + id;
  const prefix = 'Canvas Art Ref test ' + id;
  const pluginId = 'canvas-art-ref-plugin';
  const plugin = () => app.plugins.plugins[pluginId];
  const data = () => plugin().pluginData;
  const inside = path => path === root || path.startsWith(root + '/');
  const guard = path => { if (!inside(path)) throw new Error('Outside the test folder: ' + path); return path; };
  const wait = delay => new Promise(resolve => window.setTimeout(resolve, delay));
  const checks = [], leaves = [], created = [], fixtures = [], leaked = [];
  const previousLeaf = app.workspace.getMostRecentLeaf();
  const original = { folders: data().defaults, gap: data().gap, source: data().sizeSource };
  let failure;
  const t = {
    root, prefix, wait, plugin,
    check(condition, label) { if (!condition) throw new Error(label); checks.push(label); },
    async until(condition, label = 'Timed out waiting for Canvas.') {
      for (let attempt = 0; attempt < 60; attempt++) { if (condition()) return; await wait(50); }
      throw new Error(label);
    },
    path: relative => guard(root + '/' + relative),
    /** A file name that cleanup recognises even if Canvas saves it outside the test folder. */
    name: label => prefix + ' ' + label,
    /** A 1×1 PNG; cleanup removes byte-identical copies this run created outside the test folder. */
    png() {
      const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5bkAAAAASUVORK5CYII='), char => char.charCodeAt(0));
      fixtures.push(bytes);
      return bytes;
    },
    folder: relative => app.vault.createFolder(t.path(relative)),
    create: (relative, content) => app.vault.create(t.path(relative), content),
    async open(file) {
      const leaf = app.workspace.getLeaf('tab');
      leaves.push(leaf);
      await leaf.openFile(file); app.workspace.setActiveLeaf(leaf, { focus: true });
      await wait(100);
      return leaf.view.canvas;
    },
    async canvasFolders(path, folders) {
      for (const value of [path, ...Object.values(folders).filter(Boolean)]) guard(value);
      await data().setCanvasFolders(guard(path), folders);
    },
    additionOrder: path => [...data().additions(guard(path))],
    sizeSource: () => data().sizeSource,
  };

  const existing = app.vault.getAbstractFileByPath(base);
  if (existing && !('children' in existing)) throw new Error('A file already uses the test folder name: ' + base);
  const listener = app.vault.on('create', file => created.push(file));
  try {
    if (!existing) await app.vault.createFolder(base);
    await app.vault.createFolder(root);
    await body(t);
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  } finally {
    app.vault.offref(listener);
    if (!plugin()) await app.plugins.enablePlugin(pluginId);
    for (const leaf of leaves) {
      const canvas = leaf.view?.canvas;
      if (canvas?.readonly) canvas.setReadonly(false);
      if (leaf.view?.containerEl?.isConnected) { await leaf.view.save?.(); leaf.detach(); }
    }
    await wait(100);
    const same = (a, b) => a.length === b.length && a.every((byte, index) => byte === b[index]);
    for (const file of created) {
      if (inside(file.path) || app.vault.getAbstractFileByPath(file.path) !== file || !('extension' in file)) continue;
      const ours = file.basename.startsWith(prefix) || (fixtures.length && await app.vault.readBinary(file).then(data => fixtures.some(bytes => same(new Uint8Array(data), bytes))));
      if (ours) { await app.vault.delete(file); leaked.push(file.path); }
    }
    const folder = app.vault.getAbstractFileByPath(root);
    if (folder) await app.vault.delete(folder, true);
    const parent = app.vault.getAbstractFileByPath(base);
    if (parent?.children?.length === 0) await app.vault.delete(parent, true);
    if (JSON.stringify([data().defaults, data().gap]) !== JSON.stringify([original.folders, original.gap])) await data().setDefaults(original.folders, original.gap);
    if (data().sizeSource !== original.source) await data().setSizeSource(original.source);
    await data().forget(root);
    if (previousLeaf?.view?.containerEl?.isConnected) app.workspace.setActiveLeaf(previousLeaf, { focus: true });
  }
  if (!failure && leaked.length) failure = 'Created outside the test folder: ' + leaked.join(', ');
  return JSON.stringify({ name, ok: !failure, failure, passed: checks, leaked });
};
