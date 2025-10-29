import { useCallback } from "react";
import { useDispatch } from "react-redux";
import type { SelectionItem } from "@carma-appframeworks/portals";
import type { FeatureInfo } from "@carma/types";
import {
  setFeatures,
  setSecondaryInfoBoxElements,
  setSelectedFeature,
} from "../store/slices/features.ts";

/**
 * TODO: This Redux sync should be managed by PortalProvider context instead
 * Move this logic into portalConfig.selectionCallbacks to consolidate state management
 * and avoid importing Redux above TopicMapComponentWrapper level.
 *
 * IMPORTANT: This hook is ONLY for Cesium mode selections, NOT for TopicMap selections.
 * TopicMap selections should use the existing onClickTopicMap flow which handles
 * feature info requests and sets selectedFeature properly.
 *
 * Syncs Cesium SelectionProvider state to Redux store
 * This is a temporary bridge to maintain backward compatibility
 * while migrating from Redux to SelectionProvider
 */
export const useSyncSelectionToRedux = () => {
  const dispatch = useDispatch();

  return useCallback(
    (selection: SelectionItem | null) => {
      if (selection) {
        // Only set selectedFeature if it's not from gazetteer
        // Gazetteer selections should trigger feature info requests which will set the real feature data
        if (selection.selectedFrom !== "gazetteer") {
          dispatch(setSelectedFeature(selection as any));
        }
        dispatch(setSecondaryInfoBoxElements([]));
        dispatch(setFeatures([selection]));
      } else {
        dispatch(setSelectedFeature(null));
        dispatch(setSecondaryInfoBoxElements([]));
        dispatch(setFeatures([]));
      }
    },
    [dispatch]
  );
};

/**
 * TODO: This Redux sync should be managed by PortalProvider context instead
 * Move this logic into portalConfig.selectionCallbacks to consolidate state management
 * and avoid importing Redux above TopicMapComponentWrapper level.
 *
 * Syncs SelectionProvider modelSelection state to Redux store
 * This handles 3D model selection (FeatureInfo) separately from topicmap selection
 */
export const useSyncModelSelectionToRedux = () => {
  const dispatch = useDispatch();

  return useCallback(
    (feature: FeatureInfo | null) => {
      if (feature) {
        dispatch(setSelectedFeature(feature));
        dispatch(setSecondaryInfoBoxElements([]));
        dispatch(setFeatures([feature]));
      } else {
        dispatch(setSelectedFeature(null));
        dispatch(setSecondaryInfoBoxElements([]));
        dispatch(setFeatures([]));
      }
    },
    [dispatch]
  );
};
