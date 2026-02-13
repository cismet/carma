// @carma-mapping/engines/maplibre
// MapLibre GL JS integration for CARMA mapping framework

export const MAPLIBRE_ENGINE_VERSION = "0.0.1";

// Components
export { LibreMap } from "./components/LibreMap";
export type {
  LibreMapProps,
  GeoJsonData,
  VectorStyle,
  LibreLayer,
} from "./components/LibreMap";
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

// Zoom utilities
export { zoom512as256, zoom256as512 } from "./utils/zoomUtils";

// Cluster utilities
export { createPieChart } from "./utils/clusterUtils";

// Selection management
export { SelectionManager } from "./lib/SelectionManager";
export { HidingForwardingManager } from "./lib/HidingForwardingManager";
export {
  getCarmaConf,
  getCarmaConfFromStyle,
  applySelectionForwarding,
  resolvePropertyTarget,
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
  WUPPERTAL_DEFAULT_STYLE,
  WUPPERTAL_PREVIEW_STYLE,
  type CityMapConfig,
} from "./constants/wuppertalDefaultStyle";

// Styles (CSS should be imported by consumers)
// import '@carma-mapping/engines/maplibre/styles/map.css';
