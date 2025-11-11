/**
 * Simple hook to register map framework refs with context
 * Apps use this to provide their map instances once they're initialized
 */

import { useEffect } from "react";
import type { LeafletMap } from "@carma-mapping/engines/leaflet";
import { CesiumTerrainProvider, type Scene } from "@carma/cesium";
import { useMapFrameworkSwitcherContext } from "./MapFrameworkSwitcherContext";

interface UseRegisterMapFrameworkParams {
  leafletMap: LeafletMap | null;
  cesiumScene: Scene | null;
  cesiumContainer: HTMLElement | null;
  terrainProviders: {
    TERRAIN: CesiumTerrainProvider | null;
    SURFACE: CesiumTerrainProvider | null;
  };
}

/**
 * Register map instances with the framework switcher context
 * Call this hook once your maps are initialized
 */
export const useRegisterMapFramework = (
  options: UseRegisterMapFrameworkParams | null
) => {
  const { registerRefs } = useMapFrameworkSwitcherContext();
  useEffect(() => {
    if (!options) return;
    const { leafletMap, cesiumScene, cesiumContainer, terrainProviders } =
      options;

    registerRefs({
      getLeafletMap: () => leafletMap,
      getCesiumScene: () => cesiumScene,
      getCesiumContainer: () => cesiumContainer,
      getCesiumTerrainProviders: () => ({
        TERRAIN:
          terrainProviders.TERRAIN ??
          (null as unknown as CesiumTerrainProvider),
        SURFACE:
          terrainProviders.SURFACE ??
          (null as unknown as CesiumTerrainProvider),
      }),
    });
  }, [options, registerRefs]);
};
