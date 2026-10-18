import { Plugin } from 'obsidian';
import { loadSettings, renameCanvasSettings, type Settings } from './settings';
import { registerCommands } from './canvas/commands';
import { CanvasIntegration } from './canvas/integration';
import { CanvasArtRefSettingsTab } from './ui/settings';

export default class CanvasArtRefPlugin extends Plugin {
  settings!: Settings;
  private saves = Promise.resolve();

  async onload(): Promise<void> {
    this.settings = loadSettings(await this.loadData() as unknown);
    const integration = this.addChild(new CanvasIntegration(this));
    this.addSettingTab(new CanvasArtRefSettingsTab(this));
    registerCommands(this, integration);
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      if (renameCanvasSettings(this.settings, oldPath, file.path)) void this.saveSettings();
    }));
  }

  saveSettings(): Promise<void> {
    const snapshot = structuredClone(this.settings);
    this.saves = this.saves.catch(() => {}).then(() => this.saveData(snapshot));
    return this.saves;
  }
}
