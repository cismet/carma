import { useMemo } from "react";
import { useHashState } from "@carma-providers/hash-state";
import type { InitialCameraView } from "@carma-mapping/engines/cesium";
import {
  readInitialCameraViewFromViewState,
  readViewStateHashNumber,
  useViewStateNavigationManager,
} from "@carma-mapping/engines-interop/view-state";
import config from "../config";
import { buildFloodingmapInitialState } from "../utils/floodingmapInitialState";
import { DEFAULT_HOME_VIEW_STATE } from "../utils/floodingmapHomeViewState";

export const useFloodingmapInitialView = () => {
  const { getHashValues } = useHashState();
  const {
    initialRestoreState,
    isInitialRestoreResolved: isInitialCameraResolved,
  } = useViewStateNavigationManager();

  const initialHashValues = getHashValues();
  const initialQueryX = readViewStateHashNumber(initialHashValues.qx);
  const initialQueryY = readViewStateHashNumber(initialHashValues.qy);
  const initialEnviroMetricState = useMemo(
    () =>
      buildFloodingmapInitialState(
        config.initialState,
        initialQueryX,
        initialQueryY
      ),
    [initialQueryX, initialQueryY]
  );

  const initialCesiumViewState = initialRestoreState ?? DEFAULT_HOME_VIEW_STATE;
  const initialCameraView = useMemo(
    () =>
      readInitialCameraViewFromViewState(
        initialCesiumViewState
      ) as InitialCameraView | undefined,
    [initialCesiumViewState]
  );

  return {
    initialEnviroMetricState,
    initialCameraView,
    isInitialCameraResolved,
  };
};
