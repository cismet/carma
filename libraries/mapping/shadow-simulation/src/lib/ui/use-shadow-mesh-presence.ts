import { useCallback, useSyncExternalStore } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import {
  getSharedThreeSceneRuntimes,
  subscribeSharedThreeSceneContent,
} from "@carma-mapping/engines/maplibre";

export const useShadowMeshPresence = (map?: MaplibreMap | null) => {
  const subscribe = useCallback(
    (listener: () => void) =>
      map ? subscribeSharedThreeSceneContent(map, listener) : () => {},
    [map]
  );
  const getMeshPresence = useCallback(
    () =>
      Boolean(
        map &&
          getSharedThreeSceneRuntimes(map).some(
            (runtime) =>
              runtime.providesTerrain === true &&
              typeof runtime.setErrorTarget === "function"
          )
      ),
    [map]
  );
  return useSyncExternalStore(subscribe, getMeshPresence, getMeshPresence);
};

/** The mesh tileset's own (host) error target, or null without a mesh. */
export const useShadowTilesetErrorTarget = (map?: MaplibreMap | null) => {
  const subscribe = useCallback(
    (listener: () => void) =>
      map ? subscribeSharedThreeSceneContent(map, listener) : () => {},
    [map]
  );
  const getTilesetErrorTarget = useCallback(() => {
    if (!map) return null;
    const mesh = getSharedThreeSceneRuntimes(map).find(
      (runtime) =>
        runtime.providesTerrain === true &&
        typeof runtime.getErrorTarget === "function"
    );
    return mesh?.getErrorTarget?.() ?? null;
  }, [map]);
  return useSyncExternalStore(
    subscribe,
    getTilesetErrorTarget,
    getTilesetErrorTarget
  );
};
