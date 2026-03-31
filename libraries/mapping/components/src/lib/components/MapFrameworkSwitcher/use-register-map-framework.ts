/**
 * Simple hook to register map framework refs with context
 * Apps use this to provide their map instances once they're initialized
 */

import { useEffect } from "react";
import type { LeafletMap } from "@carma-mapping/engines/leaflet";
import { CesiumTerrainProvider, type Scene } from "@carma/cesium";
import { useMapFrameworkSwitcherContext } from "./MapFrameworkSwitcherContext";

interface UseRegisterMapFrameworkParams {
  getLeafletMap: () => LeafletMap | null | undefined;
  getCesiumScene: () => Scene | null | undefined;
  getCesiumContainer: () => HTMLElement | null | undefined;
  getCesiumTerrainProviders: () => {
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
    const {
      getLeafletMap,
      getCesiumScene,
      getCesiumContainer,
      getCesiumTerrainProviders,
    } = options;

    registerRefs({
      getLeafletMap,
      getCesiumScene,
      getCesiumContainer,
      getCesiumTerrainProviders,
    });
  }, [
    options,
    options?.getCesiumContainer,
    options?.getCesiumScene,
    options?.getCesiumTerrainProviders,
    options?.getLeafletMap,
    registerRefs,
  ]);
};
