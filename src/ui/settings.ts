import { Modal, Notice, PluginSettingTab, Setting, type App, type Plugin } from 'obsidian';
import { folderSetting, gapSetting, type Folders, type PluginData } from '../plugin-data';
import { ensureFolder } from '../storage/folders';

function fields(container: HTMLElement, values: Folders, inherited?: Folders): void {
  for (const key of ['images', 'notes'] as const) {
    new Setting(container).setName(key === 'images' ? 'Images folder' : 'Notes folder')
      .setDesc(key === 'images' ? 'New pasted and dropped images. Existing vault images stay in place.' : 'New Markdown notes. Text cards stay in the canvas.')
      .addText(text => text.setValue(values[key]).setPlaceholder(inherited?.[key] || 'Use Obsidian settings').onChange(value => values[key] = value));
  }
}

async function validate(app: App, values: Folders): Promise<Folders> {
  const folders = { images: folderSetting(values.images), notes: folderSetting(values.notes) };
  for (const path of Object.values(folders)) if (path) await ensureFolder(app, path);
  return folders;
}

export class CanvasFoldersModal extends Modal {
  constructor(app: App, private data: PluginData, private path: string) { super(app); }
  onOpen(): void {
    this.setTitle('Canvas folders');
    this.contentEl.createEl('p', { text: 'Leave blank to inherit plugin settings. Use / for the vault root. Changes affect new files only.' });
    const board = this.data.canvasFolders(this.path);
    const values = { images: board.images ?? '', notes: board.notes ?? '' };
    fields(this.contentEl, values, this.data.defaults);
    new Setting(this.contentEl).addButton(button => button.setButtonText('Save').setCta().onClick(async () => {
      button.setDisabled(true);
      try {
        await this.data.setCanvasFolders(this.path, await validate(this.app, values)); this.close();
      } catch (error) { new Notice(error instanceof Error ? error.message : 'Could not save folders.'); button.setDisabled(false); }
    }));
  }
  onClose(): void { this.contentEl.empty(); }
}

export class CanvasArtRefSettingsTab extends PluginSettingTab {
  constructor(plugin: Plugin, private data: PluginData) { super(plugin.app, plugin); }
  display(): void {
    this.containerEl.empty();
    this.containerEl.createEl('p', { text: 'Defaults for native canvases. Override folders from each canvas menu. Leave blank to use Obsidian settings; use / for the vault root.' });
    const values = this.data.defaults;
    fields(this.containerEl, values);
    let gap = String(this.data.gap);
    new Setting(this.containerEl).setName('Image spacing').setDesc('Spacing for image arrangements and distribution, from 0 to 200 canvas pixels.').addText(text => text.setValue(gap).onChange(value => gap = value));
    new Setting(this.containerEl).addButton(button => button.setButtonText('Save defaults').setCta().onClick(async () => {
      button.setDisabled(true);
      try {
        const spacing = gapSetting(Number(gap));
        await this.data.setDefaults(await validate(this.app, values), spacing); new Notice('Folder settings saved.');
      } catch (error) { new Notice(error instanceof Error ? error.message : 'Could not save settings.'); }
      button.setDisabled(false);
    }));
  }
}
