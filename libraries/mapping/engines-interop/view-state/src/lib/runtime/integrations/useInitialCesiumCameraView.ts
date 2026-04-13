import { useMemo } from "react";

import { useViewStateNavigationRestore } from "../providers/navigation/useViewStateNavigationRestore";
import { readInitialCameraViewFromViewState } from "../../adapters/cesium-initial-camera";
import type { ViewState } from "../../core/types";
export const useInitialCesiumCameraView = (defaultViewState: ViewState) => {
  const { restoreState, isRestoreResolved: isInitialCameraResolved } =
    useViewStateNavigationRestore();

  const initialViewState = restoreState ?? defaultViewState;
  const initialCameraView = useMemo(
    () => readInitialCameraViewFromViewState(initialViewState),
    [initialViewState]
  );

  return {
    initialCameraView,
    initialViewState,
    isInitialCameraResolved,
  };
};
