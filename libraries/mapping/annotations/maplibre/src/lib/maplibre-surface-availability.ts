import type { Map as MaplibreMap } from "maplibre-gl";
import {
  getSharedThreeSurfaceRuntimes,
  subscribeSharedThreeSceneContent,
  subscribeSharedThreeTerrain,
} from "@carma-mapping/engines/maplibre";

/** Whether a mesh, tileset or Three.js terrain is drawn right now. */
const hasSurfaces = (map: MaplibreMap) =>
  getSharedThreeSurfaceRuntimes(map).length > 0;

/**
 * Calls the listener now and whenever the shared scene content or its
 * Three.js terrain changes with whether a surface can be measured on.
 */
export const subscribeMapLibreAnnotationSurfaces = (
  map: MaplibreMap,
  listener: (available: boolean) => void
): (() => void) => {
  const notify = () => listener(hasSurfaces(map));
  notify();
  const unsubscribeContent = subscribeSharedThreeSceneContent(map, notify);
  const unsubscribeTerrain = subscribeSharedThreeTerrain(map, notify);
  return () => {
    unsubscribeContent();
    unsubscribeTerrain();
  };
};
