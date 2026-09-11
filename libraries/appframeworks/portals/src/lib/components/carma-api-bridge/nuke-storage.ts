import localforage from "localforage";
import type { Store } from "redux";

import type { NukeInventory, NukeOptions } from "@carma-api";

/**
 * Storage wiping behind `carma.nuke`. Everything here matches keys by
 * pattern instead of a hard-coded list, so new persisted keys that follow
 * the existing naming stay covered without touching this file.
 */

const LOG_PREFIX = "[NUKE]";

/** Must match the instance created in CatalogQueryProvider (mapping-layers). */
const CATALOG_CACHE = { name: "carma-layer-catalog", storeName: "queryCache" };

type KeyMatcher = (key: string) => boolean;

const matchAll: KeyMatcher = () => true;

const getCatalogCache = () => localforage.createInstance(CATALOG_CACHE);

const log = (scope: string, removed: string[]) => {
  console.info(LOG_PREFIX, scope, { removed: removed.length, keys: removed });
};

const reloadIfWanted = (options?: NukeOptions, fallback = false) => {
  if (options?.reload ?? fallback) {
    console.info(LOG_PREFIX, "reloading");
    window.location.reload();
  }
};

/* ---------- web storage ---------- */

const storageKeys = (storage: Storage): string[] => {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key !== null) {
      keys.push(key);
    }
  }
  return keys;
};

const wipeWebStorage = (storage: Storage, match: KeyMatcher): string[] => {
  const removed = storageKeys(storage).filter(match);
  removed.forEach((key) => storage.removeItem(key));
  return removed;
};

/* ---------- localforage ---------- */

const wipeLocalforage = async (
  instance: LocalForage,
  match: KeyMatcher
): Promise<string[]> => {
  const removed = (await instance.keys()).filter(match);
  await Promise.all(removed.map((key) => instance.removeItem(key)));
  return removed;
};

/**
 * Drops single fields from redux-persist records instead of the whole
 * record. A record is a JSON object whose values are JSON strings, one per
 * persisted slice field. Returns "<key>.<field>" for every field removed.
 */
const dropPersistedFields = async (
  match: KeyMatcher,
  fields: string[]
): Promise<string[]> => {
  const removed: string[] = [];
  const keys = (await localforage.keys()).filter(
    (key) => isPersistedState(key) && match(key)
  );
  for (const key of keys) {
    const raw = await localforage.getItem<string>(key);
    if (typeof raw !== "string") {
      continue;
    }
    let record: Record<string, string>;
    try {
      record = JSON.parse(raw);
    } catch {
      console.warn(LOG_PREFIX, "unreadable redux-persist record", key);
      continue;
    }
    const present = fields.filter((field) => field in record);
    if (present.length === 0) {
      continue;
    }
    present.forEach((field) => {
      delete record[field];
      removed.push(`${key}.${field}`);
    });
    await localforage.setItem(key, JSON.stringify(record));
  }
  return removed;
};

/* ---------- IndexedDB ---------- */

const listIndexedDBs = async (): Promise<string[]> => {
  if (typeof indexedDB === "undefined" || !indexedDB.databases) {
    return [];
  }
  const dbs = await indexedDB.databases();
  return dbs.map((db) => db.name).filter((name): name is string => !!name);
};

const deleteIndexedDB = (name: string) =>
  new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => {
      console.warn(
        LOG_PREFIX,
        "could not delete IndexedDB",
        name,
        request.error
      );
      resolve();
    };
    request.onblocked = () => {
      console.warn(
        LOG_PREFIX,
        "IndexedDB delete blocked (open connections)",
        name
      );
      resolve();
    };
  });

const wipeIndexedDBs = async (): Promise<string[]> => {
  const names = await listIndexedDBs();
  await Promise.all(names.map(deleteIndexedDB));
  return names;
};

/* ---------- key matchers ---------- */

