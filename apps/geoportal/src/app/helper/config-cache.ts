import localForage from "localforage";

import { APP_KEY, STORAGE_PREFIX } from "../config";
import { STORE_APP_KEY } from "../store/app-key";

/**
 * Shared configurations kept on the device, for routes that set
 * `cacheConfigsById`. A stored configuration never changes: the config service
 * can only store and read, under a random key, so a url always names the same
 * content and nothing here has to expire. The only limit is size, so past
 * MAX_ENTRIES the least recently used entry goes.
 *
 * Held in the route's own storage namespace, next to its persisted state, and
 * returned as `unknown`: what comes back from storage is checked by the caller
 * the same way a fresh response is.
 */
const MAX_ENTRIES = 50;

const CACHE_KEY =
  "@" + (STORE_APP_KEY || APP_KEY) + "." + STORAGE_PREFIX + ".app.configCache";

const LOG_PREFIX = "[CONFIG CACHE]";

type CacheEntry = { url: string; config: unknown };

/** most recently used first */
const readEntries = async (): Promise<CacheEntry[]> => {
  try {
    const stored = await localForage.getItem<CacheEntry[]>(CACHE_KEY);
    return Array.isArray(stored) ? stored : [];
  } catch (error) {
    console.warn(`${LOG_PREFIX} reading failed`, error);
    return [];
  }
};

const writeEntries = async (entries: CacheEntry[]): Promise<void> => {
  try {
    await localForage.setItem(CACHE_KEY, entries.slice(0, MAX_ENTRIES));
  } catch (error) {
    // a full or denied storage only costs the next load its shortcut
    console.warn(`${LOG_PREFIX} writing failed`, error);
  }
};

/** the configuration kept for this url, now marked as just used; undefined on a miss */
export const readCachedConfig = async (url: string): Promise<unknown> => {
  const entries = await readEntries();
  const index = entries.findIndex((entry) => entry.url === url);
  if (index === -1) {
    return undefined;
  }
  const hit = entries[index];
  if (index > 0) {
    void writeEntries([hit, ...entries.filter((_, i) => i !== index)]);
  }
  return hit.config;
};

export const writeCachedConfig = async (
  url: string,
  config: unknown
): Promise<void> => {
  const entries = await readEntries();
  await writeEntries([
    { url, config },
    ...entries.filter((entry) => entry.url !== url),
  ]);
};
