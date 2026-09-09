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
