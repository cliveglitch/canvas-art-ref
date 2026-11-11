import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api } from './bundle.mjs';
import { pluginData } from './fakes.mjs';

const reload = async storage => {
  const data = new api.PluginData(storage, { on: () => ({}) });
  await data.read();
  return data;
};

test('loading ignores invalid paths, unknown values and non-canvas entries, and clamps spacing', async () => {
  const { data } = await pluginData({
    images: '../secret', notes: 'Art/Notes', gap: 500, normalizeSource: 'unexpected',
    imageOrder: { 'Art/Hero.canvas': ['b', 'a', 'b', 5], 'note.md': ['x'] },
    canvases: { 'Hero.canvas': { images: '/', notes: 'C:\\outside' }, 'note.md': { images: 'Art' } },
  });
  assert.deepEqual(data.defaults, { images: '', notes: 'Art/Notes' });
  assert.equal(data.gap, 200);
  assert.equal(data.sizeSource, 'average');
  assert.deepEqual(data.additions('Art/Hero.canvas'), ['b', 'a']);
  assert.deepEqual(data.additions('note.md'), []);
  assert.deepEqual(data.canvasFolders('Hero.canvas'), { images: '/' });
  assert.deepEqual(data.canvasFolders('note.md'), {});
  assert.equal((await pluginData(undefined)).data.gap, 24);
});

test('canvas folders inherit each default independently, and / selects the vault root', async () => {
  const { data, storage } = await pluginData({});
  await data.setDefaults({ images: 'Art\\Images', notes: 'Art/Notes' }, 24);
  await data.setCanvasFolders('Hero.canvas', { images: '/' });
  assert.deepEqual(data.folders('Hero.canvas'), { images: '/', notes: 'Art/Notes' });
  assert.deepEqual(data.folders('Other.canvas'), { images: 'Art/Images', notes: 'Art/Notes' });
  await data.setCanvasFolders('Hero.canvas', { images: ' ', notes: '' });
  assert.deepEqual(data.canvasFolders('Hero.canvas'), {});
  assert.equal(storage.value.canvases['Hero.canvas'], undefined, 'a canvas with no overrides is removed');
});

test('changes are validated strictly and rejected changes leave the data as it was', async () => {
  const { data, storage } = await pluginData({ images: 'Art', gap: 30 });
  for (const path of ['../secret', 'C:\\secret', '/absolute', '.obsidian/plugins', 'Art/../Secret', 'Art//Images']) {
    assert.throws(() => data.setDefaults({ images: path, notes: '' }, 24), /visible folder inside this vault/);
    assert.throws(() => data.setCanvasFolders('Hero.canvas', { notes: path }), /visible folder inside this vault/);
  }
  for (const gap of [-1, 201, NaN]) assert.throws(() => data.setDefaults({ images: 'Art', notes: '' }, gap), /spacing from 0 to 200/);
  assert.deepEqual(data.defaults, { images: 'Art', notes: '' });
  assert.equal(data.gap, 30);
  assert.deepEqual(data.canvasFolders('Hero.canvas'), {});
  assert.equal(storage.saves, 0);
});

test('saves are ordered, survive a failed save, and the size source survives a reload', async () => {
  const { data, storage } = await pluginData({});
  storage.fail = true;
  await assert.rejects(data.setSizeSource('first'), /Disk full/);
  const second = data.setDefaults({ images: 'A', notes: '' }, 10);
  const third = data.setDefaults({ images: 'B', notes: '' }, 12);
  await Promise.all([second, third]);
  assert.equal(storage.value.images, 'B');
  const reloaded = await reload(storage);
  assert.equal(reloaded.sizeSource, 'first');
  assert.equal(reloaded.gap, 12);
});

test('addition order records each card once and is saved after a pause, surviving a reload', async () => {
  const { data, storage } = await pluginData({});
  data.recordAdditions('A.canvas', ['a', 'b']);
  data.recordAdditions('A.canvas', ['b', 'c']);
  assert.deepEqual(data.additions('A.canvas'), ['a', 'b', 'c']);
  assert.equal(storage.saves, 0);
  await data.flush();
  assert.equal(storage.saves, 1);
  assert.deepEqual((await reload(storage)).additions('A.canvas'), ['a', 'b', 'c']);
});

test('entries follow canvas and folder renames, and a deleted canvas keeps them', async () => {
  const { data, storage, vault } = await pluginData({ imageOrder: { 'Art/Hero.canvas': ['b', 'a'] }, canvases: { 'Art/Hero.canvas': { images: 'Art/Images' } } });
  vault.trigger('rename', { path: 'Boards' }, 'Art');
  await data.flush();
  assert.deepEqual(data.additions('Boards/Hero.canvas'), ['b', 'a']);
  assert.deepEqual(data.canvasFolders('Boards/Hero.canvas'), { images: 'Art/Images' });
  assert.deepEqual(data.additions('Art/Hero.canvas'), []);
  assert.deepEqual(storage.value.imageOrder, { 'Boards/Hero.canvas': ['b', 'a'] });
  data.recordAdditions('Boards/Hero.canvas', ['a', 'c']);
  assert.deepEqual(data.additions('Boards/Hero.canvas'), ['b', 'a', 'c']);
  vault.trigger('delete', { path: 'Boards/Hero.canvas' });
  assert.deepEqual(data.canvasFolders('Boards/Hero.canvas'), { images: 'Art/Images' });
});

test('forgetting a canvas or a folder drops everything remembered for it', async () => {
  const { data, storage } = await pluginData({ imageOrder: { 'Tests/A.canvas': ['a'], 'Tests/Run/B.canvas': ['b'], 'Keep.canvas': ['k'] }, canvases: { 'Tests/A.canvas': { images: 'Tests' } } });
  await data.forget('Tests');
  assert.deepEqual(Object.keys(storage.value.imageOrder), ['Keep.canvas']);
  assert.deepEqual(storage.value.canvases, {});
});
