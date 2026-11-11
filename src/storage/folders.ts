import { TFolder, type App } from 'obsidian';
import { folderSetting } from '../plugin-data';

export async function ensureFolder(app: App, setting: string): Promise<TFolder> {
  const path = folderSetting(setting);
  if (!path || path === '/') return app.vault.getRoot();
  let prefix = '';
  for (const part of path.split('/')) {
    prefix = prefix ? prefix + '/' + part : part;
    if (!app.vault.getAbstractFileByPath(prefix)) {
      try { await app.vault.createFolder(prefix); }
      catch (error) { if (!(app.vault.getAbstractFileByPath(prefix) instanceof TFolder)) throw error; }
    }
    if (!(app.vault.getAbstractFileByPath(prefix) instanceof TFolder)) throw new Error('A file already uses the folder path: ' + prefix);
  }
  const folder = app.vault.getAbstractFileByPath(path);
  if (!(folder instanceof TFolder)) throw new Error('Could not create the asset folder.');
  return folder;
}

export function uniqueNotePath(app: App, folder: TFolder, input: string): string {
  const name = input.trim().replace(/\.md$/i, '');
  if (!name || /[\\/:*?"<>|]/.test(name) || [...name].some(char => char.charCodeAt(0) < 32) || name.startsWith('.') || name.endsWith('.')) throw new Error('Enter a note name without path separators or reserved characters.');
  const prefix = folder.path ? folder.path + '/' : '';
  let path = prefix + name + '.md', suffix = 1;
  while (app.vault.getAbstractFileByPath(path)) path = prefix + name + ' ' + suffix++ + '.md';
  return path;
}
