/**
 * Leaflet initialization helpers for stories
 */

import L from "leaflet";
import { WUPPERTAL } from "@carma-commons/resources";

// Wuppertal aerial imagery WMS layer
const WUPPERTAL_LUFTBILD_WMS = {
  url: "https://geo.udsp.wuppertal.de/geoserver-cloud/ows",
  layers: "GIS-102:trueortho2024",
  format: "image/png",
  transparent: true,
  attribution: "© Stadt Wuppertal",
};

export interface LeafletSetupOptions {
  // Future: Add leaflet-specific options here
}

/**
 * Initialize Leaflet map with configuration
 */
export const initializeLeaflet = (
  container: HTMLDivElement,
  options: LeafletSetupOptions = {}
): L.Map => {
  // Create Leaflet map
  const leafletMap = L.map(container, {
    center: [WUPPERTAL.position.latitude, WUPPERTAL.position.longitude],
    zoom: 17,
    minZoom: 8,
    maxZoom: 22,
    zoomControl: false,
    attributionControl: false,
    zoomSnap: 1,
    zoomDelta: 1,
  });

  // Add Wuppertal aerial imagery WMS layer
  L.tileLayer
    .wms(WUPPERTAL_LUFTBILD_WMS.url, {
      layers: WUPPERTAL_LUFTBILD_WMS.layers,
      format: WUPPERTAL_LUFTBILD_WMS.format,
      transparent: WUPPERTAL_LUFTBILD_WMS.transparent,
      attribution: WUPPERTAL_LUFTBILD_WMS.attribution,
      maxZoom: 22,
    })
    .addTo(leafletMap);

  // Ensure map is fully initialized before invalidating size
  leafletMap.whenReady(() => {
    leafletMap.invalidateSize();
  });

  return leafletMap;
};
