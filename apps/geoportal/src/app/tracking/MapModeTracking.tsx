import { useEffect, useRef } from "react";
import { useSelector } from "react-redux";

import { getLibre3d } from "../store/slices/ui";
import { MapModeAction, TrackingCategory } from "./taxonomy";
import { trackEvent } from "./tracker";

/**
 * Tracks 2D/3D as state changes rather than as button clicks: 3D can also be
 * entered by a layer that carries a `modeSwitch`, and watching the state
 * catches every path into it with one hook.
 *
 * The value present on mount is the entry state - a shared link can already
 * start in 3D - and is deliberately not tracked. Only changes during the visit
 * are counted, so shared links do not inflate the numbers.
 */
export const MapModeTracking = () => {
  const libre3d = useSelector(getLibre3d);
  // keeps the MapLibre event name the reports already count under
  const mapMode = libre3d ? MapModeAction.TO_3D_LIBRE : MapModeAction.TO_2D;

  const lastMapMode = useRef<string | null>(null);

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

  return null;
};

export default MapModeTracking;
