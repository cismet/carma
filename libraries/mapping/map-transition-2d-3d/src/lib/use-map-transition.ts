import { useState, useMemo, useCallback } from "react";

import type { HeadingPitchRange } from "@carma/cesium";
import type { LatLng } from "@carma/geo/types";

import { useCarmaTopicMapContext } from "@carma-mapping/engines/carma-cismap";
import { getLeafletPosition } from "@carma-mapping/engines/leaflet";

// Import from cesium engine
import { useCesiumContext, CtxEvent } from "@carma-mapping/engines/cesium/core";
import { leafletToTopdownCesiumPose } from "@carma/cesium/core";

// Import transition context
import { useTransitionContext } from "./use-transition-context";
import { MapTransitionState, isTransitioningState } from "./TransitionContext";

// Import transition implementations
import { createTransitionTo3d } from "./transition-to-3d";
import { createTransitionTo2d } from "./transition-to-2d";

export const isTransitionState = (state: unknown): boolean => {
  // Check if state is a valid MapTransitionState and is transitioning (not mode2d/mode3d)
  return (
    Object.values(MapTransitionState).includes(state as MapTransitionState) &&
    isTransitioningState(state as MapTransitionState)
  );
};

export const shouldBlockUserInput = (state: unknown): boolean => {
  // All transition states should block user input
  // Stable states (mode2d, mode3d) should not block
  return isTransitionState(state);
};

type TransitionOptions = {
  onComplete?: (isTo2d: boolean) => void;
  onCancel?: (isTo2D: boolean) => void;
};

export const useMapTransition = (options: TransitionOptions = {}) => {
  const { config: contextConfig } = useTransitionContext();

  const { onComplete, onCancel } = options;

  const { leafletMapRef } = useCarmaTopicMapContext();
  const { transitionStateRef, transitionStageTrackerRef } =
    useTransitionContext();
  const {
    widgetRef,
    sceneRef,
    emit: emitCesiumEvent,
    subscribe,
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
      transitionStateRef,
      transitionStageTrackerRef,
      last3dCameraOrientation,
      last3dAnimationDuration,
      config: contextConfig.modeTo3d,
      emitCesiumEvent,
      subscribe,
      onComplete,
      onCancel,
    }),
    [
      leafletMapRef,
      sceneRef,
      widgetRef,
      transitionStateRef,
      transitionStageTrackerRef,
      last3dCameraOrientation,
      last3dAnimationDuration,
      contextConfig.modeTo3d,
      emitCesiumEvent,
      subscribe,
      onComplete,
      onCancel,
    ]
  );

  const transition2dParams = useMemo(
    () => ({
      leafletMapRef,
      sceneRef,
      widgetRef,
      transitionStateRef,
      transitionStageTrackerRef,
      setLast3dCameraOrientation,
      setLast3dAnimationDuration,
      config: contextConfig.modeTo2d,
      emitCesiumEvent,
      onComplete,
      onCancel,
    }),
    [
      leafletMapRef,
      sceneRef,
      widgetRef,
      transitionStateRef,
      transitionStageTrackerRef,
      contextConfig.modeTo2d,
      emitCesiumEvent,
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

      // Emit Activate event - portal wrapper will:
      // 1. Set currentSceneStyleRef and initialCamera refs
      // 2. Mount CesiumSceneComponent (isActive=true)
      // 3. Scene hooks will read refs on mount
      emitCesiumEvent(CtxEvent.Activate, { source: "map-mode-toggle" });

      // Wait for scene to be ready
      console.log("[useMapTransition] Waiting for scene to initialize...");
      await new Promise<void>((resolve) => {
        const unsubSceneReady = subscribe(CtxEvent.SceneReady, () => {
          console.log(
            "[useMapTransition] Scene ready - waiting for content to be presentable..."
          );
          unsubSceneReady();

          // Now wait for minimum content to be loaded (tilesets, terrain, imagery have minimum tiles/data)
          const unsubContentPresentable = subscribe(
            CtxEvent.SceneContentPresentable,
            () => {
              console.log(
                "[useMapTransition] Content presentable - stabilizing before transition..."
              );
              unsubContentPresentable();

              // Add small delay to let rapid-fire Activate events settle
              // Portal emits multiple Activate events during transition setup
              // Need to wait for React reconciliation to finish
              setTimeout(() => {
                console.log(
                  "[useMapTransition] Stabilization complete - continuing transition"
                );
                resolve();
              }, 100); // 100ms delay for stabilization
            }
          );

          // Timeout fallback for content (10 seconds)
          setTimeout(() => {
            console.warn(
              "[useMapTransition] Content presentable timeout - continuing anyway"
            );
            unsubContentPresentable();
            resolve();
          }, 10000);
        });

        // Timeout fallback for scene (5 seconds)
        setTimeout(() => {
          console.warn("[useMapTransition] Scene ready timeout");
          unsubSceneReady();
          resolve();
        }, 5000);
      });

      // Re-read refs after scene initialization
      scene = sceneRef.current;
      widget = widgetRef.current;

      if (!scene) {
        console.error(
          "[useMapTransition] Scene still not available after activation"
        );
        transitionStateRef.current = MapTransitionState.mode3d;
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
    const fallbackHeightM = contextConfig.modeTo3d?.fallbackGroundElevationM;

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
    transitionStateRef,
    onComplete,
    onCancel,
    transitionTo3dFactory,
    emitCesiumEvent,
    subscribe,
    contextConfig.modeTo3d?.fallbackGroundElevationM,
  ]);

  const transitionToMode2d = useCallback(() => {
    return transitionTo2dFactory();
  }, [transitionTo2dFactory]);
  return { transitionToMode2d, transitionToMode3d };
};
