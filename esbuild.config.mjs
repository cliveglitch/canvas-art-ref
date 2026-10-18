import { context } from 'esbuild';

const build = await context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: ['obsidian'],
  format: 'cjs',
  target: 'es2021',
  outfile: 'main.js',
  minify: process.argv.includes('production'),
  sourcemap: process.argv.includes('production') ? false : 'inline',
  logLevel: 'info',
});
if (process.argv.includes('production')) {
  await build.rebuild();
  await build.dispose();
} else {
  await build.watch();
}
