import { useCallback, useSyncExternalStore } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

import {
  EMPTY_LAYER_LOADING_STATE,
  ensureLayerLoadingTracker,
  type LayerLoadingState,
} from "../layerLoadingTracker";

interface UseLibreLayerLoadingProps {
  map: MaplibreMap | null | undefined;
  layerId: string | null | undefined;
}

const noopSubscribe = () => () => {
  // no map: nothing ever changes
};

/**
 * MapLibre counterpart to `useLayerLoading`: reports whether the sources
 * belonging to a layer are still loading, and whether any of them errored.
 *
 * Returns `{ loading: false, error: false }` while there is no map, so callers
 * can run this next to the Leaflet hook and merge both results.
 */
export const useLibreLayerLoading = ({
  map,
  layerId,
}: UseLibreLayerLoadingProps): LayerLoadingState => {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!map) {
        return noopSubscribe();
      }
      return ensureLayerLoadingTracker(map).subscribe(onStoreChange);
    },
    [map]
  );

  const getSnapshot = useCallback(() => {
    if (!map || !layerId) {
      return EMPTY_LAYER_LOADING_STATE;
    }
    return ensureLayerLoadingTracker(map).getLayerState(layerId);
  }, [map, layerId]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

export default useLibreLayerLoading;
