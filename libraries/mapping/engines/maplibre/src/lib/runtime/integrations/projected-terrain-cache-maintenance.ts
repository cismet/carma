const LEGACY_PROJECTED_TERRAIN_CACHE = {
  databaseName: "carma-terrain-geometry-cache",
  storeName: "projected_tiles",
  lockName: "carma-legacy-projected-terrain-cache-cleanup",
  timeoutMs: 1_000,
} as const;

/** DBC-06: explicit idle maintenance of the former localforage derived store.
 * See libraries/commons/utils/src/lib/collections/DERIVED_CACHE_DECISIONS.md. This clears
 * only projected_tiles, never the database, unrelated stores or user settings.
 * False means completion was not confirmed, not that the store was unchanged.
 */
export const cleanupLegacyProjectedTerrainCache = (): Promise<boolean> =>
  new Promise((resolve) => {
    let settled = false;
    let database: IDBDatabase | null = null;
    let transaction: IDBTransaction | null = null;
    let releaseLock = () => {};
    const finished = new Promise<void>((release) => { releaseLock = release; });
    const finish = (cleared: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (!cleared && transaction) {
        try { transaction.abort(); } catch { /* Already completed/aborted. */ }
      }
      if (database) {
        try { database.close(); } catch { /* Already closing. */ }
      }
      releaseLock();
      resolve(cleared);
    };
    const timer = setTimeout(() => finish(false), LEGACY_PROJECTED_TERRAIN_CACHE.timeoutMs);
    const start = async () => {
      const factory = globalThis.indexedDB;
      if (!factory || typeof factory.databases !== "function" || typeof factory.open !== "function") {
        finish(false);
        return;
      }
      const existing = await factory.databases();
      if (settled) return;
      if (!existing.some((entry) => entry.name === LEGACY_PROJECTED_TERRAIN_CACHE.databaseName)) {
        finish(false);
        return;
      }
      // No version argument: opening an existing store must not upgrade it.
      const request = factory.open(LEGACY_PROJECTED_TERRAIN_CACHE.databaseName);
      request.onerror = () => finish(false);
      request.onblocked = () => finish(false);
      request.onupgradeneeded = () => {
        // It disappeared after databases(): abort creation of a phantom DB.
        try { request.transaction?.abort(); } catch { /* Already aborted. */ }
        try { request.result.close(); } catch { /* No live connection. */ }
        finish(false);
      };
      request.onsuccess = () => {
        const opened = request.result;
        if (settled) {
          opened.close();
          return;
        }
        database = opened;
        database.onversionchange = () => finish(false);
        try {
          if (!database.objectStoreNames.contains(LEGACY_PROJECTED_TERRAIN_CACHE.storeName)) {
            finish(false);
            return;
          }
          transaction = database.transaction(LEGACY_PROJECTED_TERRAIN_CACHE.storeName, "readwrite");
          transaction.oncomplete = () => finish(true);
          transaction.onabort = () => finish(false);
          transaction.onerror = () => finish(false);
          transaction.objectStore(LEGACY_PROJECTED_TERRAIN_CACHE.storeName).clear().onerror =
            () => finish(false);
        } catch { finish(false); }
      };
    };
    try {
      const locks = globalThis.navigator?.locks;
      if (typeof locks?.request === "function") {
        void locks.request(LEGACY_PROJECTED_TERRAIN_CACHE.lockName, {
          mode: "exclusive", ifAvailable: true,
        }, async (lock) => {
          if (!lock || settled) {
            finish(false);
            return;
          }
          await start();
          await finished;
        }).catch(() => finish(false));
      } else {
        void start().catch(() => finish(false));
      }
    } catch { finish(false); }
  });
