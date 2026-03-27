import { useMemo } from "react";
import type { ViewState } from "../../core/types";
import { readInitialCameraViewFromViewState } from "../../adapters/cesium-initial-camera";
import { useViewStateNavigationManager } from "../providers/navigation/useViewStateNavigationManager";

export const useInitialCesiumCameraView = (defaultViewState: ViewState) => {
  const {
    initialRestoreState,
    isInitialRestoreResolved: isInitialCameraResolved,
  } = useViewStateNavigationManager();

  const initialViewState = initialRestoreState ?? defaultViewState;
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
