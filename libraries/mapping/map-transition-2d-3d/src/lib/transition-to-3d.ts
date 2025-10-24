import type { MutableRefObject } from "react";
import type { Map as LeafletMap } from "leaflet";
import type { Scene, CesiumWidget } from "@carma/cesium";
import { HeadingPitchRange } from "@carma/cesium";

import { promiseWithTimeout } from "@carma-commons/utils";
import { isZoom } from "@carma-commons/units/helpers";
import type { Longitude, Latitude } from "@carma/geo/types";
import { waitForAnimationFrames } from "@carma-commons/dom/window";
import {
  LeafletMapEventNames,
  getLeafletPosition,
} from "@carma-mapping/engines/leaflet";

import {
  EmitFn as EmitCesiumFn,
  SubscribeFn as SubscribeCesiumFn,
  animateInterpolateHeadingPitchRange,
  pickSceneCenter,
  isWebGLErrorRequiringReinit,
  type CesiumPoseWithFallback,
  leafletToTopdownCesiumPose,
  isValidScene,
  CtxEvent,
} from "@carma-mapping/engines/cesium/core";

import {
  MapTransitionState,
  type TransitionTo3dConfig,
  type TransitionStageTracker,
} from "./TransitionContext";
import { startStage, endStage } from "./transition-stage-helpers";
import { tiledMapToCesium } from "./tiled-map-to-cesium";

export type TransitionTo3dParams = {
  leafletMapRef: MutableRefObject<LeafletMap | null>;
  sceneRef: MutableRefObject<Scene | null>;
  widgetRef: MutableRefObject<CesiumWidget | null>; // Still needed for resolutionScale
  transitionStateRef: MutableRefObject<MapTransitionState>;
  transitionStageTrackerRef: MutableRefObject<TransitionStageTracker>;
  last3dCameraOrientation: HeadingPitchRange | null;
  last3dAnimationDuration: number;
  config?: TransitionTo3dConfig;
  emitCesiumEvent: EmitCesiumFn;
  subscribe: SubscribeCesiumFn;
  onComplete?: (isTo2d: boolean) => void;
  onCancel?: (isTo2D: boolean) => void;
};

