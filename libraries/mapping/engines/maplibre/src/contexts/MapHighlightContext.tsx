/**
 * Re-export from @carma-mapping/contexts for backwards compatibility.
 *
 * The actual implementation is in @carma-mapping/contexts to avoid
 * circular dependencies between engines-maplibre and portals.
 */
export {
  MapHighlightContext,
  MapHighlightProvider,
  useMapHighlight,
  type MapHighlightContextType,
  type HighlightCriteria,
  type PropertyMatcher,
  type QueryId,
  type ToggledFeature,
} from "@carma-mapping/contexts";
