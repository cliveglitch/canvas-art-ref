import type { Board, CanvasAdapter } from './adapter';
import { isImage, type NodeData } from './data';
import type { PluginData } from '../plugin-data';

/** Addition order: the order this plugin first saw each image card on a canvas, independent of Canvas's layer order. */
export class AdditionOrder {
  constructor(private data: PluginData, canvas: CanvasAdapter) {
    // Cards already on a canvas start in their initial Canvas order; their earlier history cannot be recovered.
    canvas.onBoardOpened(board => this.record(board, board.data().nodes.filter(isImage)));
    canvas.onCardAdded((board, card) => { if (isImage(card)) this.record(board, [card]); });
  }

  /** The canvas's addition order, after recording any of `images` not yet seen. */
  of(board: Board, images: NodeData[]): readonly string[] {
    this.record(board, images);
    return this.data.additions(board.path);
  }

  private record(board: Board, cards: NodeData[]): void {
    if (board.path && cards.length) this.data.recordAdditions(board.path, cards.map(card => card.id));
  }
}
