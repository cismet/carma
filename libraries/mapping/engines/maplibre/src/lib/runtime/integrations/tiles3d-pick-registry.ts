import type { Map as MaplibreMap } from "maplibre-gl";

import type {
  ThreeTilesRuntime,
  Tiles3dRaycastResult,
} from "./three-tiles-runtime-types";

/**
 * A mounted tileset as the click handler sees it: the same `raycast`,
 * `highlight` and `unhighlight` a GenericThreeLayer answers, plus the URL that
 * leads back to the style layer which declared the set. A tileset names no
 * source and no source-layer, so that URL is the only way back.
 */
export interface Tiles3dPickTarget {
  /** The runtime id, unique per map. */
  id: string;
  tilesetUrl: string;
  raycast: (screenX: number, screenY: number) => Tiles3dRaycastResult | null;
  highlight: (resolvedSourceIndex: number) => void;
  unhighlight: () => void;
}

const targetsByMap = new WeakMap<MaplibreMap, Tiles3dPickTarget[]>();

export const getTiles3dPickTargets = (map: MaplibreMap): Tiles3dPickTarget[] =>
  targetsByMap.get(map) ?? [];

/** Add a tileset to the click handler's targets; the returned function takes it off again. */
export const registerTiles3dPickTarget = (
  map: MaplibreMap,
  id: string,
  tilesetUrl: string,
  runtime: ThreeTilesRuntime
): (() => void) => {
  const target: Tiles3dPickTarget = {
    id,
    tilesetUrl,
    raycast: runtime.picking.raycast,
    highlight: runtime.picking.highlight,
    unhighlight: runtime.picking.unhighlight,
  };
  targetsByMap.set(map, [...getTiles3dPickTargets(map), target]);
  return () => {
    target.unhighlight();
    const remaining = getTiles3dPickTargets(map).filter(
      (candidate) => candidate !== target
    );
    if (remaining.length > 0) targetsByMap.set(map, remaining);
    else targetsByMap.delete(map);
  };
};