export const createTransitionTo3d =
  (params: TransitionTo3dParams) =>
  async (poseWithFallback: CesiumPoseWithFallback) => {
    const {
      leafletMapRef,
      sceneRef,
      widgetRef,
      transitionStateRef,
      transitionStageTrackerRef,
      last3dCameraOrientation,
      last3dAnimationDuration,
      config,
      emitCesiumEvent,
      subscribe,
      onComplete,
      onCancel,
    } = params;

    const {
      step1_prepare2dView = {},
      step2_initialRender = {},
      step3_waitForResources = {},
      step5_cssFadeIn = {},
      step6_cameraAnimation = {},
    } = config ?? {};

    const {
      maxZoom = 20,
      zoomOutDurationMs = 700,
      zoomOutEaseLinearity = 0.75,
      zoomOutTimeoutBufferMs = 100,
    } = step1_prepare2dView ?? {};

    const { timeoutMs: initialRenderTimeoutMs = 500 } =
      step2_initialRender ?? {};
    const { timeoutMs: resourcesTimeoutMs = 3500 } =
      step3_waitForResources ?? {};
    const { durationMs: cssFadeInDurationMs = 1000 } = step5_cssFadeIn ?? {};
    const { durationMs: cameraAnimationDurationMs = 2000 } =
      step6_cameraAnimation ?? {};

    const prepareLeafletForTransition = async (
      leaflet: LeafletMap | null | undefined
    ) => {
      if (!leaflet) {
        return;
      }

      const cleanups: Array<() => void> = [];

      const zoom = leaflet.getZoom();
      const shouldZoomOut = isZoom(zoom) && zoom > maxZoom;

      let moveEndPromise: Promise<void> | undefined;

      if (shouldZoomOut) {
        moveEndPromise = new Promise<void>((resolve) => {
          const handle = () => {
            leaflet.off(LeafletMapEventNames.zoomend, handle);
            resolve();
          };
          cleanups.push(() =>
            leaflet.off(LeafletMapEventNames.zoomend, handle)
          );
          leaflet.once(LeafletMapEventNames.zoomend, handle);
        });
      }

      leaflet.stop();

      try {
        if (shouldZoomOut && Number.isFinite(maxZoom)) {
          const durationSeconds = Math.max(0, zoomOutDurationMs) / 1000;
          leaflet.flyTo(leaflet.getCenter(), maxZoom, {
            duration: durationSeconds,
            animate: durationSeconds > 0,
            easeLinearity: zoomOutEaseLinearity,
          });
        }

        if (moveEndPromise) {
          const timeoutMs =
            Math.max(0, zoomOutDurationMs) +
            Math.max(0, zoomOutTimeoutBufferMs);
          await promiseWithTimeout(moveEndPromise, timeoutMs);
        }
      } finally {
        cleanups.forEach((cleanup) => cleanup());
      }
    };

    // Incomplete pose provided by useMapTransition - guaranteed to exist
    // Scene is guaranteed to exist (checked in useMapTransition)
    const leafletMap = leafletMapRef.current;
    const scene = sceneRef.current!; // Non-null assertion safe here

    console.log(
      "[CESIUM|2D3D|TO3D] Received pose with fallback elevation:",
      poseWithFallback
    );
    console.log(
      `[CESIUM|2D3D|TO3D] Elevation source: ${poseWithFallback.elevationSource} (${poseWithFallback.height}m)`
    );
    console.log(
      "[CESIUM|2D3D|TO3D] TODO: Store pose for scene init (terrain sampling if elevationSource=fallback)"
    );

    console.debug("[CESIUM|2D3D|TO3D] Starting transition with valid scene");

    startStage(
      transitionStateRef,
      transitionStageTrackerRef,
      MapTransitionState.to3d_step1_prepare2dView
    );

    await prepareLeafletForTransition(leafletMap);

    try {
      scene?.camera?.cancelFlight?.();
    } catch (error) {
      console.error("[CESIUM|2D3D|TO3D] Error cancelling flight", error);
    }
    endStage(
      transitionStageTrackerRef,
      MapTransitionState.to3d_step1_prepare2dView
    );

    const onComplete3d = () => {
      console.debug("[CESIUM|2D3D|TO3D] onComplete3d - setting mode to mode3d");
      transitionStateRef.current = MapTransitionState.mode3d;
      onComplete?.(false);
    };

    const onCancelAnimation3d = () => {
      console.debug(
        "[CESIUM|2D3D|TO3D] animation cancelled by user - setting mode to mode3d"
      );
      transitionStateRef.current = MapTransitionState.mode3d;
      // this is only about the animation not a cancelled transition
      onComplete?.(false);
    };

    const animateCesiumView = () => {
      const scene = sceneRef.current;
      if (!scene) {
        console.warn(
          "[CESIUM|2D3D|TO3D] scene not available for animation, completing transition anyway"
        );
        onComplete3d();
        return;
      }

      const pos = pickSceneCenter(scene).scenePosition;

      if (pos && last3dCameraOrientation) {
        // Returning to 3D - restore previous camera angle
        console.debug(
          "[CESIUM|2D3D|TO3D] restore 3d camera position zoom",
          pos,
          last3dCameraOrientation
        );
        animateInterpolateHeadingPitchRange(
          scene,
          pos,
          last3dCameraOrientation,
          {
            delay: cssFadeInDurationMs, // Wait for CSS fade-in to complete
            duration: last3dAnimationDuration * 1000,
            useCurrentDistance: true,
            cancelable: true,
            onComplete: onComplete3d,
            onCancel: onCancelAnimation3d,
          }
        );
      } else if (pos) {
        // First-time 3D - animate to oblique angle
        console.debug(
          "[CESIUM|2D3D|TO3D] First-time 3D transition - animating to oblique angle"
        );
        const obliqueHPR = new HeadingPitchRange(
          0, // heading: north
          -Math.PI / 4, // pitch: 45 degrees down (oblique)
          undefined // keep current distance
        );
        animateInterpolateHeadingPitchRange(scene, pos, obliqueHPR, {
          delay: cssFadeInDurationMs, // Wait for CSS fade-in to complete
          duration: cameraAnimationDurationMs, // Use config duration (1000ms default)
          useCurrentDistance: true,
          cancelable: true,
          onComplete: onComplete3d,
          onCancel: onCancelAnimation3d,
        });
      } else {
        console.warn(
          "[CESIUM|2D3D|TO3D] No scene position available, completing without animation"
        );
        onComplete3d();
        return;
      }
    };

    startStage(
      transitionStateRef,
      transitionStageTrackerRef,
      MapTransitionState.to3d_step1_prepare2dView
    );

    console.log(
      "[CESIUM|2D3D|TO3D] ========== STEP 1: Starting Transition =========="
    );
    // NOTE: Engine activation (Cesium activate, TopicMap suspend) is now handled
    // by TransitionContextProvider watching the transitionStateRef
    // This keeps transition logic clean and centralized
    console.log("[CESIUM|2D3D|TO3D] ✓ Transition state set");
    endStage(
      transitionStageTrackerRef,
      MapTransitionState.to3d_step1_prepare2dView
    );

    console.log(
      "[CESIUM|2D3D|TO3D] ========== STEP 2: Initial Render =========="
    );
    startStage(
      transitionStateRef,
      transitionStageTrackerRef,
      MapTransitionState.to3d_step2_initialRender
    );
    // Request initial render and wait 2 frames for scene to stabilize
    scene.requestRender();
    await waitForAnimationFrames(2);
    console.log("[CESIUM|2D3D|TO3D] ✓ Initial render completed (2 frames)");
    endStage(
      transitionStageTrackerRef,
      MapTransitionState.to3d_step2_initialRender
    );

    console.log(
      "[CESIUM|2D3D|TO3D] ========== STEP 3: Subscribe to Resource Events =========="
    );
    startStage(
      transitionStateRef,
      transitionStageTrackerRef,
      MapTransitionState.to3d_step3_waitForResources
    );

    // Subscribe to SceneResourcesReady (event-driven, no timeout)
    // Tiles will continue loading during camera animation
    // Event fires when initial tiles are ready (for future use)
    const unsubscribeResources = subscribe(CtxEvent.SceneResourcesReady, () => {
      console.log(
        "[CESIUM|2D3D|TO3D] ✓ SceneResourcesReady received (tiles loaded during/after transition)"
      );
      unsubscribeResources();
    });

    console.log(
      "[CESIUM|2D3D|TO3D] Event listener registered, continuing immediately (tiles load async)"
    );
    endStage(
      transitionStageTrackerRef,
      MapTransitionState.to3d_step3_waitForResources
    );

    console.log(
      "[CESIUM|2D3D|TO3D] ========== STEP 4: Position Camera =========="
    );
    startStage(
      transitionStateRef,
      transitionStageTrackerRef,
      MapTransitionState.to3d_step4_positionCamera
    );

    // Re-validate scene before positioning (might have been destroyed during wait)
    const sceneBeforePositioning = sceneRef.current;
    if (!isValidScene(sceneBeforePositioning)) {
      console.error(
        "[CESIUM|2D3D|TO3D] ✗ Scene was destroyed during resource wait"
      );
      transitionStateRef.current = MapTransitionState.mode2d;
      onCancel?.(false);
      throw new Error(
        "Transition to 3D cancelled: scene destroyed during transition"
      );
    }

    // NOW position the camera with tilesets loaded
    let transitionCompleted = false;
    const cameraStartTime = Date.now();

    // Extract values from Leaflet map and Cesium widget using existing helper
    const currentLeafletMap = leafletMapRef.current;
    const widget = widgetRef.current;

    if (!currentLeafletMap || !widget) {
      console.error("[CESIUM|2D3D|TO3D] Missing Leaflet map or Cesium widget");
      transitionStateRef.current = MapTransitionState.mode2d;
      onCancel?.(false);
      throw new Error("Transition to 3D cancelled: missing map or widget");
    }

    const {
      lat: latitude,
      lng: longitude,
      zoom,
    } = getLeafletPosition(currentLeafletMap);
    const resolutionScale = widget.resolutionScale;

    try {
      await tiledMapToCesium(
        sceneBeforePositioning,
        {
          latitude: latitude as Latitude.deg,
          longitude: longitude as Longitude.deg,
        },
        zoom,
        resolutionScale,
        {
          cause: "SwitchMapMode to 3d",
          onComplete: () => {
            const elapsed = Date.now() - cameraStartTime;
            console.log(
              `[CESIUM|2D3D|TO3D] ✓ Camera positioned after ${elapsed}ms`
            );
            transitionCompleted = true;
          },
        }
      );
      console.log("[CESIUM|2D3D|TO3D] tiledMapToCesium completed successfully");
    } catch (error) {
      console.error("[CESIUM|2D3D|TO3D] ✗ Camera positioning failed:", error);
      console.error("[CESIUM|2D3D|TO3D] Error details:", {
        message: (error as Error).message,
        stack: (error as Error).stack,
      });

      // Check if it's a WebGL error that requires scene reinit
      if (isWebGLErrorRequiringReinit(error)) {
        console.warn(
          "[CESIUM|2D3D|TO3D] ⚠ WebGL error detected - requesting scene reinit"
        );
        emitCesiumEvent(CtxEvent.ReinitScene, {
          reason: "WebGL framebuffer error during 2D→3D transition",
        });
      }

      transitionStateRef.current = MapTransitionState.mode2d;
      onCancel?.(false);
      throw new Error(`Transition to 3D cancelled: ${error}`);
    }
    endStage(
      transitionStageTrackerRef,
      MapTransitionState.to3d_step4_positionCamera
    );

    if (transitionCompleted) {
      console.log(
        "[CESIUM|2D3D|TO3D] ========== STEP 5: Finalize Transition =========="
      );
      startStage(
        transitionStateRef,
        transitionStageTrackerRef,
        MapTransitionState.to3d_step5_cssFadeIn
      );

      // Request render after camera positioning and wait
      if (sceneBeforePositioning) {
        sceneBeforePositioning.requestRender();
        await waitForAnimationFrames(2);
        console.log(
          "[CESIUM|2D3D|TO3D] ✓ Render completed after positioning (2 frames)"
        );
      } else {
        console.warn(
          "[CESIUM|2D3D|TO3D] Scene not available for render request"
        );
      }

      // Make scene visible immediately - tiles will continue loading during animation
      emitCesiumEvent(CtxEvent.SceneVisible, undefined);
      console.log(
        "[CESIUM|2D3D|TO3D] ✓ Scene visible event emitted - fade-in starts"
      );
      endStage(
        transitionStageTrackerRef,
        MapTransitionState.to3d_step5_cssFadeIn
      );

      console.log(
        "[CESIUM|2D3D|TO3D] ========== STEP 6: Start Camera Animation =========="
      );
      startStage(
        transitionStateRef,
        transitionStageTrackerRef,
        MapTransitionState.to3d_step6_cameraAnimation
      );
      // Start camera animation
      animateCesiumView();
      endStage(
        transitionStageTrackerRef,
        MapTransitionState.to3d_step6_cameraAnimation
      );
      console.log(
        "[CESIUM|2D3D|TO3D] ========== Transition Complete =========="
      );
    }
  };
