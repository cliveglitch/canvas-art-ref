// Stand-ins shared by node tests.
import { api } from './bundle.mjs';

/** The in-memory DataStorage adapter: data.json as a value. */
export function memoryStorage(value) {
  return {
    value, saves: 0, fail: false,
    async load() { return structuredClone(this.value); },
    async save(data) {
      if (this.fail) { this.fail = false; throw new Error('Disk full'); }
      this.saves++; this.value = structuredClone(data);
    },
  };
}

/** Vault events that tests can trigger. */
export function vaultEvents() {
  const listeners = new Map();
  return {
    on(name, callback) {
      listeners.set(name, [...listeners.get(name) ?? [], callback]);
      return { off: () => listeners.set(name, listeners.get(name).filter(other => other !== callback)) };
    },
    trigger(name, ...args) { for (const callback of listeners.get(name) ?? []) callback(...args); },
  };
}

/** The in-memory CanvasAdapter. Boards are plain canvas data, and tests trigger what Canvas would do. */
export function memoryCanvas() {
  const listeners = { opened: [], added: [], context: [], creation: [] };
  const routes = {};
  const adapter = {
    current: undefined,
    active: () => adapter.current,
    onBoardOpened: listener => listeners.opened.push(listener),
    onCardAdded: listener => listeners.added.push(listener),
    onContextMenu: listener => listeners.context.push(listener),
    onCreationMenu: listener => listeners.creation.push(listener),
    routeImports: route => { routes.imports = route; },
    routeNewNotes: route => { routes.notes = route; },
    /** A board over `nodes` with the given cards selected, made the active canvas. */
    board(nodes, { path = 'Board.canvas', selected = [] } = {}) {
      return adapter.current = memoryBoard(nodes, path, selected);
    },
    open(board) { for (const listener of listeners.opened) listener(board); },
    addCard(board, card) { board.nodes.push(card); for (const listener of listeners.added) listener(board, card); },
    /** The plugin's handling of an import on `board`: its files, or undefined when Canvas imports natively. */
    import: (board, items, folder, native) => routes.imports?.(board, items, folder, native),
    notesFolder: canvasPath => routes.notes?.(canvasPath),
  };
  return adapter;
}

function memoryBoard(nodes, path, selected) {
  return {
    path, readonly: false, nodes, selection: new Set(selected), viewport: 1,
    /** The changes of each applied undo step. */
    steps: [],
    data() { return structuredClone({ nodes: this.nodes, edges: [] }); },
    selectedIds() { return new Set(this.selection); },
    aspect() { return this.viewport; },
    center() { return { x: 0, y: 0 }; },
    apply(changes) {
      if (this.readonly) throw new Error('This canvas is read-only.');
      const actual = [...changes].filter(([id, rect]) => {
        const node = this.nodes.find(node => node.id === id);
        return node && ['x', 'y', 'width', 'height'].some(key => node[key] !== rect[key]);
      });
      if (!actual.length) return;
      for (const [id, rect] of actual) Object.assign(this.nodes.find(node => node.id === id), rect);
      this.steps.push(new Map(actual));
    },
    addFileCard(file, position) { this.nodes.push({ id: 'card' + this.nodes.length, type: 'file', file: file.path, ...position, width: 400, height: 400 }); },
  };
}

/** Loaded plugin data over memory storage holding `value`. */
export async function pluginData(value) {
  const storage = memoryStorage(value), vault = vaultEvents();
  const data = new api.PluginData(storage, vault);
  data.load();
  await data.read();
  return { data, storage, vault };
}
