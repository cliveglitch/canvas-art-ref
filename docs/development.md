# Development

Requires Node.js 18+ and npm.

```sh
npm install
npm run dev     # rebuild main.js on every change
npm run build
npm run lint
npm test
```

## Live testing

Build in `<Vault>/.obsidian/plugins/canvas-art-ref/` and enable **Canvas Art Ref** under **Settings → Community plugins**. The folder name must match the plugin ID. Generated bundles, dependencies, and personal settings are excluded from source control.

## Native checks

Native integration checks run inside the open Obsidian vault through the Obsidian CLI. Build first, then run `npm run test:native` (add `-- vault=<name>` to pick a vault, or script names such as `group` to run only those). It reloads the plugin, then runs `tests/native-*.js` in order and stops at the first failure: commands, imports, notes, dialogs and reloading (smoke); all 18 image actions with native undo/redo, addition order and menus; clipboard and drop routing; and group optimization. Reports are written to `canvas-art-ref-native` in the system temp folder.

Each script works only inside its own folder under `Canvas Art Ref tests/` at the vault root. Pass or fail, it then removes that folder, its plugin data entries, the settings it changed and the tabs it opened, and restores the previous tab. Files it created outside the test folder are removed and reported as a failure. The shared setup and cleanup live in `tests/native-harness.js`. Tests never open or edit existing boards.

## Canvas internals

Canvas's live editing API is undocumented. The plugin uses 1.12.3 API typings and has been tested in Obsidian 1.15.1; native integration may require maintenance after app updates. Every use of Canvas, importer and menu internals lives in `src/canvas/adapter.ts`; node tests replace it with the in-memory adapter in `tests/fakes.mjs`, and the native checks verify the real one. Mobile-compatible APIs are used, but testing on physical iOS and Android devices is still needed.

## Releasing

1. Set the new `version` in `manifest.json` and `package.json`, and add it to `versions.json` with its `minAppVersion`.
2. Commit, then push a tag that equals the version, without a `v`:

   ```sh
   git tag -a 1.0.0 -m 1.0.0
   git push origin 1.0.0
   ```

3. The Release workflow checks the tag, runs lint and tests, builds with `npm ci`, attests `main.js` and `manifest.json`, and opens a draft release. Add notes and publish it.

The community directory's review verifies that the release build matches the committed source, so release through the workflow rather than uploading a local build.

## README images

The GIFs and screenshots in `docs/images` were captured from a 1200 × 800 Obsidian window. `docs/listing` holds 1200 × 800 screenshots for the community directory listing.
