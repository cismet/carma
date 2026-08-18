import { useMemo } from "react";

import { Cartesian3 } from "@carma-cesium";

import {
  readLeafletHomeViewState,
  useHomeViewOverride,
  useInitialCesiumCameraView,
  type ShareableViewState,
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
  // someone may take the home position over via `carma.mapping.setHomeOverride`
  const homeOverride = useHomeViewOverride();

  const homeViewRef = useMemo(
    () =>
      homeOverride
        ? ({
            ...DEFAULT_HOME_VIEW_REF,
            ...homeOverride,
          } satisfies ShareableViewState)
        : DEFAULT_HOME_VIEW_REF,
    [homeOverride]
  );

  const homeCenter = useMemo(
    () => [homeViewRef.lat, homeViewRef.lng] as [number, number],
    [homeViewRef]
  );

  const homeLeafletZoom = homeViewRef.zoom ?? 18;
  const homeMaplibreZoom = homeLeafletZoom - 1;

  const homeValidationCenter = useMemo(
    () =>
      Cartesian3.fromDegrees(
        homeViewRef.lng,
        homeViewRef.lat,
        homeViewRef.altitude
      ),
    [homeViewRef]
  );

  const homeViewState = useMemo(
    () =>
      homeViewRef === DEFAULT_HOME_VIEW_REF
        ? DEFAULT_HOME_VIEW_STATE
        : readLeafletHomeViewState(homeViewRef, {
            sourceId: "geoportal/home-override",
            defaultFovDeg: DEFAULT_CAMERA_FOV_DEG,
          }),
    [homeViewRef]
  );

  return {
    defaultHomeViewState: homeViewState,
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
