import { Component } from 'obsidian';
import type { PluginData } from '../plugin-data';
import type { CanvasNode, NativeCanvas } from './types';
import { isImage, type NodeData } from './data';

/** Store insertion order separately from Canvas's mutable drawing order. */
export class ImageOrdering extends Component {
  private enabled = true;
  private attached = new WeakSet<NativeCanvas>();
  constructor(private data: PluginData) { super(); }

  onload(): void { this.register(() => { this.enabled = false; }); }

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

  /** The canvas's addition order, after recording any of `images` not yet seen. */
  additions(canvas: NativeCanvas, images: NodeData[]): readonly string[] {
    this.record(canvas, images.map(node => node.id));
    return this.data.additions(canvas.view.file?.path ?? '');
  }

  private record(canvas: NativeCanvas, ids: string[]): void {
    const path = canvas.view.file?.path;
    if (!this.enabled || !path || !ids.length) return;
    this.data.recordAdditions(path, ids);
  }
}
