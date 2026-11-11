import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as wait } from 'node:timers/promises';
import { api } from './bundle.mjs';
import { pluginData } from './fakes.mjs';

const { StorageRouting, obsidian: { TFolder } } = api;
const image = { name: 'Pasted image', extension: 'png' };
const nextTask = () => wait(0);

async function fixture(t) {
  const win = new EventTarget();
  win.setTimeout = setTimeout;
  const wrapperEl = { ownerDocument: { defaultView: win } };
  const canvas = { wrapperEl, readonly: false, view: { file: { path: 'Board.canvas' } } };
  const folders = new Map(['', 'assets', 'other'].map(path => [path, new TFolder(path)]));
  const calls = [];
  const original = async (items, folder) => {
    calls.push({ items, folder });
    return items.map(item => ({ path: (folder?.path ? folder.path + '/' : '') + item.name + '.' + item.extension }));
  };
  const app = {
    vault: {
      getRoot: () => folders.get(''),
      getAbstractFileByPath: path => folders.get(path),
      createFolder: async path => { folders.set(path, new TFolder(path)); },
    },
    workspace: { getLeavesOfType: () => [{ view: { canvas } }] },
    fileManager: { getNewFileParent: () => folders.get('') },
    importAttachments: original,
  };
  const { data } = await pluginData({ canvases: { 'Board.canvas': { images: 'assets' } } });
  const routing = new StorageRouting(app, data);
  routing.load(); routing.attach(canvas);
  t.after(() => routing.unload());
  const dispatch = (type = 'paste', target = null) => {
    const event = new Event(type);
    Object.defineProperties(event, { composedPath: { value: () => [wrapperEl, win] }, target: { value: target } });
    win.dispatchEvent(event);
  };
  return { app, data, canvas, folders, calls, dispatch, routing, original };
}

test('pasted images retain the configured folder across native event listener microtasks', async t => {
  const { app, dispatch, calls } = await fixture(t);
  dispatch();
  // Real browser events run microtasks between capture and native paste listeners.
  await Promise.resolve();
  const files = await app.importAttachments([image], null);
  assert.equal(files[0].path, 'assets/Pasted image.png');
  assert.equal(calls[0].folder.path, 'assets');
  await nextTask();
  assert.equal((await app.importAttachments([image], null))[0].path, 'Pasted image.png');
});

test('a later canvas event keeps its folder after the previous event scope expires', async t => {
  const { app, canvas, data, dispatch } = await fixture(t);
  dispatch();
  const previousExpiry = nextTask();
  canvas.view.file.path = 'Other.canvas';
  data.setCanvasFolders('Other.canvas', { images: 'other' });
  dispatch();
  await previousExpiry;
  assert.equal((await app.importAttachments([image], null))[0].path, 'other/Pasted image.png');
});

test('mixed drops route only images and capture their destination before awaiting', async t => {
  const { app, data, dispatch, calls } = await fixture(t);
  dispatch('drop');
  await Promise.resolve();
  const note = { name: 'Notes', extension: 'md' };
  const pending = app.importAttachments([image, note], null);
  data.setCanvasFolders('Board.canvas', { images: 'other' });
  assert.deepEqual((await pending).map(file => file.path), ['assets/Pasted image.png', 'Notes.md']);
  assert.deepEqual(calls.map(call => call.folder?.path ?? null), ['assets', null]);
});

test('folder defaults, explicit vault root and missing nested folders are honored', async t => {
  const { app, data, dispatch } = await fixture(t);
  data.setDefaults({ images: 'assets', notes: '' }, 24); data.setCanvasFolders('Board.canvas', {});
  dispatch();
  assert.equal((await app.importAttachments([image], null))[0].path, 'assets/Pasted image.png');
  data.setCanvasFolders('Board.canvas', { images: '/' });
  dispatch();
  assert.equal((await app.importAttachments([image], null))[0].path, 'Pasted image.png');
  data.setCanvasFolders('Board.canvas', { images: 'new/nested' });
  dispatch();
  assert.equal((await app.importAttachments([image], null))[0].path, 'new/nested/Pasted image.png');
});

test('explicit native destinations, read-only canvases and text editors retain native handling', async t => {
  const { app, canvas, dispatch, folders } = await fixture(t);
  dispatch();
  assert.equal((await app.importAttachments([image], folders.get('other')))[0].path, 'other/Pasted image.png');
  await nextTask();
  canvas.readonly = true; dispatch();
  assert.equal((await app.importAttachments([image], null))[0].path, 'Pasted image.png');
  canvas.readonly = false;
  dispatch('paste', { nodeType: 1, closest: () => ({}) });
  assert.equal((await app.importAttachments([image], null))[0].path, 'Pasted image.png');
});

test('unloading during a paste restores native imports', async t => {
  const { app, dispatch, routing, original } = await fixture(t);
  dispatch(); await Promise.resolve();
  const wrapped = app.importAttachments;
  routing.unload();
  assert.equal(app.importAttachments, original);
  assert.equal((await wrapped.call(app, [image], null))[0].path, 'Pasted image.png');
});
