// Stand-ins for the parts of the Obsidian API the plugin uses at runtime, so node tests can load all of src/.

/** Every notice message shown, newest last. */
export const notices = [];
export class Notice {
  constructor(message) { this.message = message; notices.push(message); }
  setMessage(message) { this.message = message; notices.push(message); }
  hide() {}
}

export class Component {
  _cleanups = [];
  _children = [];
  _loaded = false;
  load() {
    this._loaded = true;
    this.onload?.();
    for (const child of this._children) child.load();
  }
  unload() {
    for (const child of this._children.splice(0).reverse()) child.unload();
    for (const cleanup of this._cleanups.splice(0).reverse()) cleanup();
    this.onunload?.();
    this._loaded = false;
  }
  addChild(child) { this._children.push(child); if (this._loaded) child.load(); return child; }
  register(cleanup) { this._cleanups.push(cleanup); }
  registerEvent(ref) { this.register(() => ref.off?.()); }
  registerDomEvent(target, type, listener, options) {
    target.addEventListener(type, listener, options);
    this.register(() => target.removeEventListener(type, listener, options));
  }
}

export class Plugin extends Component {
  commands = [];
  constructor(app, manifest) { super(); this.app = app; this.manifest = manifest; }
  addCommand(command) { this.commands.push(command); return command; }
  addSettingTab(tab) { this.settingTab = tab; }
}

export class TAbstractFile { constructor(path) { this.path = path; this.name = path.split('/').pop(); } }
export class TFile extends TAbstractFile {
  constructor(path, stat = { mtime: 0, size: 0 }) {
    super(path);
    this.extension = path.includes('.') ? path.split('.').pop() : '';
    this.basename = this.name.replace(/\.[^.]*$/, '');
    this.stat = stat;
  }
}
export class TFolder extends TAbstractFile { children = []; }

export class Modal {
  constructor(app) { this.app = app; }
  open() { this.onOpen?.(); }
  close() { this.onClose?.(); }
}
export class PluginSettingTab { constructor(app, plugin) { this.app = app; this.plugin = plugin; } }
export class Setting {}
export class Menu {}

/** Obsidian's debounce: call later, or now with run(). */
export function debounce(callback, timeout = 0) {
  let timer, pending;
  const debounced = (...args) => { pending = args; clearTimeout(timer); timer = setTimeout(debounced.run, timeout); return debounced; };
  debounced.run = () => { clearTimeout(timer); if (pending) { const args = pending; pending = undefined; callback(...args); } };
  debounced.cancel = () => { clearTimeout(timer); pending = undefined; return debounced; };
  return debounced;
}
