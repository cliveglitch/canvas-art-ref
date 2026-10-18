import type { Plugin } from 'obsidian';
import type { CanvasIntegration } from './integration';
import { alignActions, arrangeActions, normalizeActions } from './action-catalog';
import { activeCanvas, groupSelection, imageSelection } from './bridge';

export function registerCommands(plugin: Plugin, integration: CanvasIntegration): void {
  plugin.addCommand({ id: 'optimize-groups', name: 'Optimize selected groups', checkCallback: checking => {
    const canvas = activeCanvas(plugin.app);
    const available = !!canvas && !canvas.readonly && groupSelection(canvas).length > 0;
    if (available && !checking) integration.optimize();
    return available;
  } });
  for (const { id, name, action } of [...arrangeActions, ...alignActions, ...normalizeActions]) {
    plugin.addCommand({ id, name, checkCallback: checking => {
      const canvas = activeCanvas(plugin.app);
      const available = !!canvas && !canvas.readonly && imageSelection(canvas).length > 0;
      if (available && !checking) integration.run(action);
      return available;
    } });
  }
  for (const [id, name, callback, imagesOnly] of [
    ['scale-images', 'Scale selected images', () => integration.scale(), true],
    ['canvas-folders', 'Canvas folders', () => integration.folders(), false],
    ['create-note', 'Create Markdown note in canvas', () => integration.note(), false],
  ] as const) plugin.addCommand({ id, name, checkCallback: checking => {
    const canvas = activeCanvas(plugin.app);
    const available = !!canvas && !canvas.readonly && (!imagesOnly || imageSelection(canvas).length > 0);
    if (available && !checking) callback();
    return available;
  } });
}
