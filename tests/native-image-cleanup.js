/* global app -- Remove only the scratch vault folders created by native-image-actions.js. */
(async () => {
  const state = window.canvasArtRefImageChecks;
  if (!state?.report) throw new Error('Finish the native image checks before cleanup.');
  const runs = [...(window.canvasArtRefImageTestRuns ?? []), state];
  const unique = [...new Map(runs.map(run => [run.root, run])).values()];
  const adapter = app.vault.adapter;
  const base = adapter.getFullPath('').replaceAll('\\', '/').replace(/\/$/, '');
  for (const run of unique) {
    if (!/^Canvas Art Ref checks \d+$/.test(run.root)) throw new Error('Unexpected scratch-folder name.');
    const resolved = adapter.getFullPath(run.root).replaceAll('\\', '/');
    if (resolved.toLowerCase() !== (base + '/' + run.root).toLowerCase()) throw new Error('Scratch path is outside the intended vault directory.');
    if (run.leaf?.view?.containerEl?.isConnected) {
      await run.leaf.view.save();
      run.leaf.detach();
    }
  }
  await new Promise(resolve => window.setTimeout(resolve, 100));
  const removed = [], kept = [];
  const plugin = app.plugins.plugins['canvas-art-ref-plugin'];
  for (const run of unique) {
    const expected = new Set(['A/apple2.svg', 'B/zebra10.svg', 'B/apple1.svg', 'Checks.canvas'].map(name => run.root + '/' + name));
    const files = app.vault.getFiles().filter(file => file.path.startsWith(run.root + '/'));
    if (files.some(file => !expected.has(file.path))) { kept.push(run.root); continue; }
    const folder = app.vault.getAbstractFileByPath(run.root);
    if (folder) await app.vault.delete(folder, true);
    for (const map of [plugin.settings.imageOrder, plugin.settings.canvases]) {
      for (const path of Object.keys(map)) if (path.startsWith(run.root + '/')) delete map[path];
    }
    removed.push(run.root);
  }
  await plugin.saveSettings();
  if (state.previousLeaf?.view?.containerEl?.isConnected) app.workspace.setActiveLeaf(state.previousLeaf, { focus: true });
  window.canvasArtRefImageChecks = { report: state.report, cleaned: true };
  window.canvasArtRefImageTestRuns = [];
  window.canvasArtRefImageCheckFailure = undefined;
  return JSON.stringify({ removed: removed.length, kept, version: plugin.manifest.version, actions: state.report.actions, checks: state.report.checks });
})()
