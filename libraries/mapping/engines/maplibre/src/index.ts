// @carma-mapping/engines/maplibre
// MapLibre GL JS integration for CARMA mapping framework

export const MAPLIBRE_ENGINE_VERSION = "0.0.1";
export * from "./lib/contracts/maplibre-style.d";

// Components
export { LibreMap } from "./components/LibreMap";
export type {
  LibreMapProps,
  GeoJsonData,
  VectorStyle,
  LibreLayer,
  RasterPaintOverrides,
} from "./components/LibreMap";
export { RASTER_PAINT_PRESETS } from "./utils/rasterPaintPresets";
export {
  DEFAULT_MAX_PITCH,
  getCameraRestriction,
  setCameraRestrictionOverride,
  subscribeCameraRestriction,
  useCameraRestriction,
} from "./utils/cameraRestriction";
export type { CameraRestriction } from "./utils/cameraRestriction";
export {
  getMapLayers,
  publishMapLayers,
  subscribeMapLayers,
  useMapLayers,
} from "./utils/mapLayers";
export {
  getMapThreeRuntimeParams,
  publishMapThreeRuntimeParams,
  subscribeMapThreeRuntimeParams,
  useMapThreeRuntimeParams,
  type ThreeRuntimeParams,
} from "./utils/mapThreeParams";
export { LibreMapSelectionContent } from "./components/LibreMapSelectionContent";
export { PreviewLibreMap } from "./components/PreviewLibreMap";
export { DatasheetMiniMap } from "./components/DatasheetMiniMap";
export type { DatasheetMiniMapProps } from "./components/DatasheetMiniMap";

// Context
export {
  LibreContext,
  LibreContextProvider,
  useLibreContext,
} from "./contexts/LibreContext";
export type {
  LibreContextType,
  GeoJsonMetadata,
} from "./contexts/LibreContext";

export {
  MapSelectionContext,
  MapSelectionProvider,
  useMapSelection,
} from "./contexts/MapSelectionContext";
export type {
  MapSelectionContextType,
  SelectedFeatureIdentifier,
} from "./contexts/MapSelectionContext";

export {
  DatasheetContext,
  DatasheetProvider,
  useDatasheet,
} from "./contexts/DatasheetContext";
export type { DatasheetContextType } from "./contexts/DatasheetContext";

export {
  MapHighlightContext,
  MapHighlightProvider,
  useMapHighlight,
} from "./contexts/MapHighlightContext";
export type {
  MapHighlightContextType,
  HighlightCriteria,
  PropertyMatcher,
  QueryId,
  ToggledFeature,
} from "./contexts/MapHighlightContext";

// Hooks
export { useClusterMarkers } from "./hooks/useClusterMarkers";
export { useSelectionLibreMap } from "./hooks/useSelectionLibreMap";
export { useDatasheetMiniMap } from "./hooks/useDatasheetMiniMap";
export type {
  UseDatasheetMiniMapOptions,
  UseDatasheetMiniMapResult,
} from "./hooks/useDatasheetMiniMap";
export { useMapHighlighting } from "./hooks/useMapHighlighting";
export type { UseMapHighlightingOptions } from "./hooks/useMapHighlighting";
export { useLayerFilter } from "./hooks/useLayerFilter";
export type {
  FilterCategory,
  UseLayerFilterOptions,
  UseLayerFilterResult,
} from "./hooks/useLayerFilter";
export { useSelectionNeighborhood } from "./hooks/useSelectionNeighborhood";
export type {
  NeighborPredicate,
  UseSelectionNeighborhoodOptions,
} from "./hooks/useSelectionNeighborhood";
export { useLassoHighlight } from "./hooks/useLassoHighlight";
export type { LassoOperation } from "./hooks/useLassoHighlight";
export type {
  UseLassoHighlightOptions,
  UseLassoHighlightResult,
} from "./hooks/useLassoHighlight";

// Style utilities
export {
  vectorStylesToMapLibreStyle,
  styleManipulation,
  getVectorMapping,
  getPaintProperty,
  prefixPatternExpression,
  type GeoJsonStyleMetadata,
  type VectorStylesToMapLibreStyleOptions,
  type VectorStylesToMapLibreStyleResult,
} from "./utils/styleBuilder";

// Imperative style composition
export {
  StyleComposer,
  slugifyUrl,
  getCarmaLayerIdMap,
} from "./utils/styleComposer";
export type {
  CarmaLayerIdMap,
  GeoJsonSubStyleMeta,
  AddVectorSubStyleOptions,
  AddGeoJsonSubStyleOptions,
  AddRasterSubStyleOptions,
} from "./utils/styleComposer";
export { useImperativeStyle } from "./hooks/useImperativeStyle";
export type { UseImperativeStyleOptions } from "./hooks/useImperativeStyle";

// Feature utilities
export {
  createFeature,
  getCoordinates,
  truncateString,
  type FeatureInfo,
  type LayerMappingEntry,
} from "./utils/featureUtils";

export {
  NON_TILED_METADATA_KEY,
  buildNonTiledWmsUrl,
  createNonTiledImageSource,
  createNonTiledMetadata,
  updateNonTiledSources,
  attachNonTiledWmsUpdater,
} from "./utils/nonTiledWms";
export type { NonTiledWmsRequest } from "./utils/nonTiledWms";

// Zoom utilities
export { zoom512as256, zoom256as512 } from "./utils/zoomUtils";

