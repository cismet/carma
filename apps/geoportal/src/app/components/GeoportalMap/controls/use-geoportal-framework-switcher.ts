/**
 * Geoportal-specific wrapper for useMapFrameworkSwitcher
 * Connects TopicMapContext and CesiumContext to the framework switcher
 */

import type { RefObject } from "react";
import { useCallback, useContext, useMemo, useRef, useEffect } from "react";

import type { Scene } from "@carma/cesium";
import { TransitionDirection } from "@carma-mapping/engines-interop";
import type { CesiumContextType } from "@carma-mapping/engines/cesium";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

type UseGeoportalFrameworkSwitcherOptions = {
  cesiumContext: CesiumContextType | null;
  cesiumContainerRef: RefObject<HTMLDivElement>;
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
  onTransitionStart,
  onTransitionComplete,
  onTransitionFailed,
}: UseGeoportalFrameworkSwitcherOptions) => {
  const { routedMapRef: routedMap } =
    useContext<typeof TopicMapContext>(TopicMapContext);

  // Track if initial setup is complete
  const hasInitializedRef = useRef(false);

  // Gate: Wait for critical dependencies before initializing
  // - routedMap must exist (Leaflet map created)
  // - routedMap.leafletMap must be ready
  const isAppReady = useMemo(() => {
    if (!routedMap) return false;
    return !!routedMap.leafletMap?.leafletElement;
  }, [routedMap]);

  // Log initialization only once when actually ready
  useEffect(() => {
    if (isAppReady && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
      console.log("[GEOPORTAL] Framework switcher ready:", {
        hasRoutedMap: !!routedMap,
        hasLeafletMap: !!routedMap?.leafletMap?.leafletElement,
        cesiumViewerReady: ctx?.isViewerReady ?? false,
      });
    }
  }, [isAppReady, routedMap, ctx]);

  // Memoized getters to prevent unnecessary rerenders
  // Return null if app isn't ready yet to prevent premature initialization
  const getLeafletMap = useCallback(() => {
    if (!isAppReady) return null;
    return routedMap?.leafletMap?.leafletElement ?? null;
  }, [routedMap, isAppReady]);

  const getCesiumScene = useCallback(() => {
    if (!isAppReady) return null;
    let scene: Scene | null = null;
    ctx?.withScene((s) => {
      scene = s;
    });
    return scene;
  }, [ctx, isAppReady]);

  const getCesiumContainer = useCallback(() => {
    if (!isAppReady) return null;
    return cesiumContainerRef.current;
  }, [cesiumContainerRef, isAppReady]);

  const getCesiumTerrainProviders = useCallback(() => {
    if (!isAppReady) {
      return { TERRAIN: undefined, SURFACE: undefined };
    }
    const terrain = ctx?.getTerrainProvider();
    const surface = ctx?.getSurfaceProvider();
    return {
      TERRAIN: terrain ?? undefined,
      SURFACE: surface ?? undefined,
    };
  }, [ctx, isAppReady]);

  const getResolutionScale = useCallback(() => {
    if (!isAppReady) return 1.0;
    return ctx?.viewerRef.current?.resolutionScale ?? 1.0;
  }, [ctx, isAppReady]);

  const handleTransitionStart = useCallback(
    async (direction: TransitionDirection) => {
      console.log("[GEOPORTAL] Transition started:", direction);

      // If transitioning to Cesium (2D→3D), ensure viewer is ready
      if (direction === TransitionDirection.TO_CESIUM && ctx) {
        console.log(
          "[GEOPORTAL] Ensuring Cesium viewer is ready before transition"
        );

        // Wait for viewer to be fully initialized
        if (!ctx.isViewerReady) {
          console.log(
            "[GEOPORTAL] Viewer not ready, waiting for initialization..."
          );
          await new Promise<void>((resolve) => {
            const checkReady = () => {
              if (ctx.isViewerReady) {
                console.log(
                  "[GEOPORTAL] Viewer ready, proceeding with transition"
                );
                resolve();
              } else {
                setTimeout(checkReady, 50);
              }
            };
            checkReady();
          });
        } else {
          console.log("[GEOPORTAL] Viewer already ready");
        }
      }

      onTransitionStart?.(direction);
    },
    [onTransitionStart, ctx]
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
      onTransitionStart: handleTransitionStart,
      onTransitionComplete: handleTransitionComplete,
      onTransitionFailed: handleTransitionFailed,
    }),
    [handleTransitionStart, handleTransitionComplete, handleTransitionFailed]
  );
};
