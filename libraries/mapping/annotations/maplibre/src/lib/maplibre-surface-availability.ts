import type { Map as MaplibreMap } from "maplibre-gl";
import type { Object3D } from "three";
import {
  getSharedThreeSceneLayerRuntimes,
  getSharedThreeSceneRuntimes,
  subscribeSharedThreeSceneContent,
  subscribeSharedThreeTerrain,
  type SharedThreeSceneRuntime,
} from "@carma-mapping/engines/maplibre";

const isVisibleRoot = (root: Object3D) => {
  for (let object: Object3D | null = root; object; object = object.parent) {
    if (!object.visible) return false;
  }
  return true;
};

/**
 * What the 3D measurement measures on, and what makes it available: 3D Tiles
 * (meshes, tilesets) and Three.js terrain. Overlays, draped receivers and
 * MapLibre's own terrain do not count.
 */
const isSurfaceRuntime = (runtime: SharedThreeSceneRuntime) =>
  Boolean(
    runtime.providesTerrain ||
      typeof runtime.getActiveTileVolumes === "function"
  );

/**
 * The visible surfaces the pointer can land on: registered content and
 * whatever else the shared layer draws (the shadow simulation's terrain).
 * Annotation roots are never among them.
 */
export const getMapLibreSurfaceRuntimes = (
  map: MaplibreMap
): SharedThreeSceneRuntime[] =>
  [
    ...new Set([
      ...getSharedThreeSceneRuntimes(map),
      ...getSharedThreeSceneLayerRuntimes(map),
    ]),
  ].filter(
    (runtime) => isSurfaceRuntime(runtime) && isVisibleRoot(runtime.root)
  );

/** Whether a mesh, tileset or Three.js terrain is drawn right now. */
const hasSurfaces = (map: MaplibreMap) =>
  getMapLibreSurfaceRuntimes(map).length > 0;

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
