import { Modal, Notice, PluginSettingTab, Setting, type App, type Plugin, type SettingDefinitionItem } from 'obsidian';
import { folderSetting, gapLimits, gapSetting, type Folders, type PluginData } from '../plugin-data';
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

/** The error message a setting check throws, for a declarative control's inline error. */
function problem(check: () => unknown): string | undefined {
  try { check(); return undefined; } catch (error) { return error instanceof Error ? error.message : 'Invalid value.'; }
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

  // Obsidian 1.13+ renders and searches these, saving each change; older versions use display().
  getSettingDefinitions(): SettingDefinitionItem[] {
    const folder = (key: keyof Folders, name: string, desc: string): SettingDefinitionItem => ({
      name, desc, control: { type: 'folder', key, includeRoot: true, placeholder: 'Use Obsidian settings', validate: value => problem(() => folderSetting(value)) },
    });
    return [
      { name: 'Defaults for native canvases', desc: 'Override folders from each canvas menu. Leave blank to use Obsidian settings; use / for the vault root.', searchable: false },
      folder('images', 'Images folder', 'New pasted and dropped images. Existing vault images stay in place.'),
      folder('notes', 'Notes folder', 'New Markdown notes. Text cards stay in the canvas.'),
      { name: 'Image spacing', desc: 'Spacing for image arrangements and distribution, from 0 to 200 canvas pixels.', control: { type: 'number', key: 'gap', min: gapLimits.min, max: gapLimits.max, validate: value => problem(() => gapSetting(value)) } },
    ];
  }
  getControlValue(key: string): unknown { return key === 'gap' ? this.data.gap : this.data.defaults[key as keyof Folders]; }
  async setControlValue(key: string, value: unknown): Promise<void> {
    const folders = this.data.defaults;
    if (key === 'gap') return this.data.setDefaults(folders, value as number);
    folders[key as keyof Folders] = value as string;
    await this.data.setDefaults(await validate(this.app, folders), this.data.gap);
  }

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
