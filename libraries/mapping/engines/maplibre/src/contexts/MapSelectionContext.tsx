/**
 * Re-export from @carma-mapping/contexts for backwards compatibility.
 *
 * The actual implementation is in @carma-mapping/contexts to avoid
 * circular dependencies between engines-maplibre and portals.
 */
export {
  MapSelectionContext,
  MapSelectionProvider,
  useMapSelection,
  type MapSelectionContextType,
  type SelectedFeatureIdentifier,
} from "@carma-mapping/contexts";
