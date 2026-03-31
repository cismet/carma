import { useMemo } from "react";
import type { ViewState } from "../../core/types";
import { readInitialCameraViewFromViewState } from "../../adapters/cesium-initial-camera";
import { useViewStateNavigationRestore } from "../providers/navigation/useViewStateNavigationRestore";

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
