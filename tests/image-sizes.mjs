import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api } from './bundle.mjs';

const { ImageSizes, obsidian: { TFile, notices } } = api;

function fixture(count) {
  const files = new Map(Array.from({ length: count }, (_, index) => [index + '.png', new TFile(index + '.png', { mtime: 1, size: 1 })]));
  const app = { vault: { getAbstractFileByPath: path => files.get(path) } };
  const loads = [];
  let active = 0, peak = 0;
  const sizes = new ImageSizes(app, async file => {
    loads.push(file.path); peak = Math.max(peak, ++active);
    await new Promise(resolve => setTimeout(resolve, 1));
    active--;
    return { width: 2, height: Number.parseInt(file.basename) + 1 };
  });
  return { files, sizes, loads, peak: () => peak };
}

test('natural sizes are read at most 16 at a time and reused until a file changes', async () => {
  const { files, sizes, loads, peak } = fixture(40);
  const paths = [...files.keys()];
  const result = await sizes.measure([...paths, paths[0]]);
  assert.equal(result.size, 40);
  assert.deepEqual(result.get('7.png'), { width: 2, height: 8 });
  assert.equal(loads.length, 40);
  assert.ok(peak() <= 16 && peak() > 1);
  await sizes.measure(paths);
  assert.equal(loads.length, 40);
  files.get('3.png').stat = { mtime: 2, size: 1 };
  await sizes.measure(paths);
  assert.deepEqual(loads.slice(40), ['3.png']);
});

test('large batches show progress, and a missing image is reported by its path', async () => {
  const { files, sizes } = fixture(60);
  notices.length = 0;
  await sizes.measure([...files.keys()]);
  assert.equal(notices[0], 'Reading image sizes… 0/60');
  assert.equal(notices.at(-1), 'Reading image sizes… 60/60');
  await assert.rejects(sizes.measure(['missing.png']), /An image is missing: missing\.png/);
});
