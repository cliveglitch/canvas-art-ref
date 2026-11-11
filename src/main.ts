import { Plugin } from 'obsidian';
import { loadSettings, renameCanvasSettings, type Settings } from './settings';
import { ImageActions } from './canvas/image-actions';
import { CanvasIntegration } from './canvas/integration';
import { ImageOrdering } from './canvas/ordering';
import { CanvasArtRefSettingsTab } from './ui/settings';

export default class CanvasArtRefPlugin extends Plugin {
  settings!: Settings;
  actions!: ImageActions;
  private saves = Promise.resolve();

  async onload(): Promise<void> {
    this.settings = loadSettings(await this.loadData() as unknown);
    const ordering = this.addChild(new ImageOrdering(this));
    this.actions = new ImageActions(this.app, () => this.settings, ordering, () => this.saveSettings());
    this.register(() => this.actions.stop());
    const integration = this.addChild(new CanvasIntegration(this, this.actions, ordering));
    this.addSettingTab(new CanvasArtRefSettingsTab(this));
    for (const command of [...this.actions.commands(), ...integration.commands()]) this.addCommand(command);
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
