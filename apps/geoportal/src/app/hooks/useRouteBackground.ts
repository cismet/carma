import { useMemo } from "react";
import { useSelector } from "react-redux";
import { useLocation } from "react-router-dom";

import type { BackgroundLayer } from "@carma-mapping/layers";
import type { NamedLayers } from "@carma-appframeworks/portals";

import { findFachzwillingByPathname } from "../constants/fachzwillinge";
import {
  getBackgroundLayer,
  getSelectedBackgroundEntry,
} from "../store/slices/mapping";

type RouteBackground = {
  backgroundLayer: BackgroundLayer;
  namedLayers?: NamedLayers;
};

export const useRouteBackground = (): RouteBackground => {
  const { pathname } = useLocation();
  const backgroundLayer = useSelector(getBackgroundLayer);
  // backgroundLayer.id is the category, while an override names the base map
  // selected inside that category
  const baseMapId = useSelector(getSelectedBackgroundEntry)?.id;

  return useMemo(() => {
    const background = findFachzwillingByPathname(pathname)?.background;
    if (!background?.layerMap || !baseMapId) {
      return { backgroundLayer };
    }
    const override = background.layerMap[baseMapId];
    if (!override) {
      return { backgroundLayer };
    }
    return {
      backgroundLayer: { ...backgroundLayer, layers: override.layers },
      namedLayers: background.namedLayers,
    };
  }, [pathname, backgroundLayer, baseMapId]);
};

export default useRouteBackground;
