import { Menu } from 'obsidian';
import type { ImageActions } from '../canvas/actions';
import type { NativeCanvas, NodeData } from '../canvas/types';
import { alignActions, arrangeActions, normalizeActions } from '../canvas/action-catalog';
import { ScaleModal } from './dialogs';
import type { App } from 'obsidian';

// setSubmenu exists in the native Menu API but is not in the published typings.
interface SubmenuItem { setSubmenu(): Menu }
export function imageMenu(menu: Menu, canvas: NativeCanvas, images: NodeData[], actions: ImageActions, app: App): void {
  if (canvas.readonly || !images.length) return;
  for (const [title, icon, entries] of [
    ['Arrange images', 'layout-grid', arrangeActions],
    ['Align images', 'align-start-horizontal', alignActions],
    ['Normalize images', 'scaling', normalizeActions],
  ] as const) {
    menu.addItem(item => {
      item.setTitle(title).setIcon(icon);
      const submenu = (item as typeof item & SubmenuItem).setSubmenu();
      if (entries === normalizeActions) {
        submenu.addItem(entry => entry.setTitle('From first').setChecked(actions.source === 'first').onClick(() => actions.setSource('first')));
        submenu.addItem(entry => entry.setTitle('Average').setChecked(actions.source === 'average').onClick(() => actions.setSource('average')));
        submenu.addSeparator();
      }
      for (const entry of entries) submenu.addItem(item => item.setTitle(entry.title).onClick(() => actions.run(canvas, entry.action, images)));
      if (entries === normalizeActions) {
        submenu.addSeparator();
        submenu.addItem(entry => entry.setTitle('Scale selection…').onClick(() => new ScaleModal(app, percent => actions.scale(canvas, percent, images)).open()));
      }
    });
  }
}
