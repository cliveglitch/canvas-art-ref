import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api } from './bundle.mjs';
import { memoryCanvas, pluginData } from './fakes.mjs';

const { StorageRouting, obsidian: { TFolder, TFile, notices } } = api;
const image = { name: 'Pasted image', extension: 'png' };

/** Storage routing over the in-memory canvas and a vault of folders. `native` records what Canvas would import. */
async function fixture(stored = { canvases: { 'Board.canvas': { images: 'assets', notes: 'notes' } } }) {
  const canvas = memoryCanvas();
  const { data } = await pluginData(stored);
  const entries = new Map(['', 'assets', 'other', 'notes'].map(path => [path, new TFolder(path)]));
  const app = {
    vault: {
      getRoot: () => entries.get(''),
      getAbstractFileByPath: path => entries.get(path),
      createFolder: async path => { entries.set(path, new TFolder(path)); },
    },
  };
  new StorageRouting(app, data, canvas);
  const calls = [];
  const native = async (items, folder) => {
    calls.push({ items, folder: folder?.path ?? null });
    return items.map(item => ({ path: (folder?.path ? folder.path + '/' : '') + item.name + '.' + item.extension }));
  };
  const board = canvas.board([]);
  const paths = async (items, folder = null) => (await canvas.import(board, items, folder, native))?.map(file => file.path);
  return { canvas, data, entries, board, calls, paths, native };
}

test('images pasted or dropped on a canvas go to its images folder', async () => {
  const { paths, calls } = await fixture();
  assert.deepEqual(await paths([image]), ['assets/Pasted image.png']);
  assert.deepEqual(calls.map(call => call.folder), ['assets']);
});

test('mixed imports route only the images, with the destination captured before awaiting', async () => {
  const { data, paths, calls } = await fixture();
  const note = { name: 'Notes', extension: 'md' };
  const pending = paths([image, note]);
  data.setCanvasFolders('Board.canvas', { images: 'other' });
  assert.deepEqual(await pending, ['assets/Pasted image.png', 'Notes.md']);
  assert.deepEqual(calls.map(call => call.folder), ['assets', null]);
});

test('defaults, the vault root and missing nested folders are honoured', async () => {
  const { data, paths, entries } = await fixture({ images: 'assets' });
  assert.deepEqual(await paths([image]), ['assets/Pasted image.png']);
  data.setCanvasFolders('Board.canvas', { images: '/' });
  assert.deepEqual(await paths([image]), ['Pasted image.png']);
  data.setCanvasFolders('Board.canvas', { images: 'new/nested' });
  assert.deepEqual(await paths([image]), ['new/nested/Pasted image.png']);
  assert.ok(entries.get('new') instanceof TFolder);
});

test('explicit destinations, read-only canvases, unsaved canvases, other files and canvases without an images folder import natively', async () => {
  const { canvas, entries, board, paths, native } = await fixture();
  assert.equal(await paths([image], entries.get('other')), undefined);
  assert.equal(await paths([{ name: 'Notes', extension: 'md' }, { name: 'Folder', extension: 'png', isDirectory: true }]), undefined);
  board.readonly = true;
  assert.equal(await paths([image]), undefined);
  const elsewhere = canvas.board([], { path: 'Other.canvas' });
  assert.equal(canvas.import(elsewhere, [image], null, native), undefined);
  const unsaved = canvas.board([], { path: '' });
  assert.equal(canvas.import(unsaved, [image], null, native), undefined);
});

test('an import that cannot reach its folder shows a notice and imports nothing', async () => {
  const { entries, paths } = await fixture();
  entries.set('assets', new TFile('assets'));
  assert.deepEqual(await paths([image]), []);
  assert.equal(notices.at(-1), 'A file already uses the folder path: assets');
});

test('new notes from a canvas go to its notes folder only when that folder exists', async () => {
  const { canvas, data, entries } = await fixture();
  assert.equal(canvas.notesFolder('Board.canvas'), entries.get('notes'));
  assert.equal(canvas.notesFolder('Other.canvas'), undefined);
  data.setCanvasFolders('Board.canvas', { notes: '/' });
  assert.equal(canvas.notesFolder('Board.canvas'), entries.get(''));
  data.setCanvasFolders('Board.canvas', { notes: 'missing' });
  assert.equal(canvas.notesFolder('Board.canvas'), undefined);
});
