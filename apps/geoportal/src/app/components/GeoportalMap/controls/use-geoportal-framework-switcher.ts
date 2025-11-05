/**
 * Geoportal-specific wrapper for useMapFrameworkSwitcher
 * Connects TopicMapContext and CesiumContext to the framework switcher
 */

import type { RefObject } from "react";
import { useCallback, useContext, useMemo } from "react";

import type { Scene } from "@carma/cesium";
import { TransitionDirection } from "@carma-mapping/engines-interop";
import { useMapFrameworkSwitcher } from "@carma-mapping/components";
import type { CesiumContextType } from "@carma-mapping/engines/cesium";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

type UseGeoportalFrameworkSwitcherOptions = {
  cesiumContext: CesiumContextType | null;
  cesiumContainerRef: RefObject<HTMLDivElement>;
  setIsMode2d: (isMode2d: boolean) => void;
  initialIsMode2d: boolean;
  onTransitionStart?: (direction: TransitionDirection) => void;
  onTransitionComplete?: (direction: TransitionDirection) => void;
  onTransitionFailed?: (direction: TransitionDirection) => void;
};

/**
 * Helper hook that bundles all the memoized getters for the framework switcher
 * Prevents code duplication and improves readability in MapWrapper
 */
export const useGeoportalFrameworkSwitcher = ({
  cesiumContext: ctx,
  cesiumContainerRef,
  setIsMode2d,
  initialIsMode2d,
  onTransitionStart,
  onTransitionComplete,
  onTransitionFailed,
}: UseGeoportalFrameworkSwitcherOptions) => {
  const { routedMapRef: routedMap } =
    useContext<typeof TopicMapContext>(TopicMapContext);

  console.log("[GEOPORTAL] Framework switcher initialized:", {
    initialIsMode2d,
    initialFramework: initialIsMode2d ? "leaflet" : "cesium",
  });

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
    () => cesiumContainerRef.current,
    [cesiumContainerRef]
  );

  const getCesiumTerrainProviders = useCallback(() => {
    const terrain = ctx?.getTerrainProvider();
    const surface = ctx?.getSurfaceProvider();
    return {
      TERRAIN: terrain ?? undefined,
      SURFACE: surface ?? undefined,
    };
  }, [ctx]);

  const getResolutionScale = useCallback(
    () => ctx?.viewerRef.current?.resolutionScale ?? 1.0,
    [ctx]
  );

  const handleActiveFrameworkChange = useCallback(
    (direction: TransitionDirection) => {
      console.log("[GEOPORTAL] Framework changed:", direction);
      // TransitionDirection: TO_CESIUM = 1, TO_LEAFLET = 2
      setIsMode2d(direction === 2);
    },
    [setIsMode2d]
  );

  const handleTransitionStart = useCallback(
    (direction: TransitionDirection) => {
      console.log("[GEOPORTAL] Transition started:", direction);
      onTransitionStart?.(direction);
    },
    [onTransitionStart]
  );

  const handleTransitionComplete = useCallback(
    (direction: TransitionDirection) => {
      console.log("[GEOPORTAL] Transition completed:", direction);
      onTransitionComplete?.(direction);
    },
    [onTransitionComplete]
  );

  const handleTransitionFailed = useCallback(
    (direction: TransitionDirection) => {
      console.error("[GEOPORTAL] Transition failed:", direction);
      onTransitionFailed?.(direction);
    },
    [onTransitionFailed]
  );

  const switcherOptions = useMemo(
    () => ({
      initialIsMode2d,
      onActiveFrameworkChange: handleActiveFrameworkChange,
      onTransitionStart: handleTransitionStart,
      onTransitionComplete: handleTransitionComplete,
      onTransitionFailed: handleTransitionFailed,
    }),
    [
      initialIsMode2d,
      handleActiveFrameworkChange,
      handleTransitionStart,
      handleTransitionComplete,
      handleTransitionFailed,
    ]
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
