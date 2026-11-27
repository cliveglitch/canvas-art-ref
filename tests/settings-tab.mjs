import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api } from './bundle.mjs';
import { pluginData } from './fakes.mjs';

const { CanvasArtRefSettingsTab, obsidian: { TFolder } } = api;

/** The settings tab over loaded plugin data and a vault of folders. */
async function fixture(stored = { images: 'Art', notes: '', gap: 30 }) {
  const { data, storage } = await pluginData(stored);
  const entries = new Map(['', 'Art'].map(path => [path, new TFolder(path)]));
  const app = {
    vault: {
      getRoot: () => entries.get(''),
      getAbstractFileByPath: path => entries.get(path),
      createFolder: async path => { entries.set(path, new TFolder(path)); },
    },
  };
  const tab = new CanvasArtRefSettingsTab({ app }, data);
  const controls = new Map(tab.getSettingDefinitions().filter(item => item.control).map(item => [item.control.key, item.control]));
  return { tab, data, storage, entries, controls };
}

test('the declarative settings read the plugin defaults and validate inline', async () => {
  const { tab, controls } = await fixture();
  assert.deepEqual([...controls.keys()], ['images', 'notes', 'gap']);
  assert.deepEqual(['images', 'notes', 'gap'].map(key => tab.getControlValue(key)), ['Art', '', 30]);
  assert.equal(controls.get('images').validate('Art/Images'), undefined);
  assert.equal(controls.get('images').validate('/'), undefined);
  assert.equal(controls.get('notes').validate('../outside'), 'Choose a visible folder inside this vault.');
  assert.equal(controls.get('gap').validate(250), 'Enter spacing from 0 to 200.');
});

test('each change saves on its own, creating a new folder and keeping the other settings', async () => {
  const { tab, data, storage, entries } = await fixture();
  await tab.setControlValue('notes', 'Art/Notes');
  assert.ok(entries.get('Art/Notes') instanceof TFolder);
  assert.deepEqual(data.defaults, { images: 'Art', notes: 'Art/Notes' });
  await tab.setControlValue('gap', 48);
  assert.equal(data.gap, 48);
  assert.deepEqual(data.defaults, { images: 'Art', notes: 'Art/Notes' });
  assert.deepEqual([storage.value.images, storage.value.notes, storage.value.gap], ['Art', 'Art/Notes', 48]);
});

test('a rejected change leaves the settings as they were', async () => {
  const { tab, data } = await fixture();
  await assert.rejects(tab.setControlValue('gap', -1));
  await assert.rejects(tab.setControlValue('images', '.hidden'));
  assert.equal(data.gap, 30);
  assert.deepEqual(data.defaults, { images: 'Art', notes: '' });
});
