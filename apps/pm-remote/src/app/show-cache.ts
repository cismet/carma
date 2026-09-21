import {
  DEFAULT_SHOW_READ_URL,
  fetchShow,
  isShow,
  type Show,
} from "@carma-mapping/show-remote";

import { STORAGE_PREFIX } from "./settings";

/**
 * A stored show never changes (ceepr gives every publish a new key), so what
 * was read once under a key is kept: at the venue the remote needs no store,
 * only the relay. The last few shows stay, older ones make room.
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

/** the show under `key`, from the phone if it was read before, else from ceepr */
export const loadShow = async (key: string): Promise<Show> => {
  const cached = readCachedShow(key);
  if (cached) {
    return cached;
  }
  const show = await fetchShow(DEFAULT_SHOW_READ_URL, key);
  writeCachedShow(key, show);
  return show;
};
