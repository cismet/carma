import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import {
  getMapLoadingProgress,
  subscribeMapLoadingProgress,
} from "../integrations/map-loading-progress";
import { trackMapContentLoadingProgress } from "../integrations/map-content-loading-progress";

export const useMapLoadingProgress = (map: MaplibreMap | null) => {
  useEffect(
    () => (map ? trackMapContentLoadingProgress(map) : undefined),
    [map]
  );
  const subscribe = useCallback(
    (listener: () => void) =>
      map ? subscribeMapLoadingProgress(map, listener) : () => undefined,
    [map]
  );
  const snapshot = useCallback(() => getMapLoadingProgress(map), [map]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
};
