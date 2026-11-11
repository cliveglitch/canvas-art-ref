import type { Menu } from 'obsidian';
import { submenu, type Board } from '../canvas/adapter';
import { optimizeGroups, sections, type ImageActions } from '../canvas/image-actions';

/** Add the image action submenus and Optimize group to a canvas context menu, acting on the cards selected as it opens. */
export function actionMenu(menu: Menu, board: Board, actions: ImageActions, clicked?: string): void {
  if (actions.available(board, 'images', clicked)) {
    const selection = actions.targets(board, 'images', clicked);
    for (const section of sections) {
      menu.addItem(item => {
        item.setTitle(section.title).setIcon(section.icon);
        const entries = submenu(item);
        if (section.id === 'normalize') {
          entries.addItem(entry => entry.setTitle('From first').setChecked(actions.source === 'first').onClick(() => actions.setSource('first')));
          entries.addItem(entry => entry.setTitle('Average').setChecked(actions.source === 'average').onClick(() => actions.setSource('average')));
          entries.addSeparator();
        }
        for (const entry of section.entries) {
          // Scale selection is a separate transform after the normalizations.
          if (entry.operation === 'ask-percent') entries.addSeparator();
          entries.addItem(item => item.setTitle(entry.title).onClick(() => actions.run(board, entry, selection)));
        }
      });
    }
  }
  if (actions.available(board, 'groups', clicked)) {
    const groups = actions.targets(board, 'groups', clicked);
    menu.addItem(item => item.setTitle(groups.length === 1 ? 'Optimize group' : 'Optimize groups').setIcon('minimize').onClick(() => actions.run(board, optimizeGroups, groups)));
  }
}
