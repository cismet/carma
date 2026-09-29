import { useMemo, useRef } from "react";
import { useSelector } from "react-redux";
import { useLocation } from "react-router-dom";

import {
  conditionRouteOf,
  isShownByCondition,
  useAddonState,
} from "@carma-mapping/addons";
import type { LibreLayer } from "@carma-mapping/core";

import { geoportalBackgroundToLibreLayers } from "../../components/GeoportalMap/geoportalBackgroundToLibreLayers";
import {
  geoportalLayersToLibreLayers,
  layerProvidesTerrainMesh,
} from "../../components/GeoportalMap/geoportalLayersToLibreLayers";
import { backgroundConfig } from "../../config/backgroundConfig";
import { getBackgroundLayer, getLayers } from "../../store/slices/mapping";

export const useLibreLayers = (): LibreLayer[] => {
  const geoportalLayers = useSelector(getLayers);
  const backgroundLayer = useSelector(getBackgroundLayer);
  const { namedLayers } = backgroundConfig;
  const [shadowState] = useAddonState("shadowSimulation");
  const { pathname, search } = useLocation();

  // a layer's "conditionalLayer" tool keeps it off the map unless the route or
  // the hash query asks for it; the stack itself is left as it is
  const drawnLayers = useMemo(() => {
    const context = {
      route: conditionRouteOf(pathname),
      params: Object.fromEntries(new URLSearchParams(search)),
    };
    return geoportalLayers.filter((layer) =>
      isShownByCondition(layer, context)
    );
  }, [geoportalLayers, pathname, search]);

  const computedLibreLayers = useMemo(() => {
    const terrainMeshActive = drawnLayers.some(layerProvidesTerrainMesh);
    return [
      ...geoportalBackgroundToLibreLayers(backgroundLayer, namedLayers, {
        terrainMeshActive,
        shadowTerrainActive: shadowState?.enabled === true,
      }),
      ...geoportalLayersToLibreLayers(drawnLayers),
    ];
  }, [backgroundLayer, namedLayers, drawnLayers, shadowState?.enabled]);

  const libreLayersRef = useRef(computedLibreLayers);
  return useMemo(() => {
    if (
      JSON.stringify(libreLayersRef.current) ===
      JSON.stringify(computedLibreLayers)
    ) {
      return libreLayersRef.current;
    }
    libreLayersRef.current = computedLibreLayers;
    return computedLibreLayers;
  }, [computedLibreLayers]);
};

export default useLibreLayers;
