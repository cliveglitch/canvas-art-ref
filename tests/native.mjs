// Runs the native Canvas checks in the open Obsidian vault through the Obsidian CLI, stopping at the first failure.
// Usage: npm run test:native [-- vault=<name>] [script names to run only those]
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const scripts = ['native-smoke.js', 'native-image-actions.js', 'native-storage-routing.js', 'native-group-actions.js'];
const args = process.argv.slice(2);
const vault = args.filter(arg => arg.startsWith('vault='));
const names = args.filter(arg => !arg.startsWith('vault='));
const selected = names.length ? scripts.filter(script => names.some(name => script.includes(name))) : scripts;
const reports = join(tmpdir(), 'canvas-art-ref-native');
const log = message => process.stdout.write(message + '\n');
await mkdir(reports, { recursive: true });

const obsidian = (...command) => promisify(execFile)('obsidian', [...vault, ...command], { maxBuffer: 1 << 24, timeout: 600000 });
// Test the freshly built main.js rather than the copy Obsidian loaded earlier.
await obsidian('plugin:reload', 'id=canvas-art-ref');
// Read the scripts from the installed plugin, which keeps the CLI argument short.
const read = file => `app.vault.adapter.read(app.plugins.manifests['canvas-art-ref'].dir + '/tests/${file}')`;
for (const script of selected) {
  const code = `Promise.all([${read('native-harness.js')}, ${read(script)}]).then(([harness, test]) => eval(harness + '\\n' + test))`;
  const { stdout } = await obsidian('eval', 'code=' + code);
  // The CLI prints "=> <value>" or "Error: <message>" and always exits successfully.
  const output = stdout.trim();
  let report;
  try { report = JSON.parse(output.replace(/^=> /, '')); } catch { report = { ok: false, failure: output || 'Obsidian returned no output.' }; }
  const file = join(reports, script.replace(/\.js$/, '.json'));
  await writeFile(file, JSON.stringify(report, null, 2));
  log(`${report.ok ? 'ok' : 'FAILED'} ${script}: ${report.passed?.length ?? 0} checks${report.ok ? '' : ' — ' + report.failure}`);
  if (report.leaked?.length) log('  removed files created outside the test folder: ' + report.leaked.join(', '));
  if (!report.ok) { log('  report: ' + file); process.exitCode = 1; break; }
}
if (!process.exitCode) log('reports: ' + reports);
