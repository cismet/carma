// New ViewState API (core/react/adapters)
export * from "./state";

// Legacy conversion/adapters kept for compatibility with flattened ViewState consumers.
export {
  toCesiumPitchFromViewSyncPitch,
  toViewSyncPitchFromCesiumPitch,
  readViewSyncHorizontalFov,
  readViewSyncLongerEdgeFov,
  readViewStateFromSceneState,
  readViewSyncVerticalFov,
  readLongerEdgeFovRad,
  readVerticalFovRad,
} from "./core/targetState";
export { cesiumAdapter } from "./adapters/cesiumAdapter";
export {
  maplibreAdapter,
  projectMapLibreViewToViewSyncTarget,
  projectViewSyncTargetToMapLibre,
  readViewStateFromMapLibreMap,
  readHashParamsFromViewState,
  readViewStateFromHashValues,
} from "./adapters/maplibreAdapter";
export {
  leafletAdapter,
  projectLeafletViewToViewSyncTarget,
  projectViewSyncTargetToLeaflet,
  readViewStateFromLeafletMap,
} from "./adapters/leafletAdapter";
export {
  DEFAULT_FOV_DEG,
  DEFAULT_MAX_PITCH_DEG,
  type LeafletViewValues,
  type MapLibreAdapterOptions,
  type MapLibreViewValues,
} from "./adapters/types";
export {
  HASH_ZOOM_CONVENTION,
  readViewStateHashNumber,
} from "./core/viewStateHash";
export type { HashZoomConvention } from "./core/viewStateHash";
export type {
  BuiltInViewSyncEngine,
  ViewSyncEngine,
  ViewState,
} from "./core/types";
export { VIEW_SYNC_ENGINES } from "./core/types";
