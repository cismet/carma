// @carma-mapping/contexts
// Shared contexts for CARMA mapping framework
// This library exists to break circular dependencies between mapping libraries

export {
  LibreContext,
  LibreContextProvider,
  useLibreContext,
} from "./LibreContext";

export type { LibreContextType, GeoJsonMetadata } from "./LibreContext";

export {
  MapSelectionContext,
  MapSelectionProvider,
  useMapSelection,
} from "./MapSelectionContext";

export type {
  MapSelectionContextType,
  SelectedFeatureIdentifier,
} from "./MapSelectionContext";

export {
  DatasheetContext,
  DatasheetProvider,
  useDatasheet,
} from "./DatasheetContext";

export type { DatasheetContextType } from "./DatasheetContext";

export {
  MapHighlightContext,
  MapHighlightProvider,
  useMapHighlight,
} from "./MapHighlightContext";

export type {
  MapHighlightContextType,
  HighlightCriteria,
  PropertyMatcher,
  QueryId,
  ToggledFeature,
} from "./MapHighlightContext";
