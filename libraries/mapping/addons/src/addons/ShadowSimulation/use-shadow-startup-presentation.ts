import { useCallback, useLayoutEffect, useSyncExternalStore } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import {
  hasSharedThreeShadedPresentation,
  subscribeSharedThreeShadedPresentation,
} from "@carma-mapping/engines/maplibre";

/** Keep controls interactive while the lazy renderer prepares its first pass. */
export const useShadowStartupPresentation = (
  map: MaplibreMap | null,
  enabled: boolean
) => {
  const subscribe = useCallback(
    (listener: () => void) =>
      map ? subscribeSharedThreeShadedPresentation(map, listener) : () => {},
    [map]
  );
  const getSnapshot = useCallback(
    () => !!map && hasSharedThreeShadedPresentation(map),
    [map]
  );
  const presented = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useLayoutEffect(() => {
    if (!map || !enabled || presented) return;
    const canvas = map.getCanvas();
    const previous = canvas.style.visibility;
    // Do not suspend MapLibre itself: it must produce the drape texture.
    // Hide only its not-yet-shaded presentation, not the map controls.
    canvas.style.visibility = "hidden";
    return () => {
      canvas.style.visibility = previous;
    };
  }, [map, enabled, presented]);
};
