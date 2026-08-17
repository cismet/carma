import { useMemo } from "react";
import { useSelector } from "react-redux";
import { useLocation } from "react-router-dom";

import type { BackgroundLayer } from "@carma-mapping/layers";
import type { NamedLayers } from "@carma-appframeworks/portals";

import { findFachzwillingByPathname } from "../constants/fachzwillinge";
import {
  getBackgroundLayer,
  getSelectedLuftbildLayer,
  getSelectedMapLayer,
} from "../store/slices/mapping";

type RouteBackground = {
  backgroundLayer: BackgroundLayer;
  namedLayers?: NamedLayers;
};

export const useRouteBackground = (): RouteBackground => {
  const { pathname } = useLocation();
  const backgroundLayer = useSelector(getBackgroundLayer);
  const selectedMapLayer = useSelector(getSelectedMapLayer);
  const selectedLuftbildLayer = useSelector(getSelectedLuftbildLayer);

  return useMemo(() => {
    const background = findFachzwillingByPathname(pathname)?.background;
    if (!background?.layerMap) {
      return { backgroundLayer };
    }
    // backgroundLayer.id is the group ("karte" | "luftbild"), while an override
    // names the base map selected inside that group
    const baseMapId =
      backgroundLayer.id === "luftbild"
        ? selectedLuftbildLayer.id
        : selectedMapLayer.id;
    const override = background.layerMap[baseMapId];
    if (!override) {
      return { backgroundLayer };
    }
    return {
      backgroundLayer: { ...backgroundLayer, layers: override.layers },
      namedLayers: background.namedLayers,
    };
  }, [
    pathname,
    backgroundLayer,
    selectedMapLayer.id,
    selectedLuftbildLayer.id,
  ]);
};

export default useRouteBackground;
