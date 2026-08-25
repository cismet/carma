import type { Map as MaplibreMap } from "maplibre-gl";

/**
 * The element the comparison paints into: the app map's own wrapper.
 *
 * The stage portals into it and any measurement of what covers the map area has
 * to be taken against the same box, so both sides ask here rather than each
 * walking up from the map on their own.
 */
export const stageHostOf = (map: MaplibreMap): HTMLElement => {
  const container = map.getContainer();
  return container.parentElement ?? container;
};
