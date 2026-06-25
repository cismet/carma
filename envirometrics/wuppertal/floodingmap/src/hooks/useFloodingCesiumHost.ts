import { useCallback, useContext, useEffect } from "react";

import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import { useCesiumMapFrameworkHost } from "@carma-appframeworks/portals";
import { useCesiumContext } from "@carma-mapping/engines/cesium/react/runtime";

import { FLOODINGMAP_TERRAIN_PROVIDER_IDS } from "../config/cesium/cesium.config";

const FLOODINGMAP_CESIUM_VIEW_ADAPTER_ID = "floodingmap-cesium";
const HIDDEN_DISPLAY_VALUE = "none" as const;

type CesiumRuntimeCreditContainer = {
  _cesiumWidget?: {
    _creditContainer?: { style?: { display?: string } };
  };
};

/**
 * Floodingmap Cesium-host wiring over useCesiumMapFrameworkHost. TERRAIN pins to
 * the bare-ground (DGM) provider since the active scene terrain is flood-water SURFACE.
 */
export const useFloodingCesiumHost = (allow3d: boolean) => {
  const ctx = useCesiumContext();
  const { getTerrainProviderById, getSurfaceProvider } = ctx;
  const { routedMapRef: routedMap } =
    useContext<typeof TopicMapContext>(TopicMapContext);

  const getLeafletMap = useCallback(
    () => routedMap?.leafletMap?.leafletElement ?? null,
    [routedMap]
  );
  const getCesiumTerrainProviders = useCallback(
    () => ({
      TERRAIN:
        getTerrainProviderById(FLOODINGMAP_TERRAIN_PROVIDER_IDS.TERRAIN_2020) ??
        null,
      SURFACE: getSurfaceProvider() ?? null,
    }),
    [getSurfaceProvider, getTerrainProviderById]
  );

  const { shouldMountCesium, handleCesiumHostChange } =
    useCesiumMapFrameworkHost({
      viewAdapterId: FLOODINGMAP_CESIUM_VIEW_ADAPTER_ID,
      getLeafletMap,
      getCesiumTerrainProviders,
      allow3d,
    });

  // Hide the default Cesium ion credit container (no ion resource).
  useEffect(() => {
    ctx.withRuntime((runtime) => {
      const runtimeWithCreditContainer =
        runtime as CesiumRuntimeCreditContainer;
      const creditContainer =
        runtimeWithCreditContainer._cesiumWidget?._creditContainer;
      if (creditContainer?.style) {
        creditContainer.style.display = HIDDEN_DISPLAY_VALUE;
      }
      ctx.requestRender();
    });
  }, [ctx]);

  return { shouldMountCesium, handleCesiumHostChange };
};
