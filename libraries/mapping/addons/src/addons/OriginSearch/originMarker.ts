import maplibregl from "maplibre-gl";

import type { OriginLocation } from "./originChannel";

/**
 * The pin that says where "von wo?" currently points.
 *
 * MapLibre's default marker, the same one the gazetteer drops on a selection
 * (`LibreMapSelectionContent`), because that is what a picked place looks like
 * in this app. Deliberately not a dot of its own any more: the location mode
 * draws the user as a blue dot, and a second blue dot for a picked address was
 * two ways of reading the same thing. A pin is a place, the dot is you.
 *
 * Its own marker rather than the gazetteer's, though: the origin search does not
 * hand its hit to the app's `onSelection`, so no selection is set and the map is
 * not moved.
 */

export const addOriginMarker = (
  map: maplibregl.Map,
  origin: OriginLocation
): maplibregl.Marker => {
  const marker = new maplibregl.Marker()
    .setLngLat([origin.lng, origin.lat])
    .addTo(map);
  // the name is worth having on hover, and the default marker has no slot for
  // it, so it goes on the element the marker made
  marker.getElement().title = origin.label;
  return marker;
};
