import { useMemo } from "react";

import { Cartesian3 } from "@carma/cesium";

import {
  readLeafletHomeViewState,
  useInitialCesiumCameraView,
} from "@carma-mapping/engines-interop/view-state";

import { DEFAULT_CAMERA_FOV_DEG } from "../config/app.config";
import { DEFAULT_HOME_VIEW_REF } from "../config/view.config";

const DEFAULT_HOME_VIEW_STATE = readLeafletHomeViewState(
  DEFAULT_HOME_VIEW_REF,
  {
    sourceId: "geoportal/default-home",
    defaultFovDeg: DEFAULT_CAMERA_FOV_DEG,
  }
);

export const useGeoportalInitialValues = () => {
  const homeValues = useGeoportalHomeValues();
  const initialCameraValues = useGeoportalInitialCameraValues();

  return {
    ...homeValues,
    ...initialCameraValues,
  };
};

export const useGeoportalHomeValues = () => {
  const homeCenter = useMemo(
    () =>
      [DEFAULT_HOME_VIEW_REF.lat, DEFAULT_HOME_VIEW_REF.lng] as [
        number,
        number
      ],
    []
  );

  const homeLeafletZoom = DEFAULT_HOME_VIEW_REF.zoom ?? 18;
  const homeMaplibreZoom = homeLeafletZoom - 1;

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
    defaultHomeViewState: DEFAULT_HOME_VIEW_STATE,
    homeCenter,
    homeLeafletZoom,
    homeMaplibreZoom,
    homeValidationCenter,
  };
};

export const useGeoportalInitialCameraValues = () => {
  const { initialCameraView, isInitialCameraResolved } =
    useInitialCesiumCameraView(DEFAULT_HOME_VIEW_STATE);

  return {
    initialCameraView,
    isInitialCameraResolved,
  };
};