// Cluster utilities
export { createPieChart } from "./utils/clusterUtils";

// setFeatureState/getFeatureState target builder (geojson-aware)
export { buildFeatureStateTarget } from "./utils/featureStateTarget";
export type { FeatureStateRef } from "./utils/featureStateTarget";

// Stamp feature.sourceLayer from properties._sourceLayer (geojson FCs)
export { stampSourceLayerFromProperty } from "@carma-mapping/utils";

// Lasso drawing
export { LassoDrawingManager } from "./lib/LassoDrawingManager";
export type {
  LassoDrawingManagerOptions,
  DrawnShape,
  DrawShape,
  RectSize,
} from "./lib/LassoDrawingManager";
export {
  shapePositions,
  toTurfShape,
  DEFAULT_CIRCLE_RADIUS,
  DEFAULT_CIRCLE_RADIUS_STEP,
  DEFAULT_RECT_WIDTH,
  DEFAULT_RECT_HEIGHT,
  DEFAULT_SHAPE_BUFFER,
  DEFAULT_CLEAR_DELAY,
  LASSO_LAYER_ID_PREFIX,
} from "./lib/LassoDrawingManager";

// Selection management
export { SelectionManager } from "./lib/SelectionManager";
export { HidingForwardingManager } from "./lib/HidingForwardingManager";
export {
  getCarmaConf,
  getCarmaConfFromStyle,
  isNonSelectable,
  applySelectionForwarding,
  resolvePropertyTarget,
  enrichHitsWithCarmaInfo,
} from "./lib/SelectionManager";
export type {
  CarmaConf,
  CarmaInfo,
  EnrichedFeature,
  FeatureIdentifier,
  SelectionManagerOptions,
  SelectionResult,
} from "./lib/selectionTypes";

// Default styles and city configuration
export {
  createDefaultStyle,
  createPreviewStyle,
  WUPPERTAL_CONFIG,
  WUPPERTAL_TERRAIN_SOURCE_ID,
  WUPPERTAL_DEFAULT_STYLE,
  WUPPERTAL_PREVIEW_STYLE,
  type CityMapConfig,
} from "./constants/wuppertalDefaultStyle";

export {
  DEFAULT_MAPLIBRE_FOV_DEG,
  DEFAULT_MAPLIBRE_PITCH_MAX_DEG,
  DEFAULT_MAPLIBRE_PITCH_MIN_DEG,
} from "./constants/cameraDefaults";

// Three.js layer management
export { ThreeLayerManager, get3dLayers } from "./components/ThreeLayerManager";
export { has3dLayers } from "./utils/threeDPresence";
export type { ThreeLayerManagerProps } from "./components/ThreeLayerManager";

export { buildSharedThreeSceneLayer } from "./lib/runtime/integrations/shared-three-scene-layer";
export type {
  SharedThreeSceneFrame,
  SharedThreeSceneLayer,
  SharedThreeSceneLayerOptions,
  SharedThreeSceneRuntime,
} from "./lib/runtime/integrations/shared-three-scene-layer";
export {
  acquireSharedThreeScene,
  getSharedThreeSceneStatus,
  subscribeSharedThreeSceneStatus,
} from "./lib/runtime/integrations/shared-three-scene-registry";
export type {
  SharedThreeSceneLease,
  SharedThreeSceneStatus,
} from "./lib/runtime/integrations/shared-three-scene-registry";
export {
  genericThreeLayerHasShadeableContent,
  getGenericThreeLayers,
  notifyGenericThreeLayerContentChanged,
  registerGenericThreeLayer,
  subscribeGenericThreeLayers,
  unregisterGenericThreeLayer,
} from "./lib/runtime/integrations/generic-three-layer-registry";
export {
  getShadowSimulationContentStatus,
  subscribeShadowSimulationContentStatus,
} from "./lib/runtime/integrations/shadow-simulation-content-status";
export type { ShadowSimulationContentStatus } from "./lib/runtime/integrations/shadow-simulation-content-status";
export type {
  ThreeTilesClayShader,
  ThreeTilesLayer,
} from "./lib/runtime/integrations/three-tiles-layer";
export {
  THREE_TILES_LAYER_TYPE,
  THREE_TILES_SHADER_KIND,
} from "./lib/runtime/integrations/three-tiles-layer";
export {
  buildThreeTilesRuntime,
  TILES_ERROR_TARGET_DEFAULT_PIXELS,
  TILES_ERROR_TARGET_MAX_PIXELS,
  TILES_ERROR_TARGET_MIN_PIXELS,
} from "./lib/runtime/integrations/three-tiles-runtime";
export type {
  ClayMaterialOptions,
  ImageProjector,
  ThreeTilesRuntime,
  ThreeTilesRuntimeOptions,
} from "./lib/runtime/integrations/three-tiles-runtime";
export { buildCesiumTerrainRuntime } from "./lib/runtime/integrations/cesium-terrain-tile-runtime";
export type {
  CesiumTerrainMaterialOptions,
  CesiumTerrainRuntime,
  CesiumTerrainRuntimeOptions,
} from "./lib/runtime/integrations/cesium-terrain-tile-runtime";
export { suppressMapLibreTerrainRendering } from "./lib/runtime/integrations/shared-three-terrain-registry";

// Styles (CSS should be imported by consumers)
// import '@carma-mapping/engines/maplibre/styles/map.css';
