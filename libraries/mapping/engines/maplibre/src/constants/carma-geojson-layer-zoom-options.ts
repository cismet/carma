export interface CarmaGeoJsonLayerZoomOptions {
  clusterMaxZoom: number;
  selectionSymbolLayerMinZoom: number;
  iconSymbolLayerMinZoom: number;
  labelSymbolLayerMinZoom: number;
  iconScaleMinZoom: number;
  labelOffsetScaleMinZoom: number;
}

export const DEFAULT_CARMA_GEOJSON_LAYER_ZOOM_OPTIONS = {
  clusterMaxZoom: 16,
  selectionSymbolLayerMinZoom: 9,
  iconSymbolLayerMinZoom: 0,
  labelSymbolLayerMinZoom: 16,
  iconScaleMinZoom: 9,
  labelOffsetScaleMinZoom: 17,
} as const satisfies CarmaGeoJsonLayerZoomOptions;
