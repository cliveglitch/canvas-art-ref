/* global app -- Obsidian CLI supplies the application object to native integration tests. */
(async () => {
  const state = window.canvasArtRefSmoke;
  const sourceBytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5bkAAAAASUVORK5CYII='), char => char.charCodeAt(0));
  // Remove only the exact tiny PNG fixture imported by these tests, inside their own demo folder.
  const candidates = app.vault.getFiles().filter(file => file.parent?.path === state.root + '/Imported images' && file.extension === 'png');
  for (const file of candidates) {
    const data = new Uint8Array(await app.vault.readBinary(file));
    if (data.length === sourceBytes.length && data.every((byte, index) => byte === sourceBytes[index])) await app.vault.delete(file);
  }
  const originalText = state.before.nodes.find(node => node.id === 'demo-context').text;
  const notes = app.vault.getFiles().filter(file => file.parent?.path === state.root + '/Notes' && /^Reference context(?: \d+)?$/.test(file.basename));
  for (const file of notes) if (await app.vault.read(file) === originalText) await app.vault.delete(file);
  const report = { smoke: state.results?.passed, interactions: state.interactions, lifecycle: state.lifecycle, dialogs: state.dialogs };
  if (Object.values(report).some(checks => !checks?.length)) throw new Error('Some native checks did not finish.');
  await app.vault.adapter.write(app.plugins.plugins['canvas-art-ref-plugin'].manifest.dir + '/output/native-checks.json', JSON.stringify(report, null, 2));
  const canvas = state.leaf.view.canvas;
  canvas.selectOnly(canvas.nodes.get('demo-group')); canvas.zoomToFit();
  app.workspace.setActiveLeaf(state.leaf, { focus: true });
  return JSON.stringify({ nativeChecks: Object.values(report).reduce((sum, checks) => sum + checks.length, 0), demo: state.path, enabled: !!app.plugins.plugins['canvas-art-ref-plugin'] });
})()
