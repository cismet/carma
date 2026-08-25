import maplibregl from "maplibre-gl";

import type { OriginLocation } from "./originChannel";

/**
 * The dot that says where "von wo?" currently points.
 *
 * Its own marker rather than the gazetteer's: the origin search does not hand
 * its hit to the app's `onSelection`, so no selection marker is dropped and the
 * map is not moved. The styling is inline instead of in a stylesheet, so the
 * addon carries its own look into whatever app mounts it.
 */

const createOriginElement = (label: string): HTMLDivElement => {
  const element = document.createElement("div");
  element.className = "origin-location-marker";
  element.title = label;
  element.style.cssText = [
    "width:18px",
    "height:18px",
    "border-radius:50%",
    "background:#1677ff",
    "border:3px solid #ffffff",
    "box-shadow:0 1px 4px rgba(0,0,0,0.45)",
    "box-sizing:border-box",
    "cursor:default",
  ].join(";");
  return element;
};

export const addOriginMarker = (
  map: maplibregl.Map,
  origin: OriginLocation
): maplibregl.Marker =>
  new maplibregl.Marker({
    element: createOriginElement(origin.label),
    draggable: false,
  })
    .setLngLat([origin.lng, origin.lat])
    .addTo(map);
