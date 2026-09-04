import { useMemo, useRef } from "react";
import { useSelector } from "react-redux";

import { useAddonState } from "@carma-mapping/addons";
import type { LibreLayer } from "@carma-mapping/core";

import { geoportalBackgroundToLibreLayers } from "../../components/GeoportalMap/geoportalBackgroundToLibreLayers";
import {
  geoportalLayersToLibreLayers,
  layerProvidesTerrainMesh,
} from "../../components/GeoportalMap/geoportalLayersToLibreLayers";
import { getLayers } from "../../store/slices/mapping";
import { useRouteBackground } from "../useRouteBackground";

export const useLibreLayers = (): LibreLayer[] => {
  const geoportalLayers = useSelector(getLayers);
  const { backgroundLayer, namedLayers } = useRouteBackground();
  const [shadowState] = useAddonState("shadowSimulation");

  const computedLibreLayers = useMemo(() => {
    const terrainMeshActive = geoportalLayers.some(layerProvidesTerrainMesh);
    return [
      ...geoportalBackgroundToLibreLayers(backgroundLayer, namedLayers, {
        terrainMeshActive,
        shadowTerrainActive: shadowState?.enabled === true,
      }),
      ...geoportalLayersToLibreLayers(geoportalLayers),
    ];
  }, [backgroundLayer, namedLayers, geoportalLayers, shadowState?.enabled]);

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
