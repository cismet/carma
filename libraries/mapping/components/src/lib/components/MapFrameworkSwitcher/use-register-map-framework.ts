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
  resolutionScale?: number;
}

/**
 * Register map instances with the framework switcher context
 * Call this hook once your maps are initialized
 */
export const useRegisterMapFramework = ({
  leafletMap,
  cesiumScene,
  cesiumContainer,
  terrainProviders,
  resolutionScale = 1.0,
}: UseRegisterMapFrameworkParams) => {
  const { registerRefs } = useMapFrameworkSwitcherContext();

  useEffect(() => {
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
      getResolutionScale: () => resolutionScale,
    });
  }, [
    leafletMap,
    cesiumScene,
    cesiumContainer,
    terrainProviders.TERRAIN,
    terrainProviders.SURFACE,
    resolutionScale,
    registerRefs,
  ]);
};
