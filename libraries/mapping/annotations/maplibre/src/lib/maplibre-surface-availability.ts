import type { Map as MaplibreMap } from "maplibre-gl";
import type { Object3D } from "three";
import {
  getSharedThreeSceneRuntimes,
  subscribeSharedThreeSceneContent,
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

/** Roots the pointer can land on; annotation roots are never among them. */
export const getMapLibreSurfaceRoots = (map: MaplibreMap): Object3D[] =>
  getSharedThreeSceneRuntimes(map)
    .filter(
      (runtime) => isSurfaceRuntime(runtime) && isVisibleRoot(runtime.root)
    )
    .map((runtime) => runtime.root);

/** Whether a mesh or tileset is drawn through the shared Three.js layer right now. */
const hasSurfaces = (map: MaplibreMap) =>
  getMapLibreSurfaceRoots(map).length > 0;

/** Calls the listener now and whenever the shared scene content changes with whether a surface can be measured on. */
export const subscribeMapLibreAnnotationSurfaces = (
  map: MaplibreMap,
  listener: (available: boolean) => void
): (() => void) => {
  listener(hasSurfaces(map));
  return subscribeSharedThreeSceneContent(map, () => {
    listener(hasSurfaces(map));
  });
};
