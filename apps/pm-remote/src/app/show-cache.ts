import {
  DEFAULT_SHOW_READ_URL,
  fetchShow,
  isShow,
  type Show,
} from "@carma-mapping/show-remote";

import { STORAGE_PREFIX } from "./settings";

/** a local test reads from a ceepr on the same machine */
const SHOW_READ_URL =
  import.meta.env.VITE_SHOW_READ_URL || DEFAULT_SHOW_READ_URL;

/**
 * A copy of every show read, as the fallback for a venue where the store is
 * out of reach: there the remote needs only the relay. It is only a fallback,
 * since a republish replaces the show under the same key. The last few shows
 * stay, older ones make room.
 */
const SHOW_KEY_PREFIX = `${STORAGE_PREFIX}.show.`;
const INDEX_KEY = `${STORAGE_PREFIX}.shows`;
const MAX_CACHED_SHOWS = 10;

const LOG_PREFIX = "[PM REMOTE]";

const readIndex = (): string[] => {
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(INDEX_KEY) ?? "[]"
    );
    return Array.isArray(parsed)
      ? parsed.filter((key): key is string => typeof key === "string")
      : [];
  } catch {
    return [];
  }
};

export const readCachedShow = (key: string): Show | null => {
  try {
    const raw = window.localStorage.getItem(`${SHOW_KEY_PREFIX}${key}`);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isShow(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const writeCachedShow = (key: string, show: Show): void => {
  try {
    const index = [key, ...readIndex().filter((known) => known !== key)];
    index
      .slice(MAX_CACHED_SHOWS)
      .forEach((old) =>
        window.localStorage.removeItem(`${SHOW_KEY_PREFIX}${old}`)
      );
    window.localStorage.setItem(
      `${SHOW_KEY_PREFIX}${key}`,
      JSON.stringify(show)
    );
    window.localStorage.setItem(
      INDEX_KEY,
      JSON.stringify(index.slice(0, MAX_CACHED_SHOWS))
    );
  } catch (error) {
    // without the cache the show is read again next time; nothing else lost
    console.warn(`${LOG_PREFIX} caching the show failed`, error);
  }
};

/** the show under `key` from ceepr, or the copy on the phone when ceepr fails */
export const loadShow = async (key: string): Promise<Show> => {
  try {
    const show = await fetchShow(SHOW_READ_URL, key);
    writeCachedShow(key, show);
    return show;
  } catch (error) {
    const cached = readCachedShow(key);
    if (!cached) {
      throw error;
    }
    console.warn(
      `${LOG_PREFIX} reading the show failed, using the copy on this device`,
      error
    );
    return cached;
  }
};
