import { useCallback } from "react";
import { useDispatch } from "react-redux";
import type { FeatureInfo } from "@carma/types";
import {
  setFeatures,
  setSecondaryInfoBoxElements,
  setSelectedFeature,
} from "../store/slices/features.ts";

// Returns a stable handler that syncs 3D model selection into Redux
export const useModelSelectionDispatcher = () => {
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
