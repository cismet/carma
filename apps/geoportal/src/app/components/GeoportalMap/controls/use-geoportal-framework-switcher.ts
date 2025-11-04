/**
 * Geoportal-specific wrapper for useMapFrameworkSwitcher
 * Connects TopicMapContext and CesiumContext to the framework switcher
 */

import { useCallback, useContext, useMemo } from "react";

import type { Scene, CesiumTerrainProvider } from "@carma/cesium";
import { TransitionDirection } from "@carma-mapping/engines-interop";
import { useMapFrameworkSwitcher } from "@carma-mapping/components";
import type { CesiumContextType } from "@carma-mapping/engines/cesium";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

type UseGeoportalFrameworkSwitcherOptions = {
  cesiumContext: CesiumContextType | null;
  setIsMode2d: (isMode2d: boolean) => void;
};

/**
 * Helper hook that bundles all the memoized getters for the framework switcher
 * Prevents code duplication and improves readability in MapWrapper
 */
export const useGeoportalFrameworkSwitcher = ({
  cesiumContext: ctx,
  setIsMode2d,
}: UseGeoportalFrameworkSwitcherOptions) => {
  const { routedMapRef: routedMap } =
    useContext<typeof TopicMapContext>(TopicMapContext);

  // Memoized getters to prevent unnecessary rerenders
  const getLeafletMap = useCallback(
    () => routedMap?.leafletMap?.leafletElement ?? null,
    [routedMap]
  );

  const getCesiumScene = useCallback(() => {
    let scene: Scene | null = null;
    ctx?.withScene((s) => {
      scene = s;
    });
    return scene;
  }, [ctx]);

  const getCesiumContainer = useCallback(
    () => (ctx?.viewerRef.current?.container as HTMLElement) ?? null,
    [ctx]
  );

  const getCesiumTerrainProviders = useCallback(() => {
    const terrain = ctx?.getTerrainProvider();
    const surface = ctx?.getSurfaceProvider();
    return {
      TERRAIN: terrain ?? ({} as CesiumTerrainProvider),
      SURFACE: surface ?? ({} as CesiumTerrainProvider),
    };
  }, [ctx]);

  const getResolutionScale = useCallback(
    () => ctx?.viewerRef.current?.resolutionScale ?? 1.0,
    [ctx]
  );

  const handleActiveFrameworkChange = useCallback(
    (direction: TransitionDirection) => {
      // TransitionDirection: TO_CESIUM = 1, TO_LEAFLET = 2
      setIsMode2d(direction === 2);
    },
    [setIsMode2d]
  );

  const switcherOptions = useMemo(
    () => ({
      onActiveFrameworkChange: handleActiveFrameworkChange,
    }),
    [handleActiveFrameworkChange]
  );

  return useMapFrameworkSwitcher(
    getLeafletMap,
    getCesiumScene,
    getCesiumContainer,
    getCesiumTerrainProviders,
    getResolutionScale,
    switcherOptions
  );
};
