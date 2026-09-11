import { useLayoutEffect } from "react";
import type { Store } from "redux";

import { registerNuke, type NukeAdapter } from "@carma-api";

import {
  listStorage,
  nukeAddonOverrides,
  nukeAll,
  nukeAuth,
  nukeCatalogCache,
  nukeFavorites,
  nukeLayers,
  nukeLocalStorage,
  nukeMeasurements,
  nukePersistedState,
} from "./nuke-storage";

/**
 * Registers the `carma.nuke` adapter: wipes persisted browser state when
 * development gets into a broken state. The commands operate on the
 * browser storages directly (see nuke-storage.ts); `layers` additionally
 * clears the in-memory redux layer stack when the store is available.
 *
 * To add a nuke command: extend `NukeAdapter` in `@carma-api`, add the
 * matcher + command in nuke-storage.ts, then list it here.
 */
export const useNukeAdapter = (store?: Store): void => {
  useLayoutEffect(() => {
    const adapter: NukeAdapter = {
      all: nukeAll,
      persistedState: nukePersistedState,
      layers: nukeLayers(store),
      catalogCache: nukeCatalogCache,
      favorites: nukeFavorites,
      measurements: nukeMeasurements,
      addonOverrides: nukeAddonOverrides,
      auth: nukeAuth,
      localStorage: nukeLocalStorage,
      list: listStorage,
    };
    registerNuke(adapter);
    return () => registerNuke(null);
  }, [store]);
};
