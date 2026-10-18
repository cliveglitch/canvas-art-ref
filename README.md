# Canvas Art Ref

A small extension to Obsidian's native Canvas for drawing and painting reference boards. It keeps native notes, groups, edges, selection, navigation, and file format. No separate canvas renderer, runtime dependencies, or network requests.

Select image cards, or a group containing images, then right-click:

- **Arrange images** offers **Optimal**, **By name**, **By path**, **By order**, **By addition**, and **Randomly**. Optimal packs images into a collage shaped for the current viewport. Sorted arrangements use rows; repeating a sort on the same images reverses its order. Packing avoids other cards.
- **Align images** offers **Left**, **Right**, **Top**, **Bottom**, **Stack**, **Distribute horizontal**, and **Distribute vertical**. Edge alignment matches the chosen edges. Stack centers images in a pile while retaining their native layer order. Distribution forms a row or column with the configured spacing.
- **Normalize images** offers **Height**, **Width**, **Size**, **Area**, and **Scale**. Choose **From first** or **Average** at the top of the submenu; the choice is remembered. Size matches the longest side. Area matches displayed area. Scale matches displayed size as a fraction of each image's source resolution. All preserve image proportions, subject to Canvas's pixel rounding.
- **Normalize images → Scale selection…** is an additional percentage transform that scales the whole arrangement, including spacing.

**From first** uses the first selected image. Selecting a group uses its images in reading order (top to bottom, then left to right). **By order** uses this same selection order as the Canvas equivalent of PureRef's hierarchy order. **By name** uses the filename; **By path** uses the full vault path.

**By addition** remembers when this plugin first sees each image card, independently of native layer order. Existing cards start with their initial Canvas order because their earlier insertion history cannot be recovered. Addition order is stored locally by canvas path and card ID, including removed cards so native undo can restore their place. It follows canvas and folder renames. No extra hierarchy or metadata is added to `.canvas` files.

These actions also appear in the command palette. They affect selected image cards and images fully contained within selected groups. Notes and edges are retained. Groups expand when necessary to keep their images inside. Every layout operation is one native undo step; image source files are never resized or cropped.

Right-click a group and choose **Optimize group** to fit its boundary around all fully contained cards, including notes and nested groups, without moving or resizing the contents. Padding is 20 canvas pixels on the sides and bottom, and 40 at the top. Empty groups stay unchanged. Select several groups to optimize them together in one undo step; selected nested groups are fitted before their parents. The command palette also offers **Optimize selected groups**, which can be assigned a hotkey in Obsidian settings.

## Asset folders

Set default **Images folder** and **Notes folder** in **Settings → Canvas Art Ref**. Right-click empty canvas space and select **Canvas folders…** to override them for one canvas. Leave a field blank to inherit; enter `/` for the vault root. Paths are inside the vault. Saving a folder creates it if needed.

New clipboard images and external image drops use the chosen images folder through Obsidian's native importer. Existing vault files are reused in place. Other dropped file types retain their normal destination. Without an image override, native attachment handling is unchanged.

Use **Create Markdown note…** in the native canvas menu to create a note directly in the chosen notes folder. The configured notes folder also supplies the default parent for native note creation when Canvas requests it. Text cards remain embedded in the canvas; existing notes are not moved. Folder changes affect new files only.

Per-canvas folder preferences are saved in this plugin's local `data.json`, keyed by the canvas path, and follow vault renames. Share that configuration separately if other devices need the same preferences. The `.canvas` file stays native and remains usable with the plugin disabled.

## Development

Requires Node.js 18+ and npm.

```sh
npm install
npm run build
npm run lint
npm test
```

For live testing, build in `<Vault>/.obsidian/plugins/canvas-art-ref-plugin/` and enable **Canvas Art Ref** under **Settings → Community plugins**. Release files are `main.js` and `manifest.json`. Generated bundles, dependencies, and personal settings are excluded from source control.

Native integration checks are in `tests/native-*.js`. Run `native-image-actions.js` using `scripts/obsidian-eval.ps1 -ScriptPath tests/native-image-actions.js -Vault "My vault"` to exercise all 18 actions, first/average normalization, native undo/redo, persistent addition order, menus, and reload cleanup in a separate test canvas. Results remain on `window.canvasArtRefImageChecks` and in the ignored `output/image-action-checks.json`. The earlier import and note checks use `native-setup.js`, followed by the smoke, interactions, lifecycle, and dialogs scripts. Tests do not edit existing boards.

Run `native-storage-routing.js` with the same helper to check clipboard imports across event listener microtasks, image drops, missing image folders, and existing-file reuse. It removes its temporary canvas and imported fixtures, restores the previous tab, and writes `output/storage-routing-checks.json`.

After successful image-action checks, run `native-image-cleanup.js` with the same helper to close their tabs and remove only their generated scratch folders. The previous active tab is restored. The test report remains in `output/`.

Run `native-group-actions.js` with the same helper to check group menus, commands, padding, unchanged card data, nested selections, and native undo/redo. It cleans up its scratch canvas automatically, restores the previous tab, and writes `output/group-action-checks.json`.

Canvas's live editing API is undocumented. The plugin uses 1.12.3 API typings and has been tested in Obsidian 1.14.4; native integration may require maintenance after app updates. Mobile-compatible APIs are used, but testing on physical iOS and Android devices is still needed.
