/* global app -- Obsidian CLI supplies the application object to native integration tests. */
(async () => {
  let root = 'Canvas Art Ref demo', suffix = 1;
  while (app.vault.getAbstractFileByPath(root)) root = 'Canvas Art Ref demo ' + suffix++;
  for (const folder of [root, root + '/Images', root + '/Imported images', root + '/Notes']) await app.vault.createFolder(folder);
  const studies = [
    ['Warm light', 480, 270, '#eac191', '<path d="M0 270 170 80 310 270Z" fill="#6c7772"/><circle cx="370" cy="65" r="35" fill="#fff0c2"/>'],
    ['Character silhouette', 240, 480, '#a4b8b2', '<circle cx="120" cy="125" r="58" fill="#384652"/><path d="M30 430Q25 220 120 210Q215 220 210 430Z" fill="#384652"/>'],
    ['Forest shapes', 480, 320, '#bdcabc', '<path d="m70 270 60-210 60 210Zm130 0 80-260 80 260Zm150 0 50-170 50 170Z" fill="#4d6d61"/>'],
    ['Color study', 360, 360, '#ddc8b0', '<rect x="30" y="30" width="140" height="140" fill="#c77868"/><rect x="190" y="30" width="140" height="140" fill="#536b73"/><rect x="30" y="190" width="140" height="140" fill="#d9ac62"/><rect x="190" y="190" width="140" height="140" fill="#7f8d70"/>'],
    ['Sprite study', 160, 240, '#c8b6cd', '<path d="M60 40h40v20h20v40h-20v20h20v60h-20v40H80v-40H60v40H40v-60h20v-40H40V80h20Z" fill="#4c4667"/>'],
    ['Cloud forms', 480, 220, '#9fb9cc', '<path d="M40 150a40 40 0 0 1 40-40 65 65 0 0 1 125-15 40 40 0 0 1 65 55Z" fill="#f4eee5"/><path d="M310 110a30 30 0 0 1 30-30 45 45 0 0 1 85-10 30 30 0 0 1 40 40Z" fill="#d9e3e7"/>'],
  ];
  const nodes = [{ id: 'demo-group', type: 'group', label: 'References', x: 0, y: 0, width: 1320, height: 900 }];
  for (let index = 0; index < studies.length; index++) {
    const [name, width, height, color, shapes] = studies[index];
    const file = root + '/Images/' + name + '.svg';
    await app.vault.create(file, `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${color}"/>${shapes}</svg>`);
    nodes.push({ id: 'demo-image-' + index, type: 'file', file, x: 40 + index % 3 * 420, y: 80 + Math.floor(index / 3) * 390, width: 320, height: 320 });
  }
  nodes.push({ id: 'demo-context', type: 'text', text: '## Canvas Art Ref\n\nThese are ordinary Canvas image cards. Select a few images, or the whole group, then right-click.\n\n- Arrange images: Optimal, name, path, order, addition, random\n- Align images: Edges, stack, rows and columns\n- Normalize images: First-selected or average sizing\n- Undo / redo works normally\n\nRight-click empty space to choose Canvas folders.\n\nNative notes, groups and connections remain available.', x: 1400, y: 60, width: 420, height: 520 });
  const path = root + '/Canvas Art Ref demo.canvas';
  await app.vault.create(path, JSON.stringify({ nodes, edges: [{ id: 'demo-edge', fromNode: 'demo-image-0', fromSide: 'right', toNode: 'demo-context', toSide: 'left', label: 'Lighting and mood' }] }, null, 2));
  const plugin = app.plugins.plugins['canvas-art-ref-plugin'];
  plugin.settings.canvases[path] = { images: root + '/Imported images', notes: root + '/Notes' };
  await plugin.saveSettings();
  const leaf = app.workspace.getLeaf('tab');
  await leaf.openFile(app.vault.getAbstractFileByPath(path));
  app.workspace.setActiveLeaf(leaf, { focus: true });
  window.canvasArtRefSmoke = { root, path, leaf, before: structuredClone(leaf.view.canvas.getData()) };
  return JSON.stringify({ path, images: studies.length, pluginLoaded: !!plugin });
})()
