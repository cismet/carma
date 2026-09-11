import { createNamespace } from "./create-namespace";

/**
 * Options accepted by every nuke command.
 *
 * `reload` forces a full page reload after wiping, so nothing in memory
 * (redux-persist, react-query, contexts) can write the old state back.
 * `all()` reloads by default; the targeted commands do not.
 */
export interface NukeOptions {
  reload?: boolean;
}

/** Snapshot of what is currently persisted in the browser, per storage. */
export interface NukeInventory {
  localStorage: string[];
  sessionStorage: string[];
  /** keys in the default localforage store (redux-persist, favorites, ...) */
  localforage: string[];
  /** keys in the layer catalog query cache (capabilities etc.) */
  catalogCache: string[];
  /** names of all IndexedDB databases of this origin */
  indexedDB: string[];
}

/** A single nuke command: resolves with the keys/databases it removed. */
export type NukeCommand = (options?: NukeOptions) => Promise<string[]>;

/**
 * Raw injection point for the `nuke` namespace. The bridge provides these
 * closures. Optional methods may be left unimplemented; the facade resolves
 * with an empty list.
 */
export interface NukeAdapter {
  all?: NukeCommand;
  persistedState?: NukeCommand;
  layers?: NukeCommand;
  catalogCache?: NukeCommand;
  favorites?: NukeCommand;
  measurements?: NukeCommand;
  addonOverrides?: NukeCommand;
  auth?: NukeCommand;
  localStorage?: NukeCommand;
  list?: () => Promise<NukeInventory>;
}

/** Public shape seen by callers of `carma.nuke`. */
export interface NukeFacade {
  /** Wipe every storage of this origin and reload (pass `{ reload: false }` to stay). */
  all: NukeCommand;
  /** redux-persist records (`persist:*`) in localforage */
  persistedState: NukeCommand;
  /** only redux `mapping.layers` (in memory + persisted); saved maps stay */
  layers: NukeCommand;
  /** layer catalog query cache: WMS capabilities, additional/sensor/object configs */
  catalogCache: NukeCommand;
  /** layer catalog favorites */
  favorites: NukeCommand;
  /** cismap, libre and redux-persisted measurements */
  measurements: NukeCommand;
  /** addon overrides (shared and per-route) in localStorage */
  addonOverrides: NukeCommand;
  /** jwt, user and user groups of the auth provider */
  auth: NukeCommand;
  /** everything in window.localStorage */
  localStorage: NukeCommand;
  /** look before you nuke */
  list: () => Promise<NukeInventory>;
}

const EMPTY_INVENTORY: NukeInventory = {
  localStorage: [],
  sessionStorage: [],
  localforage: [],
  catalogCache: [],
  indexedDB: [],
};

const command =
  (
    get: () => NukeAdapter | null,
    name: keyof Omit<NukeAdapter, "list">
  ): NukeCommand =>
  (options) =>
    get()?.[name]?.(options) ?? Promise.resolve([]);

export const { facade: nuke, register: registerNuke } = createNamespace<
  NukeAdapter,
  NukeFacade
>((get) => ({
  all: command(get, "all"),
  persistedState: command(get, "persistedState"),
  layers: command(get, "layers"),
  catalogCache: command(get, "catalogCache"),
  favorites: command(get, "favorites"),
  measurements: command(get, "measurements"),
  addonOverrides: command(get, "addonOverrides"),
  auth: command(get, "auth"),
  localStorage: command(get, "localStorage"),
  list: () => get()?.list?.() ?? Promise.resolve(EMPTY_INVENTORY),
}));
