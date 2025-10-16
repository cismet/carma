import { useCallback } from "react";
import { useDispatch } from "react-redux";
import type { SelectionItem, FeatureInfo } from "@carma-appframeworks/portals";
import {
  setFeatures,
  setSecondaryInfoBoxElements,
  setSelectedFeature,
} from "../store/slices/features.ts";

/**
 * TODO: Remove this hook when Redux is fully removed from the geoportal app
 *
 * Syncs SelectionProvider state to Redux store
 * This is a temporary bridge to maintain backward compatibility
 * while migrating from Redux to SelectionProvider
 */
export const useSyncSelectionToRedux = () => {
  const dispatch = useDispatch();

  return useCallback(
    (selection: SelectionItem | null) => {
      if (selection) {
        dispatch(setSelectedFeature(selection));
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
 * TODO: Remove this hook when Redux is fully removed from the geoportal app
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