// redux-persist records: persist:@geoportal.1.app.mapping, ...
const isPersistedState: KeyMatcher = (key) => key.startsWith("persist:");

// persist:@geoportal.1.app.mapping: the layer stack lives in here
const isPersistedMapping: KeyMatcher = (key) => key.endsWith(".app.mapping");

// persist:@geoportal.1.app.layers: thumbnails (and legacy favorites)
const isPersistedLayers: KeyMatcher = (key) => key.endsWith(".app.layers");

// @geoportal.1.catalog.favorites, legacy persist:@geoportal.1.app.layers
const isFavorites: KeyMatcher = (key) =>
  key.includes(".catalog.favorites") || isPersistedLayers(key);

// persist:@geoportal.1.app.measurements, @geoportal.app.measurements,
// geoportal:libreMeasurements, measurementShapes
const isMeasurements: KeyMatcher = (key) =>
  key.toLowerCase().includes("measurement");

// carma::addonOverrides, carma::addonOverrides::<scope>
const isAddonOverrides: KeyMatcher = (key) =>
  key.startsWith("carma::addonOverrides");

// <prefix>_jwt, <prefix>_user, <prefix>_userGroups
const isAuth: KeyMatcher = (key) => /_(jwt|user|userGroups)$/.test(key);

/* ---------- commands ---------- */

const run =
  (scope: string, wipe: () => Promise<string[]> | string[]) =>
  async (options?: NukeOptions): Promise<string[]> => {
    const removed = await wipe();
    log(scope, removed);
    reloadIfWanted(options);
    return removed;
  };

export const nukePersistedState = run("persistedState", () =>
  wipeLocalforage(localforage, isPersistedState)
);

export const nukeCatalogCache = run("catalogCache", () =>
  wipeLocalforage(getCatalogCache(), matchAll)
);

export const nukeFavorites = run("favorites", () =>
  wipeLocalforage(localforage, isFavorites)
);

export const nukeMeasurements = run("measurements", async () => [
  ...(await wipeLocalforage(localforage, isMeasurements)),
  ...wipeWebStorage(window.localStorage, isMeasurements),
]);

/**
 * Clears only the redux `mapping.layers` state: in memory (when the bridge
 * has the store) and its persisted copy. Saved maps (`savedLayerConfigs`),
 * background layer, thumbnails and ui flags are left alone.
 */
export const nukeLayers = (store?: Store) =>
  run("layers", async () => {
    const removed: string[] = [];
    if (store) {
      store.dispatch({ type: "mapping/setLayers", payload: [] });
      removed.push("redux:mapping.layers");
    }
    removed.push(
      ...(await dropPersistedFields(isPersistedMapping, ["layers"]))
    );
    return removed;
  });

export const nukeAddonOverrides = run("addonOverrides", () =>
  wipeWebStorage(window.localStorage, isAddonOverrides)
);

export const nukeAuth = run("auth", () => wipeLocalforage(localforage, isAuth));

export const nukeLocalStorage = run("localStorage", () =>
  wipeWebStorage(window.localStorage, matchAll)
);

export const nukeAll = async (options?: NukeOptions): Promise<string[]> => {
  const removed = [
    ...wipeWebStorage(window.localStorage, matchAll),
    ...wipeWebStorage(window.sessionStorage, matchAll),
    ...(await wipeLocalforage(localforage, matchAll)),
    ...(await wipeLocalforage(getCatalogCache(), matchAll)),
    ...(await wipeIndexedDBs()),
  ];
  log("all", removed);
  reloadIfWanted(options, true);
  return removed;
};

export const listStorage = async (): Promise<NukeInventory> => {
  const inventory: NukeInventory = {
    localStorage: storageKeys(window.localStorage),
    sessionStorage: storageKeys(window.sessionStorage),
    localforage: await localforage.keys(),
    catalogCache: await getCatalogCache().keys(),
    indexedDB: await listIndexedDBs(),
  };
  console.info(LOG_PREFIX, "inventory", inventory);
  return inventory;
};
