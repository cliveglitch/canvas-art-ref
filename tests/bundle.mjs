// One build of every module in src/ for node tests, with Obsidian replaced by tests/obsidian-stub.js.
import { build } from 'esbuild';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const stub = fileURLToPath(new URL('./obsidian-stub.js', import.meta.url));
const modules = readdirSync('src', { recursive: true }).filter(file => file.endsWith('.ts')).map(file => './src/' + file.replaceAll('\\', '/'));
const result = await build({
  stdin: { contents: modules.map(module => `export * from '${module}';`).join('\n') + `\nexport * as obsidian from 'obsidian';`, resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'warning',
  plugins: [{ name: 'obsidian-stub', setup(build) { build.onResolve({ filter: /^obsidian$/ }, () => ({ path: stub })); } }],
});
export const api = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
