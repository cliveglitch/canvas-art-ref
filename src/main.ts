import { Plugin } from 'obsidian';
import { PluginData } from './plugin-data';
import { ImageActions } from './canvas/image-actions';
import { CanvasIntegration } from './canvas/integration';
import { ImageOrdering } from './canvas/ordering';
import { CanvasArtRefSettingsTab } from './ui/settings';

export default class CanvasArtRefPlugin extends Plugin {
  pluginData!: PluginData;
  actions!: ImageActions;

  async onload(): Promise<void> {
    this.pluginData = this.addChild(new PluginData({ load: () => this.loadData(), save: data => this.saveData(data) }, this.app.vault));
    await this.pluginData.read();
    const ordering = this.addChild(new ImageOrdering(this.pluginData));
    this.actions = new ImageActions(this.app, this.pluginData, ordering);
    this.register(() => this.actions.stop());
    const integration = this.addChild(new CanvasIntegration(this.app, this.pluginData, this.actions, ordering));
    this.addSettingTab(new CanvasArtRefSettingsTab(this, this.pluginData));
    for (const command of [...this.actions.commands(), ...integration.commands()]) this.addCommand(command);
  }
}
