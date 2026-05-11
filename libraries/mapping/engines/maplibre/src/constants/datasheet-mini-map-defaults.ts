import { CARMA_MAPLIBRE_MAP_DEFAULTS } from "./carma-maplibre-map-defaults";

export interface DatasheetMiniMapDefaults {
  width: number;
  height: number;
  padding: number;
  transitionMs: number;
  debugTransitionMs: number;
  fitBoundsPadding: number;
}

export interface DatasheetMiniMapZoomDefaults {
  defaultZoom: number;
  defaultMainMapZoom: number;
  defaultZoomOffset: number;
  wheelZoomMin: number;
  wheelZoomMax: number;
  zoomOffsetMin: number;
  zoomOffsetMax: number;
}

export const DATASHEET_MINI_MAP_DEFAULTS = {
  width: 350,
  height: 220,
  padding: 16,
  transitionMs: 200,
  debugTransitionMs: 1500,
  fitBoundsPadding: 40,
} as const satisfies DatasheetMiniMapDefaults;

export const DATASHEET_MINI_MAP_ZOOM_DEFAULTS = {
  defaultZoom: 18,
  defaultMainMapZoom: CARMA_MAPLIBRE_MAP_DEFAULTS.zoomDefault,
  defaultZoomOffset: 2,
  wheelZoomMin: CARMA_MAPLIBRE_MAP_DEFAULTS.zoomMin,
  wheelZoomMax: CARMA_MAPLIBRE_MAP_DEFAULTS.zoomMax,
  zoomOffsetMin: -5,
  zoomOffsetMax: 10,
} as const satisfies DatasheetMiniMapZoomDefaults;
