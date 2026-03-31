/**
 * Leaflet initialization helpers for stories
 */

import L from "leaflet";
import { WUPPERTAL } from "@carma-commons/resources";

// Geoportal "Stadtplan" / "amtlich" WMTS background used across portal apps.
const GEO_PORTAL_BASE_LAYER = {
  url: "https://geodaten.metropoleruhr.de/spw2?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=spw2_light&STYLE=default&FORMAT=image/png&TILEMATRIXSET=webmercator_hq&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
  attribution: "© RVR und Kooperationspartner",
  maxNativeZoom: 20,
  maxZoom: 22,
};

export interface LeafletSetupOptions {
  allowFractionalZoom?: boolean;
  zoomDelta?: number;
  zoomSnap?: number;
}

/**
 * Initialize Leaflet map with configuration
 */
export const initializeLeaflet = (
  container: HTMLDivElement,
  options: LeafletSetupOptions = {}
): L.Map => {
  const requestedZoomDelta =
    typeof options.zoomDelta === "number" &&
    Number.isFinite(options.zoomDelta) &&
    options.zoomDelta > 0
      ? options.zoomDelta
      : typeof options.zoomSnap === "number" &&
          Number.isFinite(options.zoomSnap) &&
          options.zoomSnap > 0
        ? options.zoomSnap
      : null;
  const allowFractionalZoom =
    options.allowFractionalZoom === true ||
    (requestedZoomDelta !== null && requestedZoomDelta < 1);
  const zoomSnap = requestedZoomDelta ?? (allowFractionalZoom ? 0 : 1);
  const zoomDelta = requestedZoomDelta ?? (allowFractionalZoom ? 0.25 : 1);

  // Create Leaflet map
  const leafletMap = L.map(container, {
    center: [WUPPERTAL.position.latitude, WUPPERTAL.position.longitude],
    zoom: 17,
    minZoom: 8,
    maxZoom: 22,
    zoomControl: false,
    attributionControl: false,
    zoomSnap,
    zoomDelta,
  });

  L.tileLayer(GEO_PORTAL_BASE_LAYER.url, {
    attribution: GEO_PORTAL_BASE_LAYER.attribution,
    maxNativeZoom: GEO_PORTAL_BASE_LAYER.maxNativeZoom,
    maxZoom: GEO_PORTAL_BASE_LAYER.maxZoom,
  }).addTo(leafletMap);

  // Ensure map is fully initialized before invalidating size
  leafletMap.whenReady(() => {
    leafletMap.invalidateSize();
  });

  return leafletMap;
};
