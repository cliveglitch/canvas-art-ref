import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig(
  globalIgnores(['node_modules', 'main.js', 'esbuild.config.mjs', 'eslint.config.mts', 'package*.json', 'tsconfig.json', 'versions.json']),
  {
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.mts', 'manifest.json'] },
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.json'],
      },
    },
  },
  ...obsidianmd.configs.recommended,
  { ...tseslint.configs.disableTypeChecked, files: ['tests/**/*.mjs', 'tests/**/*.js'], languageOptions: { globals: globals.node, parserOptions: { projectService: false } }, rules: { 'obsidianmd/no-nodejs-modules': 'off', 'obsidianmd/hardcoded-config-path': 'off', 'no-unsanitized/method': 'off', 'no-restricted-globals': 'off', 'obsidianmd/prefer-window-timers': 'off' } },
);
