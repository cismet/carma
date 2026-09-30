import type { Map as MapLibreMap } from "maplibre-gl";

type Placer = Pick<MapLibreMap, "getLayersOrder" | "getLayer" | "moveLayer">;

export type FleetPlacement = {
  /**
   * The stack layer whose style launched the fleet. Its layers on the map
   * carry this id in `metadata["carma-layer-id"]`, written by the style
   * builder. Without one the fleet stays where it was added.
   */
  anchorLayerId?: string;
  /** the fleet's own layers, in the order they are drawn, bottom first */
  fleetIds: readonly string[];
  /** the dimming layer that belongs over everything, if there is one */
  spotlightId?: string;
};

const stackLayerIdOf = (map: Placer, id: string): unknown => {
  const metadata = map.getLayer(id)?.metadata;
  return metadata && typeof metadata === "object"
    ? (metadata as Record<string, unknown>)["carma-layer-id"]
    : undefined;
};

/** the map's layer order, or none while there is no style to ask */
const layerOrder = (map: Placer): string[] => {
  try {
    return map.getLayersOrder();
  } catch {
    return [];
  }
};

/**
 * Put a fleet back where it belongs in the layer order.
 *
 * The fleet adds its layers when it mounts, on top of whatever is on the map
 * then. A style that arrives later goes on top of them: the Schwebebahn's own
 * black track, loading after the addon started, covered its cars. So on every
 * `styledata` the fleet goes directly over the topmost layer of the style that
 * launched it, and the spotlight over every stack style and over the fleet.
 *
 * Layers from elsewhere that keep themselves last (cage's occlusion mask) carry
 * no stack layer id and are left above the spotlight, so the two never take
 * turns moving to the top. A `moveLayer` fires `styledata` again; nothing moves
 * when the order is already right, which ends that loop.
 */
export const placeFleet = (
  map: Placer,
  { anchorLayerId, fleetIds, spotlightId }: FleetPlacement
): void => {
  let order = layerOrder(map);
  const fleet = fleetIds.filter((id) => order.includes(id));
  const own = new Set(fleet);

  if (anchorLayerId && fleet.length > 0) {
    let top = -1;
    order.forEach((id, index) => {
      if (!own.has(id) && stackLayerIdOf(map, id) === anchorLayerId) {
        top = index;
      }
    });
    const inPlace = fleet.every((id, i) => order[top + 1 + i] === id);
    if (top >= 0 && !inPlace) {
      const rest = order.filter((id) => !own.has(id));
      const above = rest[rest.indexOf(order[top]) + 1];
      for (const id of fleet) {
        map.moveLayer(id, above);
      }
      order = layerOrder(map);
    }
  }

  if (spotlightId && order.includes(spotlightId)) {
    const covered = order
      .slice(order.indexOf(spotlightId) + 1)
      .some((id) => own.has(id) || stackLayerIdOf(map, id) !== undefined);
    if (covered) {
      map.moveLayer(spotlightId);
    }
  }
};
