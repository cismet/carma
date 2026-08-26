import type { Map as MaplibreMap } from "maplibre-gl";

/**
 * Which 3D layers are currently drawn on a map, as a set of layer ids.
 *
 * Deliberately not the raycast registry in `ThreeLayerManager`: that one holds
 * layer objects which have to answer `raycast`, and a 3D tileset does not. The
 * question here is a different and simpler one, whether the map draws anything
 * three dimensional at all, which is what decides whether the camera may be
 * tilted. Both managers report into it, so the answer covers vector buildings,
 * trees and tilesets alike.
 *
 * Kept on the map rather than in a module-level map, so a map that goes away
 * takes its entry with it. Compare panels each have their own.
 */

const PRESENCE_KEY = "__carma3dPresence";

const presenceOf = (map: MaplibreMap): Set<string> => {
  const existing = (map as unknown as Record<string, unknown>)[PRESENCE_KEY] as
    | Set<string>
    | undefined;
  if (existing) return existing;
  const created = new Set<string>();
  (map as unknown as Record<string, unknown>)[PRESENCE_KEY] = created;
  return created;
};

/** Report that a 3D layer is on the map. */
export const add3dPresence = (map: MaplibreMap, layerId: string): void => {
  presenceOf(map).add(layerId);
};

/** Report that it has come off again. */
export const remove3dPresence = (map: MaplibreMap, layerId: string): void => {
  presenceOf(map).delete(layerId);
};

/** Whether the map draws anything three dimensional right now. */
export const has3dLayers = (map: MaplibreMap | null | undefined): boolean =>
  !!map && presenceOf(map).size > 0;
