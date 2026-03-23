// Core types
export type {
  CommonViewState,
  ViewStateMetadata,
  ViewStateSource,
  WritePriority,
  WriteToken,
  WriteResult,
  WriteRejectionReason,
  ViewAdapterRegistration,
  HistoryEntry,
  HistoryConfig,
  HistoryView,
  ViewStateContextValue,
  DerivedView,
} from "./core/types";
export { WRITE_PRIORITY_RANK } from "./core/types";

// Provider
export { ViewStateProvider } from "./react/ViewStateProvider";
export { ViewStateContext } from "./react/context";

// Hooks
export {
  useViewState,
  useViewStateDerived,
  useViewStateControllerId,
  useViewAdapter,
  useViewHistory,
  type ViewAdapterCallbacks,
  type ViewAdapterHandle,
} from "./react/hooks";

// Derivations (pure functions, no React)
export {
  deriveRange,
  deriveOrbitAngles,
  deriveRoll,
  deriveZoom,
  deriveView,
} from "./core/derivations";

// Construction (pure functions, no React)
export {
  buildCommonViewState,
  buildCommonViewStateFromEcef,
  type AngleBasedViewInput,
} from "./core/construct";

// Hash codec (pure functions, no React)
export {
  encodeHashFromViewState,
  decodeHashToViewState,
} from "./core/hash-codec";

// Hash sync (React component)
export { ViewStateHashSync } from "./react/ViewStateHashSync";

// Framework adapters (pure functions, no React)
export { readFromCesium, applyToCesium } from "./adapters/cesium";
export {
  readFromMaplibre,
  applyToMaplibre,
  type MapLike,
} from "./adapters/maplibre";
export {
  readFromLeaflet,
  applyToLeaflet,
  type LeafletMapLike,
} from "./adapters/leaflet";
