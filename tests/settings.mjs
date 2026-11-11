import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api } from './bundle.mjs';

test('folder overrides inherit independently and reject paths outside the vault or inside configuration folders', () => {
  const settings = api.defaults();
  settings.images = 'Art/Images'; settings.notes = 'Art/Notes';
  settings.canvases['Hero.canvas'] = { images: '/' };
  assert.deepEqual(api.foldersFor(settings, 'Hero.canvas'), { images: '/', notes: 'Art/Notes' });
  assert.equal(api.folderSetting('Art\\Images'), 'Art/Images');
  for (const path of ['../secret', 'C:\\secret', '/absolute', '.obsidian/plugins', 'Art/../Secret', 'Art//Images']) assert.throws(() => api.folderSetting(path));
  assert.equal(api.loadSettings({ images: '../secret' }).images, '');
});

test('stored source preference and insertion order survive loading and canvas-folder renames', () => {
  const settings = api.loadSettings({ normalizeSource: 'first', imageOrder: { 'Art/Hero.canvas': ['b', 'a', 'b', 5] }, canvases: { 'Art/Hero.canvas': { images: 'Art/Images' } } });
  assert.equal(settings.normalizeSource, 'first');
  assert.deepEqual(settings.imageOrder['Art/Hero.canvas'], ['b', 'a']);
  assert.equal(api.renameCanvasSettings(settings, 'Art', 'Boards'), true);
  assert.deepEqual(settings.imageOrder['Boards/Hero.canvas'], ['b', 'a']);
  assert.equal(settings.canvases['Boards/Hero.canvas'].images, 'Art/Images');
  assert.equal(settings.imageOrder['Art/Hero.canvas'], undefined);
  assert.equal(api.loadSettings({ normalizeSource: 'unexpected' }).normalizeSource, 'average');
});
