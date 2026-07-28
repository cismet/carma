import maplibregl from "maplibre-gl";

// Crosshair marker shown at the click position while the user is in
// FEATURE_INFO mode on a MapLibre map. The visual styling lives in
// libraries/mapping/engines/maplibre/src/styles/map.css (.feature-info-marker
// and its descendants), which is loaded by LibreMap.

const CROSSHAIR_HTML = `
  <div class="marker-inner">
    <div class="marker-circle"></div>
    <div class="marker-line horizontal-left"></div>
    <div class="marker-line horizontal-right"></div>
    <div class="marker-line vertical-top"></div>
    <div class="marker-line vertical-bottom"></div>
  </div>
`;

const createCrosshairElement = (): HTMLDivElement => {
  const crosshair = document.createElement("div");
  crosshair.className = "feature-info-marker";
  crosshair.innerHTML = CROSSHAIR_HTML;
  return crosshair;
};

export const addFeatureInfoCrosshair = (
  map: maplibregl.Map,
  latlng: { lat: number; lng: number }
): maplibregl.Marker =>
  new maplibregl.Marker({
    element: createCrosshairElement(),
    draggable: false,
  })
    .setLngLat([latlng.lng, latlng.lat])
    .addTo(map);
