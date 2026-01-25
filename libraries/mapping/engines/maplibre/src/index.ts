// @carma-mapping/engines/maplibre
// MapLibre GL JS integration for CARMA mapping framework

export const MAPLIBRE_ENGINE_VERSION = '0.0.1';

// Components
export { LibreMap } from './components/LibreMap';
export type { LibreMapProps, GeoJsonData, VectorStyle, LibreLayer } from './components/LibreMap';
export { LibreMapSelectionContent } from './components/LibreMapSelectionContent';
export { PreviewLibreMap } from './components/PreviewLibreMap';

// Context
export {
  LibreContext,
  LibreContextProvider,
  useLibreContext,
} from './contexts/LibreContext';
export type { LibreContextType, GeoJsonMetadata } from './contexts/LibreContext';

// Hooks
export { useClusterMarkers } from './hooks/useClusterMarkers';
export { useSelectionLibreMap } from './hooks/useSelectionLibreMap';

// Style utilities
export {
  vectorStylesToMapLibreStyle,
  styleManipulation,
  getVectorMapping,
  type GeoJsonStyleMetadata,
  type VectorStylesToMapLibreStyleOptions,
  type VectorStylesToMapLibreStyleResult,
} from './utils/styleBuilder';

// Feature utilities
export {
  createFeature,
  getCoordinates,
  truncateString,
  type FeatureInfo,
  type LayerMappingEntry,
} from './utils/featureUtils';

// Zoom utilities
export { zoom512as256, zoom256as512 } from './utils/zoomUtils';

// Cluster utilities
export { createPieChart } from './utils/clusterUtils';

// Default styles and city configuration
export {
  createDefaultStyle,
  createPreviewStyle,
  WUPPERTAL_CONFIG,
  WUPPERTAL_DEFAULT_STYLE,
  WUPPERTAL_PREVIEW_STYLE,
  type CityMapConfig,
} from './constants/wuppertalDefaultStyle';

// Styles (CSS should be imported by consumers)
// import '@carma-mapping/engines/maplibre/styles/map.css';
