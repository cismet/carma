import { useEffect } from "react";
import maplibregl from "maplibre-gl";
import type { LngLat } from "../helper/geo";

/**
 * Ring at the tapped position, the place a new Leerstand takes its geometry
 * from. A DOM marker and not a style layer: the inline style is re-merged on
 * every reload of the feature collection, a marker is not touched by that.
 * Every tap builds a new element, which replays the pulse of `.ls-tap-marker`.
 */
export const useTapMarker = (map: maplibregl.Map | null, lngLat?: LngLat) => {
  useEffect(() => {
    if (!map || !lngLat) return;
    const element = document.createElement("div");
    element.className = "ls-tap-marker";
    const marker = new maplibregl.Marker({ element })
      .setLngLat(lngLat)
      .addTo(map);
    return () => {
      marker.remove();
    };
  }, [map, lngLat]);
};
