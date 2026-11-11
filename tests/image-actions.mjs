import assert from 'node:assert/strict';
import { test } from 'node:test';

export function checkImageActions(api, image) {
  const close = (a, b) => assert.ok(Math.abs(a - b) < .000001, `${a} != ${b}`);
  const nodes = [image('wide', -50, 20, 200, 100), image('tall', 200, -100, 100, 200), image('square', 400, 300, 90, 90)];
  const sources = [{ width: 1000, height: 500 }, { width: 100, height: 200 }, { width: 300, height: 300 }];
  const images = nodes.map((node, index) => api.fitted(node, node.width / node.height, sources[index]));

  test('first selected image is independent of drawing order, with reading order inside groups', () => {
    const group = { id: 'g', type: 'group', x: -100, y: -200, width: 1000, height: 1000 };
    assert.deepEqual(api.selectedImages(nodes, new Set(['square', 'wide', 'tall'])).map(node => node.id), ['square', 'wide', 'tall']);
    assert.deepEqual(api.selectedImages([group, ...nodes], new Set(['g'])).map(node => node.id), ['tall', 'wide', 'square']);
    assert.deepEqual(api.selectedImages([group, ...nodes], new Set(['square', 'g'])).map(node => node.id), ['square', 'tall', 'wide']);
  });

  test('name, path, selection and addition orders have distinct meanings', () => {
    const input = [image('3'), image('2'), image('1')];
    input[0].file = 'A/zebra10.png'; input[1].file = 'C/apple2.png'; input[2].file = 'B/apple1.png';
    assert.deepEqual(api.orderImages(input, 'name').map(node => node.id), ['1', '2', '3']);
    assert.deepEqual(api.orderImages(input, 'path').map(node => node.id), ['3', '1', '2']);
    assert.deepEqual(api.orderImages(input, 'order').map(node => node.id), ['3', '2', '1']);
    assert.deepEqual(api.orderImages(input, 'addition', ['2', '3', '1']).map(node => node.id), ['2', '3', '1']);
    assert.deepEqual(input.map(node => node.id), ['3', '2', '1']);
  });

  test('repeating an accepted sort reverses it and then restores it even when group reading order changes', () => {
    for (const mode of ['name', 'path', 'order', 'addition']) {
      const history = new api.SortHistory();
      const first = history.prepare(nodes, mode, ['tall', 'square', 'wide']); first.accept();
      const ids = first.images.map(node => node.id);
      const second = history.prepare([...nodes].reverse(), mode, ['tall', 'square', 'wide']); second.accept();
      assert.deepEqual(second.images.map(node => node.id), [...ids].reverse());
      const third = history.prepare(nodes, mode, []); third.accept();
      assert.deepEqual(third.images.map(node => node.id), ids);
    }
  });

  test('a failed layout does not reverse the next sort', () => {
    const history = new api.SortHistory();
    const uncommitted = history.prepare(nodes, 'name', []);
    assert.deepEqual(history.prepare(nodes, 'name', []).images, uncommitted.images);
  });

  test('random arrangement preserves all images and can produce both orders of a two-image selection', () => {
    for (const random of [() => 0, () => .9999]) {
      const shuffled = api.orderImages(nodes, 'random', [], random);
      assert.deepEqual(shuffled.map(node => node.id).sort(), nodes.map(node => node.id).sort());
    }
    const pair = nodes.slice(0, 2);
    assert.deepEqual(api.orderImages(pair, 'random', [], () => .9999).map(node => node.id), pair.map(node => node.id));
    assert.deepEqual(api.orderImages(pair, 'random', [], () => 0).map(node => node.id), [...pair].reverse().map(node => node.id));
  });

  test('optimal packing responds to a wide or tall viewport', () => {
    const input = Array.from({ length: 24 }, (_, index) => image(String(index), index * 110, 0));
    const wide = api.bounds([...api.pack(input, 10, [], 3).values()]);
    const tall = api.bounds([...api.pack(input, 10, [], 1 / 3).values()]);
    assert.ok(wide.width / wide.height > tall.width / tall.height);
  });

  test('packing a very large mixed selection stays fast and never overlaps', () => {
    let seed = 1;
    const random = () => (seed = seed * 16807 % 2147483647) / 2147483647;
    const input = Array.from({ length: 1500 }, (_, index) => image(String(index), index % 40 * 400, Math.floor(index / 40) * 600, 80 + random() * 600, 200 + random() * 500));
    const obstacle = { x: 2000, y: 2000, width: 800, height: 800 };
    for (const arrange of [() => api.pack(input, 24, [obstacle], 1.8), () => api.orderedPack(input, 24, [obstacle])]) {
      const started = performance.now();
      const rects = [...arrange().values()];
      // Generous bound: the previous packing took minutes at this size.
      assert.ok(performance.now() - started < 10000, 'packing 1500 images took too long');
      assert.equal(rects.length, input.length);
      for (let a = 0; a < rects.length; a++) {
        assert.equal(api.overlaps(rects[a], obstacle, 24), false);
        for (let b = a + 1; b < rects.length; b++) if (api.overlaps(rects[a], rects[b], 24)) assert.fail(`images ${a} and ${b} overlap`);
      }
    }
    // More rectangles than a Math.min(...spread) call can take.
    assert.equal(api.bounds(Array.from({ length: 200000 }, (_, x) => ({ x, y: 0, width: 1, height: 1 }))).width, 200000);
  });

  for (const mode of ['left', 'right', 'top', 'bottom']) test(`align ${mode} matches edges while retaining the other axis and image dimensions`, () => {
    const aligned = api.alignImages(nodes, mode, 24), box = api.bounds(nodes);
    for (const original of nodes) {
      const rect = aligned.get(original.id);
      assert.equal(rect.width, original.width); assert.equal(rect.height, original.height);
      if (mode === 'left') { close(rect.x, box.x); close(rect.y, original.y); }
      if (mode === 'right') { close(rect.x + rect.width, box.x + box.width); close(rect.y, original.y); }
      if (mode === 'top') { close(rect.y, box.y); close(rect.x, original.x); }
      if (mode === 'bottom') { close(rect.y + rect.height, box.y + box.height); close(rect.x, original.x); }
    }
  });

  test('stack centers images without changing sizes or their layer order', () => {
    const stacked = api.alignImages(nodes, 'stack', 24), box = api.bounds(nodes);
    assert.deepEqual([...stacked.keys()], nodes.map(node => node.id));
    for (const original of nodes) {
      const rect = stacked.get(original.id);
      close(rect.x + rect.width / 2, box.x + box.width / 2);
      close(rect.y + rect.height / 2, box.y + box.height / 2);
      assert.equal(rect.width, original.width); assert.equal(rect.height, original.height);
    }
  });

  for (const mode of ['horizontal', 'vertical']) test(`distribution ${mode} forms a centered line with the configured gap`, () => {
    for (const gap of [0, 24]) {
      const result = [...api.alignImages(nodes, mode, gap).values()];
      for (let index = 1; index < result.length; index++) {
        const a = result[index - 1], b = result[index];
        if (mode === 'horizontal') { close(b.x - (a.x + a.width), gap); close(a.y + a.height / 2, b.y + b.height / 2); }
        else { close(b.y - (a.y + a.height), gap); close(a.x + a.width / 2, b.x + b.width / 2); }
      }
    }
  });

  for (const source of ['average', 'first']) for (const mode of ['width', 'height', 'size', 'area', 'scale']) test(`normalize ${mode} from ${source} preserves proportions and uses the intended measure`, () => {
    const measure = (rect, index) => mode === 'area' ? rect.width * rect.height
      : mode === 'size' ? Math.max(rect.width, rect.height)
      : mode === 'scale' ? rect.width / sources[index].width : rect[mode];
    const initial = images.map(measure);
    const target = source === 'first' ? initial[0] : initial.reduce((sum, value) => sum + value, 0) / initial.length;
    const normalized = api.matchSizes(images, mode, source);
    images.forEach((original, index) => {
      const rect = normalized.get(original.id);
      close(measure(rect, index), target); close(rect.width / rect.height, original.ratio);
      close(rect.x, original.x); close(rect.y, original.y);
    });
    if (source === 'first') { close(normalized.get(images[0].id).width, images[0].width); close(normalized.get(images[0].id).height, images[0].height); }
  });

  test('longest-side, area and intrinsic scale normalizations produce different results', () => {
    const longest = api.matchSizes(images, 'size'), area = api.matchSizes(images, 'area'), scale = api.matchSizes(images, 'scale');
    assert.notDeepEqual([...longest.values()], [...area.values()]);
    assert.notDeepEqual([...longest.values()], [...scale.values()]);
    close(scale.get('wide').width, 500); close(scale.get('tall').width, 50);
  });

  test('stored source preference and insertion order survive loading and canvas-folder renames', () => {
    const settings = api.loadSettings({ normalizeSource: 'first', imageOrder: { 'Art/Hero.canvas': ['b', 'a', 'b', 5] }, canvases: { 'Art/Hero.canvas': { images: 'Art/Images' } } });
    assert.equal(settings.normalizeSource, 'first');
    assert.deepEqual(settings.imageOrder['Art/Hero.canvas'], ['b', 'a']);
    assert.equal(api.renameCanvasSettings(settings, 'Art', 'Boards'), true);
    assert.deepEqual(settings.imageOrder['Boards/Hero.canvas'], ['b', 'a']);
    assert.equal(settings.canvases['Boards/Hero.canvas'].images, 'Art/Images');
    assert.equal(settings.imageOrder['Art/Hero.canvas'], undefined);
    assert.equal(api.loadSettings({ normalizeSource: 'unexpected' }).normalizeSource, 'average');
  });
}
