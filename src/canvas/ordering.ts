import { Component, Notice, debounce } from 'obsidian';
import type { SettingsHost } from '../ui/settings';
import type { CanvasNode, NativeCanvas, NodeData } from './types';
import { isImage } from './selection';
import { SortHistory, type OrderMode } from '../layout/ordering';

/** Store insertion order separately from Canvas's mutable drawing order. */
export class ImageOrdering extends Component {
  private enabled = true;
  private attached = new WeakSet<NativeCanvas>();
  private histories = new WeakMap<NativeCanvas, { path: string; history: SortHistory }>();
  private indexes = new WeakMap<NativeCanvas, { list: string[]; ids: Set<string> }>();
  private persist = debounce(() => {
    void this.host.saveSettings().catch(() => new Notice('Could not save image addition order.'));
  }, 300, true);
  constructor(private host: SettingsHost) { super(); }

  onload(): void { this.register(() => { this.enabled = false; this.persist.run(); }); }

  attach(canvas: NativeCanvas): void {
    this.record(canvas, canvas.getData().nodes.filter(isImage).map(node => node.id));
    if (this.attached.has(canvas) || typeof canvas.addNode !== 'function') return;
    this.attached.add(canvas);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Preserve the native receiver and restore the original method on unload.
    const original = canvas.addNode;
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- The native method wrapper needs both receivers.
    const ordering = this;
    const wrapped = function(this: NativeCanvas, node: CanvasNode): void {
      const result = original.call(this, node);
      if (ordering.enabled && isImage(node.getData())) ordering.record(this, [node.id]);
      return result;
    };
    canvas.addNode = wrapped;
    const target = new WeakRef(canvas);
    this.register(() => { const live = target.deref(); if (live?.addNode === wrapped) live.addNode = original; });
  }

  prepare<T extends NodeData>(canvas: NativeCanvas, images: T[], mode: OrderMode): { images: T[]; accept: () => void } {
    this.record(canvas, images.map(node => node.id));
    const path = canvas.view.file?.path ?? '';
    let stored = this.histories.get(canvas);
    if (!stored || stored.path !== path) { stored = { path, history: new SortHistory() }; this.histories.set(canvas, stored); }
    return stored.history.prepare(images, mode, this.host.settings.imageOrder[path] ?? []);
  }

  private record(canvas: NativeCanvas, ids: string[]): void {
    const path = canvas.view.file?.path;
    if (!this.enabled || !path || !ids.length) return;
    const list = this.host.settings.imageOrder[path] ?? (this.host.settings.imageOrder[path] = []);
    let index = this.indexes.get(canvas);
    if (!index || index.list !== list) { index = { list, ids: new Set(list) }; this.indexes.set(canvas, index); }
    let changed = false;
    for (const id of ids) if (!index.ids.has(id)) { list.push(id); index.ids.add(id); changed = true; }
    if (changed) this.persist();
  }
}
