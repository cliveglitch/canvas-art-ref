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

/** Loaded plugin data over memory storage holding `value`. */
export async function pluginData(value) {
  const storage = memoryStorage(value), vault = vaultEvents();
  const data = new api.PluginData(storage, vault);
  data.load();
  await data.read();
  return { data, storage, vault };
}
