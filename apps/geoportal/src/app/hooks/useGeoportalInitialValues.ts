import { useMemo } from "react";

import {
  useHomeViewOverride,
  useViewStateNavigationRestore,
  type ShareableViewState,
} from "@carma-mapping/engines-interop/view-state";

import {
  DEFAULT_HOME_VIEW_2D,
  DEFAULT_HOME_VIEW_REF,
} from "../config/view.config";

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

  const homeViewRef = useMemo((): ShareableViewState => {
    if (!homeOverride) {
      return DEFAULT_HOME_VIEW_REF;
    }
    // the texts and the 2d pose travel with the override but are not part of
    // the view, which describes the 3d camera
    const {
      tooltip: _tooltip,
      overlayLabel: _overlayLabel,
      overlayDestination: _overlayDestination,
      pitch2D: _pitch2D,
      bearing2D: _bearing2D,
      ...view
    } = homeOverride;
    return { ...DEFAULT_HOME_VIEW_REF, ...view };
  }, [homeOverride]);

  const homeCenter = useMemo(
    () => [homeViewRef.lat, homeViewRef.lng] as [number, number],
    [homeViewRef]
  );

  const homeLeafletZoom = homeViewRef.zoom ?? 18;
  const homeMaplibreZoom = homeLeafletZoom - 1;

  return {
    homeCenter,
    homeLeafletZoom,
    homeMaplibreZoom,
    homeMaplibrePitch: homeOverride?.pitch2D ?? DEFAULT_HOME_VIEW_2D.pitch,
    homeMaplibreBearing: homeOverride?.bearing2D ?? DEFAULT_HOME_VIEW_2D.bearing,
    // the maplibre 3D home tilt (degrees, 0 = nadir)
    homeMaplibre3dPitch: homeViewRef.pitch ?? 0,
    homeMaplibre3dBearing: homeViewRef.bearing ?? 0,
    /** an override's tooltip, undefined while the app's own home applies */
    homeTooltip: homeOverride?.tooltip,
  };
};

export const useGeoportalInitialCameraValues = () => {
  const { isRestoreResolved } = useViewStateNavigationRestore();

  return { isInitialCameraResolved: isRestoreResolved };
};
