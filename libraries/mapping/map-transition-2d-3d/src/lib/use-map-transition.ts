import { useState, useMemo, useCallback } from "react";

import type { HeadingPitchRange } from "@carma/cesium";
import type { LatLng } from "@carma/geo/types";

// Dynamic imports to avoid circular deps
import { getLeafletPosition } from "@carma-mapping/engines/leaflet";

// Import transition context
import { useTransitionContext } from "./use-transition-context";

// eslint-disable-next-line carma/no-direct-cesium
import { useCarmaTopicMapContext } from "@carma-mapping/engines/carma-cismap";
// eslint-disable-next-line carma/no-direct-cesium
import { useCesiumContext } from "@carma-mapping/engines/cesium/core";

// Import transition implementations
import { createTransitionTo3d } from "./transition-to-3d";
import { createTransitionTo2d } from "./transition-to-2d";

type TransitionOptions = {
  onComplete?: (isTo2d: boolean) => void;
  onCancel?: (isTo2D: boolean) => void;
};

export const useMapTransition = (options: TransitionOptions = {}) => {
  const { config: contextConfig, isTransitioningRef } = useTransitionContext();

  const { onComplete, onCancel } = options;

  const { leafletMapRef, emit: emitTopicMapEvent } = useCarmaTopicMapContext();
  const {
    widgetRef,
    sceneRef,
  } = useCesiumContext();

  const [last3dCameraOrientation, setLast3dCameraOrientation] =
    useState<HeadingPitchRange | null>(null);
  const [last3dAnimationDuration, setLast3dAnimationDuration] =
    useState<number>(0);

  const transition3dParams = useMemo(
    () => ({
      leafletMapRef,
      sceneRef,
      widgetRef,
      last3dCameraOrientation,
      last3dAnimationDuration,
      config: contextConfig.modeTo3d,
      onTransitionStart: async () => {
        isTransitioningRef.current = true;
        console.debug("[Transition] 2D→3D: Starting transition");
        
        // Dynamic imports to avoid circular deps
        const { TopicMapCtxEvent } = await import("@carma-mapping/engines/carma-cismap");
        
        // Suspend TopicMap engine
        emitTopicMapEvent(TopicMapCtxEvent.Suspend, undefined);
      },
      onSceneReady: () => {
        console.debug("[Transition] 2D→3D: Scene ready");
      },
      onCameraPositioned: () => {
        console.debug("[Transition] 2D→3D: Camera positioned, CSS fade-in starts");
      },
      onComplete: (isTo2d: boolean) => {
        isTransitioningRef.current = false;
        console.debug("[Transition] 2D→3D: Complete");
        onComplete?.(isTo2d);
      },
      onCancel: (isTo2d: boolean, stage: string) => {
        isTransitioningRef.current = false;
        console.warn(`[Transition] 2D→3D: Cancelled at stage: ${stage}`);
        onCancel?.(isTo2d);
      },
    }),
    [
      leafletMapRef,
      sceneRef,
      widgetRef,
      last3dCameraOrientation,
      last3dAnimationDuration,
      contextConfig.modeTo3d,
      isTransitioningRef,
      emitTopicMapEvent,
      onComplete,
      onCancel,
    ]
  );

  const transition2dParams = useMemo(
    () => ({
      leafletMapRef,
      sceneRef,
      widgetRef,
      setLast3dCameraOrientation,
      setLast3dAnimationDuration,
      config: contextConfig.modeTo2d,
      onTransitionStart: async () => {
        isTransitioningRef.current = true;
        console.debug("[Transition] 3D→2D: Activating TopicMap");
        
        // Dynamic imports to avoid circular deps
        const { TopicMapCtxEvent } = await import("@carma-mapping/engines/carma-cismap");
        
        // Activate TopicMap engine immediately
        emitTopicMapEvent(TopicMapCtxEvent.Activate, undefined);
        
        // DON'T suspend Cesium here - it stays visible during camera tilt animation
        // Suspend happens in onCameraAnimationComplete callback
      },
      onCameraAnimationComplete: async () => {
        console.debug("[Transition] 3D→2D: Camera animation complete, starting CSS fade");
        
        // CSS fade-out will be handled by the transition logic
        // No need to emit Cesium events
      },
      onComplete: (isTo2d: boolean) => {
        isTransitioningRef.current = false;
        console.debug("[Transition] 3D→2D: Complete");
        onComplete?.(isTo2d);
      },
      onCancel: (isTo2d: boolean, stage: string) => {
        isTransitioningRef.current = false;
        console.warn(`[Transition] 3D→2D: Cancelled at stage: ${stage}`);
        onCancel?.(isTo2d);
      },
    }),
    [
      leafletMapRef,
      sceneRef,
      widgetRef,
      contextConfig.modeTo2d,
      isTransitioningRef,
      emitTopicMapEvent,
      onComplete,
      onCancel,
    ]
  );

  // Create transition factories (memoized via params)
  const transitionTo3dFactory = createTransitionTo3d(transition3dParams);
  const transitionTo2dFactory = createTransitionTo2d(transition2dParams);

  const transitionToMode3d = useCallback(async () => {
    // Pre-flight checks and pose calculation BEFORE calling transition
    const leafletMap = leafletMapRef.current;
    let scene = sceneRef.current;
    let widget = widgetRef.current;

    // If no scene, we need to activate it first (first time 2D→3D)
    if (!scene) {
      console.log(
        "[useMapTransition] No scene available - activating for first time"
      );

      // Direct scene activation - set refs and wait for scene to be ready
      console.log("[useMapTransition] Activating scene directly...");
      
      // Wait for scene to be ready using polling
      console.log("[useMapTransition] Waiting for scene to be ready...");
      await new Promise<void>((resolve) => {
        const checkSceneReady = () => {
          const currentScene = sceneRef.current;
          if (currentScene && currentScene.isDestroyed() === false) {
            console.log("[useMapTransition] Scene ready - continuing transition");
            resolve();
          } else {
            // Scene not ready yet, check again in 100ms
            setTimeout(checkSceneReady, 100);
          }
        };

        // Start checking immediately
        checkSceneReady();

        // Timeout fallback (3 seconds)
        setTimeout(() => {
          console.warn("[useMapTransition] Scene ready timeout - continuing anyway");
          resolve();
        }, 3000);
      });

      // Re-read refs after scene initialization
      scene = sceneRef.current;
      widget = widgetRef.current;

      if (!scene) {
        console.error(
          "[useMapTransition] Scene still not available after activation"
        );
        onComplete?.(false);
        return;
      }
    }

    // If no widget, can't compute pose
    if (!widget) {
      console.warn("[useMapTransition] No widget available");
      onCancel?.(false);
      return;
    }

    // If no leaflet map, can't derive position
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
    const fallbackHeightM = contextConfig.modeTo3d?.step4_fallbackGroundElevationM;

    // Dynamic import to avoid circular deps
    const { leafletToTopdownCesiumPose } = await import("@carma/cesium/core");

    const poseWithFallback = leafletToTopdownCesiumPose(
      scene,
      { latitude: lat, longitude: lng } as LatLng.deg,
      zoom,
      widget.resolutionScale,
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
    leafletMapRef,
    sceneRef,
    widgetRef,
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
