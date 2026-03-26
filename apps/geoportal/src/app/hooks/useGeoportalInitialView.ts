import { useMemo } from "react";
import { Cartesian3 } from "@carma/cesium";
import type { InitialCameraView } from "@carma-mapping/engines/cesium";
import {
  readInitialCameraViewFromViewState,
  useViewStateNavigationManager,
} from "@carma-mapping/engines-interop/view-state";
import { DEFAULT_HOME_VIEW_STATE } from "../utils/geoportalHomeViewState";
import { DEFAULT_HOME_VIEW_REF } from "../config/view.config";

export const useGeoportalInitialView = () => {
  const {
    initialRestoreState,
    isInitialRestoreResolved: isInitialCameraResolved,
  } = useViewStateNavigationManager();

  const initialCesiumViewState = initialRestoreState ?? DEFAULT_HOME_VIEW_STATE;
  const cesiumInitialCameraView = useMemo(
    () =>
      readInitialCameraViewFromViewState(
        initialCesiumViewState
      ) as InitialCameraView | undefined,
    [initialCesiumViewState]
  );

  const homeValidationCenter = useMemo(
    () =>
      Cartesian3.fromDegrees(
        DEFAULT_HOME_VIEW_REF.lng,
        DEFAULT_HOME_VIEW_REF.lat,
        DEFAULT_HOME_VIEW_REF.altitude
      ),
    []
  );

  return {
    isInitialCameraResolved,
    cesiumInitialCameraView,
    homeValidationCenter,
  };
};
