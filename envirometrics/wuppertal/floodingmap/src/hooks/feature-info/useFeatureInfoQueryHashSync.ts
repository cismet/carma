import { useContext, useEffect } from "react";

import { EnviroMetricMapContext } from "@cismet-dev/react-cismap-envirometrics-maps/EnviroMetricMapContextProvider";

import { useHashState } from "@carma-providers/hash-state";

import {
  FLOODINGMAP_HASH_KEYS,
  FLOODINGMAP_QUERY_HASH_CLEAR_KEYS,
} from "../../config/hash-state.config";
import { floorToMeterGrid } from "../../utils/geo";

/** Mirrors the active feature-info query position into the qx/qy hash params (floored to the meter grid), clearing them when no query is active. */
export const useFeatureInfoQueryHashSync = () => {
  const { controlState } = useContext<typeof EnviroMetricMapContext>(
    EnviroMetricMapContext
  );
  const { updateHashState } = useHashState();

  useEffect(() => {
    if (
      !controlState.featureInfoModeActivated ||
      !controlState.currentFeatureInfoPosition
    ) {
      updateHashState(undefined, {
        label: "app/hgk:query",
        clearStateKeys: [...FLOODINGMAP_QUERY_HASH_CLEAR_KEYS],
        replace: true,
      });
      return;
    }

    const [x, y] = controlState.currentFeatureInfoPosition;
    updateHashState(
      {
        [FLOODINGMAP_HASH_KEYS.QUERY_X]: floorToMeterGrid(x),
        [FLOODINGMAP_HASH_KEYS.QUERY_Y]: floorToMeterGrid(y),
      },
      {
        label: "app/hgk:query",
        clearStateKeys: [...FLOODINGMAP_QUERY_HASH_CLEAR_KEYS],
        replace: true,
      }
    );
  }, [
    controlState.currentFeatureInfoPosition,
    controlState.featureInfoModeActivated,
    updateHashState,
  ]);
};
