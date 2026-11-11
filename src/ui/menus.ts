import type { Menu } from 'obsidian';
import type { CanvasNode, NativeCanvas } from '../canvas/types';
import { optimizeGroups, sections, type ImageActions } from '../canvas/image-actions';

// setSubmenu exists in the native Menu API but is not in the published typings.
interface SubmenuItem { setSubmenu(): Menu }

/** Add the image action submenus and Optimize group to a canvas context menu, acting on the cards selected as it opens. */
export function actionMenu(menu: Menu, canvas: NativeCanvas, actions: ImageActions, clicked?: CanvasNode): void {
  if (actions.available(canvas, 'images', clicked)) {
    const selection = actions.targets(canvas, 'images', clicked);
    for (const section of sections) {
      menu.addItem(item => {
        item.setTitle(section.title).setIcon(section.icon);
        const submenu = (item as typeof item & SubmenuItem).setSubmenu();
        if (section.id === 'normalize') {
          submenu.addItem(entry => entry.setTitle('From first').setChecked(actions.source === 'first').onClick(() => actions.setSource('first')));
          submenu.addItem(entry => entry.setTitle('Average').setChecked(actions.source === 'average').onClick(() => actions.setSource('average')));
          submenu.addSeparator();
        }
        for (const entry of section.entries) {
          // Scale selection is a separate transform after the normalizations.
          if (entry.operation === 'ask-percent') submenu.addSeparator();
          submenu.addItem(item => item.setTitle(entry.title).onClick(() => actions.run(canvas, entry, selection)));
        }
      });
    }
  }
  if (actions.available(canvas, 'groups', clicked)) {
    const groups = actions.targets(canvas, 'groups', clicked);
    menu.addItem(item => item.setTitle(groups.length === 1 ? 'Optimize group' : 'Optimize groups').setIcon('minimize').onClick(() => actions.run(canvas, optimizeGroups, groups)));
  }
}
