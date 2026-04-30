// Re-export from @carma-mapping/utils so engine-internal callers can keep
// their relative import path. The single source of truth lives in utils
// (engines/maplibre depends on utils, never the other way around).
export {
  buildFeatureStateTarget,
  type FeatureStateRef,
} from "@carma-mapping/utils";
