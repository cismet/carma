import { useEffect, useRef } from "react";

import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";

import { useOblique } from "../oblique/hooks/useOblique";
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
  const { isObliqueMode } = useOblique();

  const lastCesium = useRef<boolean | null>(null);
  const lastOblique = useRef<boolean | null>(null);

  useEffect(() => {
    if (lastCesium.current === null) {
      lastCesium.current = isCesium;
      return;
    }
    if (lastCesium.current === isCesium) {
      return;
    }
    lastCesium.current = isCesium;
    trackEvent(
      TrackingCategory.MAP_MODE,
      isCesium ? MapModeAction.TO_3D : MapModeAction.TO_2D
    );
  }, [isCesium]);

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
