import { Plugin } from 'obsidian';
import { PluginData } from './plugin-data';
import { ObsidianCanvas } from './canvas/adapter';
import { AdditionOrder } from './canvas/addition-order';
import { ImageActions } from './canvas/image-actions';
import { CanvasIntegration } from './canvas/integration';
import { StorageRouting } from './storage/routing';
import { CanvasArtRefSettingsTab } from './ui/settings';

export default class CanvasArtRefPlugin extends Plugin {
  pluginData!: PluginData;
  canvas!: ObsidianCanvas;
  actions!: ImageActions;

  async onload(): Promise<void> {
    this.pluginData = this.addChild(new PluginData({ load: () => this.loadData(), save: data => this.saveData(data) }, this.app.vault));
    await this.pluginData.read();
    // Everything that listens to Canvas subscribes before the adapter loads and finds the open canvases.
    const canvas = this.canvas = new ObsidianCanvas(this.app);
    const additions = new AdditionOrder(this.pluginData, canvas);
    this.actions = new ImageActions(this.app, this.pluginData, additions, canvas);
    this.register(() => this.actions.stop());
    new StorageRouting(this.app, this.pluginData, canvas);
    const integration = this.addChild(new CanvasIntegration(this.app, this.pluginData, this.actions, canvas));
    this.addChild(canvas);
    this.addSettingTab(new CanvasArtRefSettingsTab(this, this.pluginData));
    for (const command of [...this.actions.commands(), ...integration.commands()]) this.addCommand(command);
  }
}
