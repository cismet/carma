import { useMemo, useRef } from "react";
import { useSelector } from "react-redux";

import { useAddonState } from "@carma-mapping/addons";
import type { LibreLayer } from "@carma-mapping/core";

import { geoportalBackgroundToLibreLayers } from "../../components/GeoportalMap/geoportalBackgroundToLibreLayers";
import {
  geoportalLayersToLibreLayers,
  isAppOwnedLayer,
  layerIsStandaloneMesh,
  layerProvidesTerrainMesh,
} from "../../components/GeoportalMap/geoportalLayersToLibreLayers";
import { backgroundConfig } from "../../config/backgroundConfig";
import { getBackgroundLayer, getLayers } from "../../store/slices/mapping";

export const useLibreLayers = (): LibreLayer[] => {
  const geoportalLayers = useSelector(getLayers);
  const backgroundLayer = useSelector(getBackgroundLayer);
  const { namedLayers } = backgroundConfig;
  const [shadowState] = useAddonState("shadowSimulation");

  const computedLibreLayers = useMemo(() => {
    const userLayers = geoportalLayers.filter(
      (layer) => layer.visible && !isAppOwnedLayer(layer)
    );
    const standaloneMeshOnly =
      userLayers.length > 0 && userLayers.every(layerIsStandaloneMesh);
    const terrainMeshActive =
      !standaloneMeshOnly && geoportalLayers.some(layerProvidesTerrainMesh);
    return [
      ...geoportalBackgroundToLibreLayers(backgroundLayer, namedLayers, {
        terrainMeshActive,
        shadowTerrainActive: shadowState?.enabled === true,
        vectorBaseOverride:
          shadowState?.enabled === true &&
          shadowState?.overrideBaseMapWithVectorStyle === true,
        standaloneMeshOnly,
      }),
      ...geoportalLayersToLibreLayers(geoportalLayers),
    ];
  }, [
    backgroundLayer,
    namedLayers,
    geoportalLayers,
    shadowState?.enabled,
    shadowState?.overrideBaseMapWithVectorStyle,
  ]);

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
