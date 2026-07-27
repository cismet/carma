import localForage from "localforage";

import {
  buildFavoritesStorageKey,
  loadFavorites,
  persistFavorites,
  readLegacyFavorites,
} from "./favoritesStorage";
import type { Item } from "../lib/contracts/carma-layers.d";

const item = (id: string) => ({ id, title: id } as Item);

describe("favoritesStorage", () => {
  beforeEach(async () => {
    await localForage.clear();
  });

  it("builds per-app storage keys", () => {
    expect(buildFavoritesStorageKey("geoportal", "1")).toBe(
      "@geoportal.1.catalog.favorites"
    );
  });

  it("reads favorites from a redux-persist record", async () => {
    const legacyKey = "persist:@app.1.app.layers";
    await localForage.setItem(
      legacyKey,
      JSON.stringify({
        favorites: JSON.stringify([item("fav_a")]),
        thumbnails: JSON.stringify([]),
      })
    );

    expect(await readLegacyFavorites(legacyKey)).toEqual([item("fav_a")]);
  });

  it("returns null for missing or favorite-less legacy records", async () => {
    expect(await readLegacyFavorites("persist:missing")).toBeNull();

    await localForage.setItem(
      "persist:no-favorites",
      JSON.stringify({ thumbnails: JSON.stringify([]) })
    );
    expect(await readLegacyFavorites("persist:no-favorites")).toBeNull();
  });

  it("imports legacy favorites only while the own key was never written", async () => {
    const legacyKey = "persist:legacy";
    await localForage.setItem(
      legacyKey,
      JSON.stringify({ favorites: JSON.stringify([item("fav_a")]) })
    );
    const storageKey = buildFavoritesStorageKey("test", "1");

    // own key never written -> one-time import from the legacy record
    expect(await loadFavorites(storageKey, legacyKey)).toEqual([item("fav_a")]);

    // the user removed every favorite; persisting [] claims the key ...
    await persistFavorites(storageKey, []);

    // ... so the legacy record is not consulted again
    expect(await loadFavorites(storageKey, legacyKey)).toEqual([]);
  });

  it("loads an empty list without stored or legacy favorites", async () => {
    expect(
      await loadFavorites(
        buildFavoritesStorageKey("fresh", "1"),
        "persist:none"
      )
    ).toEqual([]);
  });
});
