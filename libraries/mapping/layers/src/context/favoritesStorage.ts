import localForage from "localforage";

import type { Item } from "../lib/contracts/carma-layers.d";

export const buildFavoritesStorageKey = (
  appKey: string,
  storagePrefix: string
) => `@${appKey}.${storagePrefix}.catalog.favorites`;

/**
 * Reads favorites from a redux-persist record (the pre-context storage of the
 * geoportal favorites slice): the record is a serialized object whose fields
 * are themselves JSON strings.
 */
export const readLegacyFavorites = async (
  legacyKey: string
): Promise<Item[] | null> => {
  try {
    const record = await localForage.getItem(legacyKey);
    if (!record) {
      return null;
    }
    const parsed = typeof record === "string" ? JSON.parse(record) : record;
    const rawFavorites = parsed?.favorites;
    if (rawFavorites === undefined || rawFavorites === null) {
      return null;
    }
    const favorites =
      typeof rawFavorites === "string"
        ? JSON.parse(rawFavorites)
        : rawFavorites;
    return Array.isArray(favorites) ? favorites : null;
  } catch (error) {
    console.error(
      "[LayerCatalog] could not read legacy favorites from",
      legacyKey,
      error
    );
    return null;
  }
};

/**
 * Loads the persisted favorites. The lib's own key wins whenever it exists,
 * even holding an empty list; only a never-written key falls back to a
 * one-time import from the legacy redux-persist record. The first persist
 * after loading claims the key, so emptied favorites stay empty.
 */
export const loadFavorites = async (
  storageKey: string,
  legacyKey?: string
): Promise<Item[]> => {
  try {
    const stored = await localForage.getItem<Item[]>(storageKey);
    if (stored !== null) {
      return Array.isArray(stored) ? stored : [];
    }
  } catch (error) {
    console.error(
      "[LayerCatalog] could not read favorites from",
      storageKey,
      error
    );
    return [];
  }
  if (legacyKey) {
    const legacy = await readLegacyFavorites(legacyKey);
    if (legacy) {
      return legacy;
    }
  }
  return [];
};

export const persistFavorites = async (
  storageKey: string,
  favorites: Item[]
) => {
  try {
    await localForage.setItem(storageKey, favorites);
  } catch (error) {
    console.error(
      "[LayerCatalog] could not persist favorites to",
      storageKey,
      error
    );
  }
};
