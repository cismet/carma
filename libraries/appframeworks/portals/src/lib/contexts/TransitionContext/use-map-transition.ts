import { useState, useMemo, useCallback } from "react";
import type { Map as LeafletMap } from "leaflet";

import type { HeadingPitchRange, CesiumWidget, Scene } from "@carma/cesium";
import type { LatLng } from "@carma/geo/types";
import { leafletToTopdownCesiumPose } from "@carma/cesium/core";

// Dynamic imports to avoid circular deps
import { getLeafletPosition } from "@carma-mapping/engines/leaflet";

// Import transition context - NO engine context imports
import { useTransitionContext } from "./use-transition-context";

// Import transition implementations
import { createTransitionTo2d, createTransitionTo3d } from "@carma-mapping/map-transition-2d-3d";

type TransitionOptions = {
  onComplete?: (isTo2d: boolean) => void;
  onCancel?: (isTo2D: boolean) => void;
  onEngineChange?: (engine: "leaflet2d" | "cesium3d") => void;
  onCesiumFadeIn?: () => void;
  duration?: number;
};

export const useMapTransition = ({
  onComplete,
  onCancel,
  onEngineChange,
  onCesiumFadeIn,
  duration,
}: TransitionOptions = {}) => {
  const {
    config: contextConfig,
    isTransitioningRef,
    getEngines,
  } = useTransitionContext();

  // Helper methods to get fresh instances on demand (PURE ENGINES PARADIGM)
  const getLeafletMap = useCallback((): LeafletMap | null => {
    const engines = getEngines();
    const leafletEngine = engines.find(e => e.engine === "leaflet2d") as any;
    if (leafletEngine?.instance && typeof leafletEngine.instance === 'function') {
      return leafletEngine.instance();
    }
    return null;
  }, [getEngines]);

  const getCesiumScene = useCallback((): Scene | null => {
    const engines = getEngines();
    const cesiumEngine = engines.find(e => e.engine === "cesium3d") as any;
    if (cesiumEngine?.instance && typeof cesiumEngine.instance === 'function') {
      return cesiumEngine.instance() as Scene;
    }
    return null;
  }, [getEngines]);

  const getCesiumResolutionScale = useCallback((): number => {
    const engines = getEngines();
    const cesiumEngine = engines.find(e => e.engine === "cesium3d") as any;
    if (cesiumEngine?.getResolutionScale && typeof cesiumEngine.getResolutionScale === 'function') {
      return cesiumEngine.getResolutionScale();
    }
    return 1.0; // Default
  }, [getEngines]);

  const getLeafletPixelRatio = useCallback((): number => {
    const engines = getEngines();
    const leafletEngine = engines.find(e => e.engine === "leaflet2d") as any;
    if (leafletEngine?.getPixelRatio && typeof leafletEngine.getPixelRatio === 'function') {
      return leafletEngine.getPixelRatio();
    }
    return window.devicePixelRatio ?? 1.0; // Fallback
  }, [getEngines]);

  const [last3dCameraOrientation, setLast3dCameraOrientation] =
    useState<HeadingPitchRange | null>(null);
  const [last3dAnimationDuration, setLast3dAnimationDuration] =
    useState<number>(0);

  const transition3dParams = useMemo(
    () => ({
      getLeafletMap,
      getCesiumScene,
      getCesiumResolutionScale,
      last3dCameraOrientation,
      last3dAnimationDuration,
      config: contextConfig.modeTo3d,
      onTransitionStart: async () => {
        isTransitioningRef.current = true;
        console.debug("[Transition] 2D→3D: Starting transition");
      },
      onSceneReady: () => {
        console.debug("[Transition] 2D→3D: Scene ready");
      },
      onCameraPositioned: () => {
        console.debug(
          "[Transition] 2D→3D: Camera positioned, CSS fade-in starts"
        );

        // Trigger CSS fade-in callback (provided by portal/app layer)
        onCesiumFadeIn?.();
      },
      onComplete: (isTo2d: boolean) => {
        isTransitioningRef.current = false;
        console.debug("[Transition] 2D→3D: Complete");

        // Notify engine change (consumer updates PortalContext/URL)
        onEngineChange?.("cesium3d");

        onComplete?.(isTo2d);
      },
      onCancel: (isTo2d: boolean, stage: string) => {
        isTransitioningRef.current = false;
        console.warn(`[Transition] 2D→3D: Cancelled at stage: ${stage}`);
        onCancel?.(isTo2d);
      },
    }),
    [
      getLeafletMap,
      getCesiumScene,
      getCesiumResolutionScale,
      last3dCameraOrientation,
      last3dAnimationDuration,
      contextConfig.modeTo3d,
      isTransitioningRef,
      onCesiumFadeIn,
      onEngineChange,
      onComplete,
      onCancel,
    ]
  );

  const transition2dParams = useMemo(
    () => ({
      getLeafletMap,
      getCesiumScene,
      getCesiumResolutionScale,
      getLeafletPixelRatio,
      setLast3dCameraOrientation,
      setLast3dAnimationDuration,
      config: contextConfig.modeTo2d,
      onTransitionStart: async () => {
        isTransitioningRef.current = true;
        console.debug("[Transition] 3D→2D: Activating TopicMap");

        // Dynamic imports to avoid circular deps

        // TopicMap engine activation handled by PortalContext
        // No manual activation needed

        // DON'T suspend Cesium here - it stays visible during camera tilt animation
        // Suspend happens in onCameraAnimationComplete callback
      },
      onCameraAnimationComplete: async () => {
        console.debug(
          "[Transition] 3D→2D: Camera animation complete, starting CSS fade"
        );

        // CSS fade-out will be handled by the transition logic
        // No need to emit Cesium events
      },
      onComplete: (isTo2d: boolean) => {
        isTransitioningRef.current = false;
        console.debug("[Transition] 3D→2D: Complete");

        // Notify engine change (consumer updates PortalContext/URL)
        onEngineChange?.("leaflet2d");

        onComplete?.(isTo2d);
      },
      onCancel: (isTo2d: boolean, stage: string) => {
        isTransitioningRef.current = false;
        console.warn(`[Transition] 3D→2D: Cancelled at stage: ${stage}`);
        onCancel?.(isTo2d);
      },
    }),
    [
      getLeafletMap,
      getCesiumScene,
      getCesiumResolutionScale,
      getLeafletPixelRatio,
      contextConfig.modeTo2d,
      isTransitioningRef,
      onEngineChange,
      onComplete,
      onCancel,
    ]
  );

  // Create transition factories (memoized via params)
  const transitionTo3dFactory = createTransitionTo3d(transition3dParams);
  const transitionTo2dFactory = createTransitionTo2d(transition2dParams);

  const transitionToMode3d = useCallback(async () => {
    console.log("[useMapTransition] ===== STARTING 3D TRANSITION =====");

    // Force fresh engine state - get multiple times to ensure we have latest
    console.log("[useMapTransition] Forcing fresh engine state...");
    const firstEngines = getEngines();
    console.log(
      "[useMapTransition] First fetch:",
      firstEngines.length,
      "engines"
    );

    // Small delay and fetch again to ensure we have the latest state
    await new Promise((resolve) => setTimeout(resolve, 10));
    const engines = getEngines();
    console.log("[useMapTransition] Second fetch:", engines.length, "engines");
    console.log(
      "[useMapTransition] Available engines:",
      engines.map((e) => ({
        engineType: e.engineType,
        engine: e.engine,
        isReady: e.isReady,
        isSuspended: e.isSuspended,
        hasInstance: !!e.instance,
      }))
    );

    // Try different ways to find the engines
    const leafletEngine = engines.find(
      (e) =>
        e.engineType === "leaflet2d" ||
        e.engine === "leaflet2d" ||
        e.engineType?.includes("leaflet")
    ) as any;
    const cesiumEngine = engines.find(
      (e) =>
        e.engineType === "cesium3d" ||
        e.engine === "cesium3d" ||
        e.engineType?.includes("cesium")
    ) as any;

    console.log("[useMapTransition] Found engines:", {
      leaflet: leafletEngine
        ? {
            engineType: leafletEngine.engineType,
            engine: leafletEngine.engine,
            isReady: leafletEngine.isReady,
            isSuspended: leafletEngine.isSuspended,
          }
        : "NOT FOUND",
      cesium: cesiumEngine
        ? {
            engineType: cesiumEngine.engineType,
            engine: cesiumEngine.engine,
            isReady: cesiumEngine.isReady,
            isSuspended: cesiumEngine.isSuspended,
          }
        : "NOT FOUND",
      allEngineTypes: engines.map((e) => e.engineType || e.engine),
    });

    // Pre-flight checks
    if (!leafletEngine?.isReady || leafletEngine.isSuspended) {
      console.warn("[useMapTransition] Leaflet engine not ready or suspended");
      onCancel?.(false);
      return;
    }

    if (!cesiumEngine?.isReady) {
      console.log(
        "[useMapTransition] Cesium engine not ready - waiting for scene to initialize"
      );

      // Cesium is always mounted (visibility:hidden in 2D mode), just wait for it to be ready
      // Wait for scene to become ready (poll for up to 5 seconds)
      let attempts = 0;
      const maxAttempts = 50; // 50 * 100ms = 5 seconds

      while (attempts < maxAttempts) {
        attempts++;
        await new Promise((resolve) => setTimeout(resolve, 100));

        const currentEngines = getEngines();
        const currentCesiumEngine = currentEngines.find(
          (e) => e.engineType === "cesium3d" || e.engine === "cesium3d"
        ) as any;

        console.log(`[useMapTransition] Check ${attempts}/${maxAttempts}:`, {
          isReady: currentCesiumEngine?.isReady,
          isSuspended: currentCesiumEngine?.isSuspended,
          hasInstance: !!currentCesiumEngine?.instance,
        });

        if (currentCesiumEngine?.isReady) {
          console.log("[useMapTransition] Cesium engine is now ready!");
          break;
        }
      }

      // Final check
      const finalEngines = getEngines();
      const finalCesiumEngine = finalEngines.find(
        (e) => e.engineType === "cesium3d" || e.engine === "cesium3d"
      ) as any;

      if (!finalCesiumEngine?.isReady) {
        console.error(
          "[useMapTransition] Cesium engine never became ready after 5 seconds"
        );
        onCancel?.(false);
        return;
      }
    } else {
      console.log("[useMapTransition] Both engines ready for transition");
    }

    // Get actual map instances using getters (always fresh)
    const leafletMap = getLeafletMap();
    const scene = getCesiumScene();

    console.log("[useMapTransition] Instance check:", {
      hasLeafletMap: !!leafletMap,
      hasScene: !!scene,
    });

    // Final checks with actual instances
    if (!scene) {
      console.error(
        "[useMapTransition] No scene available - Cesium not initialized"
      );
      onComplete?.(false);
      return;
    }

    if (!leafletMap) {
      console.warn("[useMapTransition] No leaflet map available");
      onCancel?.(false);
      return;
    }

    // Extract Leaflet position
    const leafletPosition = getLeafletPosition(leafletMap);
    const { lat, lng, zoom } = leafletPosition;

    // Compute Cesium pose from Leaflet position (with fallback elevation)
    // Use contextConfig from hook call at top of component
    const fallbackHeightM =
      contextConfig.modeTo3d?.step4_fallbackGroundElevationM;

    const cesiumResolutionScale = getCesiumResolutionScale();
    const leafletPixelRatio = getLeafletPixelRatio();
    
    console.log("[useMapTransition] Resolution/Scale values:", {
      cesiumResolutionScale,
      leafletPixelRatio,
      windowDevicePixelRatio: window.devicePixelRatio,
    });

    const poseWithFallback = leafletToTopdownCesiumPose(
      scene,
      { latitude: lat, longitude: lng } as LatLng.deg,
      zoom,
      cesiumResolutionScale,
      fallbackHeightM !== undefined ? { fallbackHeightM } : undefined
    );

    if (!poseWithFallback) {
      console.warn("[useMapTransition] Failed to compute Cesium pose");
      onCancel?.(false);
      return;
    }

    console.log(
      "[useMapTransition] Computed pose with fallback elevation:",
      poseWithFallback
    );
    console.log(
      `[useMapTransition] Elevation: ${poseWithFallback.height}m (source: ${poseWithFallback.elevationSource})`
    );

    // NOW call transition with guaranteed scene and pose with fallback elevation
    // transition-to-3d can assume these are available
    await transitionTo3dFactory(poseWithFallback);
  }, [
    getLeafletMap,
    getCesiumScene,
    getCesiumResolutionScale,
    getEngines,
    onComplete,
    onCancel,
    transitionTo3dFactory,
    contextConfig.modeTo3d?.step4_fallbackGroundElevationM,
  ]);

  const transitionToMode2d = useCallback(() => {
    return transitionTo2dFactory();
  }, [transitionTo2dFactory]);
  return { transitionToMode2d, transitionToMode3d };
};
