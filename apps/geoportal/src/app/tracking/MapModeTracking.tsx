import { useEffect, useRef } from "react";
import { useSelector } from "react-redux";

import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";

import { useOblique } from "../oblique/hooks/useOblique";
import { getLibre3d } from "../store/slices/ui";
import { MapModeAction, TrackingCategory } from "./taxonomy";
import { trackEvent } from "./tracker";

/**
 * Tracks 2D/3D and oblique mode as state changes rather than as button clicks:
 * both modes can also be entered by a layer that carries a `modeSwitch`, and
 * watching the state catches every path into them with one hook.
 *
 * The value present on mount is the entry state - a shared link can already
 * start in 3D - and is deliberately not tracked. Only changes during the visit
 * are counted, so shared links do not inflate the numbers.
 */
export const MapModeTracking = () => {
  const { isCesium } = useMapFrameworkSwitcherContext();
  const libre3d = useSelector(getLibre3d);
  const { isObliqueMode } = useOblique();
  // the maplibre 3D view counts apart from Cesium
  const mapMode = isCesium
    ? MapModeAction.TO_3D
    : libre3d
    ? MapModeAction.TO_3D_LIBRE
    : MapModeAction.TO_2D;

  const lastMapMode = useRef<string | null>(null);
  const lastOblique = useRef<boolean | null>(null);

  useEffect(() => {
    if (lastMapMode.current === null) {
      lastMapMode.current = mapMode;
      return;
    }
    if (lastMapMode.current === mapMode) {
      return;
    }
    lastMapMode.current = mapMode;
    trackEvent(TrackingCategory.MAP_MODE, mapMode);
  }, [mapMode]);

  useEffect(() => {
    if (lastOblique.current === null) {
      lastOblique.current = isObliqueMode;
      return;
    }
    if (lastOblique.current === isObliqueMode) {
      return;
    }
    lastOblique.current = isObliqueMode;
    trackEvent(
      TrackingCategory.MAP_MODE,
      isObliqueMode ? MapModeAction.OBLIQUE_ON : MapModeAction.OBLIQUE_OFF
    );
  }, [isObliqueMode]);

  return null;
};

export default MapModeTracking;
