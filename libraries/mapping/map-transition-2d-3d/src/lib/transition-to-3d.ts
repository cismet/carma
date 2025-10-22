import type { MutableRefObject } from "react";
import type { Map as LeafletMap } from "leaflet";
import type { Scene, CesiumWidget } from "cesium";
import {
  HeadingPitchRange,
  isValidScene,
  tryWithValidCamera,
} from "@carma/cesium";

import { promiseWithTimeout } from "@carma-commons/utils";
import { isZoom } from "@carma-commons/units/helpers";
import type { Longitude, Latitude } from "@carma/geo/types";
import { waitForAnimationFrames } from "@carma-commons/dom/window";
import { LeafletMapEventNames } from "@carma-mapping/engines/leaflet";

import type { TopicMapCtxEvent } from "@carma-mapping/engines/carma-cismap";
import type {
  CtxEvent,
  EmitFn as EmitCesiumFn,
  SubscribeFn as SubscribeCesiumFn,
} from "@carma-mapping/engines/cesium/core";
import {
  animateInterpolateHeadingPitchRange,
  pickSceneCenter,
} from "@carma-mapping/engines/cesium/core";

import {
  MapTransitionState,
  type TransitionStageTracker,
} from "./TransitionContext";
import { startStage, endStage } from "./transition-stage-helpers";
import { tiledMapToCesium } from "./tiled-map-to-cesium";

const MapState = {
  uninitialized: "uninitialized",
  ...MapTransitionState,
};

import type { TransitionTo3dConfig } from "./TransitionContext";

export type TransitionTo3dParams = {
  leafletMapRef: MutableRefObject<LeafletMap | null>;
  sceneRef: MutableRefObject<Scene | null>;
  widgetRef: MutableRefObject<CesiumWidget | null>; // Still needed for resolutionScale
  transitionStateRef: MutableRefObject<string>;
  transitionStageTrackerRef: MutableRefObject<TransitionStageTracker>;
  last3dCameraOrientation: HeadingPitchRange | null;
  last3dAnimationDuration: number;
  config?: TransitionTo3dConfig;
  emitCesiumEvent: EmitCesiumFn;
  emitTopicMapEvent: (event: TopicMapCtxEvent, data: any) => void;
  subscribe: SubscribeCesiumFn;
  onComplete?: (isTo2d: boolean) => void;
  onCancel?: (isTo2D: boolean) => void;
};

export const createTransitionTo3d = (params: TransitionTo3dParams) => {
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
    emitTopicMapEvent,
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

  const { timeoutMs: initialRenderTimeoutMs = 500 } = step2_initialRender ?? {};
  const { timeoutMs: resourcesTimeoutMs = 2000 } = step3_waitForResources ?? {};
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
        cleanups.push(() => leaflet.off(LeafletMapEventNames.zoomend, handle));
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
          Math.max(0, zoomOutDurationMs) + Math.max(0, zoomOutTimeoutBufferMs);
        await promiseWithTimeout(moveEndPromise, timeoutMs);
      }
    } finally {
      cleanups.forEach((cleanup) => cleanup());
    }
  };

  return async (
    CtxEvent: typeof import("@carma-mapping/engines/cesium/core").CtxEvent,
    TopicMapCtxEvent: typeof import("@carma-mapping/engines/carma-cismap").TopicMapCtxEvent
  ) => {
    const leafletMap = leafletMapRef.current;
    const scene = sceneRef.current;

    // Scene is guaranteed to be initialized by useMapTransition
    if (!isValidScene(scene) || !leafletMap) {
      console.warn("[CESIUM|2D3D|TO3D] Scene or leaflet not available", {
        sceneValid: isValidScene(scene),
        leafletMap: !!leafletMap,
      });
      onCancel?.(false);
      throw new Error(
        "Transition to 3D cancelled: scene or leaflet not available"
      );
    }

    console.debug("[CESIUM|2D3D|TO3D] Starting transition with valid scene");

    transitionStateRef.current = MapTransitionState.preTransitionTo3d;
    startStage(transitionStageTrackerRef, "step1_prepare2dView");

    await prepareLeafletForTransition(leafletMap);

    // cancel any ongoing flight
    tryWithValidCamera(
      scene.camera,
      (camera) => {
        camera.cancelFlight();
      },
      "transitionToMode3d"
    );
    endStage(transitionStageTrackerRef, "step1_prepare2dView");

    const onComplete3d = () => {
      console.debug("[CESIUM|2D3D|TO3D] onComplete3d - setting mode to mode3d");
      transitionStateRef.current = MapState.mode3d;
      onComplete?.(false);
    };

    const onCancelAnimation3d = () => {
      console.debug(
        "[CESIUM|2D3D|TO3D] animation cancelled by user - setting mode to mode3d"
      );
      transitionStateRef.current = MapState.mode3d;
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

    const { lat: latitude, lng: longitude } = leafletMap.getCenter();
    const zoom = leafletMap.getZoom();

    const widget = widgetRef.current;
    if (!widget) {
      console.warn("widget not available");
      onCancel?.(false);
      throw new Error("Transition to 3D cancelled: widget not available");
    }

    const resolutionScale = widget.resolutionScale;
    if (!Number.isFinite(resolutionScale) || resolutionScale === null) {
      console.warn("resolution scale not available");
      onCancel?.(false);
      throw new Error(
        "Transition to 3D cancelled: resolution scale not available"
      );
    }

    transitionStateRef.current = MapTransitionState.transitionTo3d;
    startStage(transitionStageTrackerRef, "step1_prepare2dView");

    console.log(
      "[CESIUM|2D3D|TO3D] ========== STEP 1: Activating Cesium =========="
    );
    // Emit events FIRST: Cesium becomes active, TopicMap becomes suspended
    // This triggers tileset loading
    // TODO move into context triggering external stuff from the stageTracking
    emitCesiumEvent(CtxEvent.Activate, {
      source: "transition-to-3d",
      component: "MapModeToggle",
      reason: "User toggled 2D→3D",
    });
    emitTopicMapEvent(TopicMapCtxEvent.Suspend, undefined);
    console.log("[CESIUM|2D3D|TO3D] ✓ Cesium activated, TopicMap suspended");
    endStage(transitionStageTrackerRef, "step1_prepare2dView");

    console.log(
      "[CESIUM|2D3D|TO3D] ========== STEP 2: Initial Render =========="
    );
    startStage(transitionStageTrackerRef, "step2_initialRender");
    // Request initial render to start loading and wait for it
    scene.requestRender();
    try {
      await promiseWithTimeout(
        waitForAnimationFrames(1),
        initialRenderTimeoutMs,
        {
          timeoutValue: undefined,
        }
      );
      console.log("[CESIUM|2D3D|TO3D] ✓ Initial render completed");
    } catch (err) {
      console.warn("[CESIUM|2D3D|TO3D] ⚠ Initial render timeout:", err);
    }
    endStage(transitionStageTrackerRef, "step2_initialRender");

    console.log(
      "[CESIUM|2D3D|TO3D] ========== STEP 3: Wait for Tilesets =========="
    );
    startStage(transitionStageTrackerRef, "step3_waitForResources");
    // Wait for all visible tilesets to load their initial tiles BEFORE positioning camera
    console.log(
      `[CESIUM|2D3D|TO3D] Waiting for SceneResourcesReady event (timeout: ${resourcesTimeoutMs}ms)...`
    );
    const resourcesStartTime = Date.now();
    try {
      await promiseWithTimeout(
        new Promise<void>((resolve) => {
          const unsubscribe = subscribe(CtxEvent.SceneResourcesReady, () => {
            const elapsed = Date.now() - resourcesStartTime;
            console.log(
              `[CESIUM|2D3D|TO3D] ✓ SceneResourcesReady received after ${elapsed}ms`
            );
            unsubscribe();
            resolve();
          });
        }),
        resourcesTimeoutMs
      );
    } catch (err) {
      const elapsed = Date.now() - resourcesStartTime;
      console.warn(
        `[CESIUM|2D3D|TO3D] ⚠ Timeout after ${elapsed}ms, continuing anyway:`,
        err
      );
      // Continue anyway - resources might already be loaded
    }
    endStage(transitionStageTrackerRef, "step3_waitForResources");

    console.log(
      "[CESIUM|2D3D|TO3D] ========== STEP 4: Position Camera =========="
    );
    startStage(transitionStageTrackerRef, "step4_positionCamera");

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
    } catch (error) {
      console.error("[CESIUM|2D3D|TO3D] ✗ Camera positioning failed:", error);
      transitionStateRef.current = MapTransitionState.mode2d;
      onCancel?.(false);
      throw new Error(`Transition to 3D cancelled: ${error}`);
    }
    endStage(transitionStageTrackerRef, "step4_positionCamera");

    if (transitionCompleted) {
      console.log(
        "[CESIUM|2D3D|TO3D] ========== STEP 5: Finalize Transition =========="
      );
      startStage(transitionStageTrackerRef, "step5_cssFadeIn");

      // Request render after camera positioning and wait
      sceneBeforePositioning.requestRender();
      try {
        await promiseWithTimeout(waitForAnimationFrames(2), 1000, {
          timeoutValue: undefined,
        });
        console.log("[CESIUM|2D3D|TO3D] ✓ Render completed after positioning");
      } catch (err) {
        console.warn(
          "[CESIUM|2D3D|TO3D] ⚠ Render timeout after positioning:",
          err
        );
      }

      // NOW make the scene visible - fade-in happens here
      emitCesiumEvent(CtxEvent.SceneVisible, undefined);
      console.log(
        "[CESIUM|2D3D|TO3D] ✓ Scene visible event emitted - fade-in starts"
      );
      endStage(transitionStageTrackerRef, "step5_cssFadeIn");

      transitionStateRef.current = MapTransitionState.postTransitionTo3d;

      console.log(
        "[CESIUM|2D3D|TO3D] ========== STEP 6: Start Camera Animation =========="
      );
      startStage(transitionStageTrackerRef, "step6_cameraAnimation");
      // Start camera animation
      animateCesiumView();
      endStage(transitionStageTrackerRef, "step6_cameraAnimation");
      console.log(
        "[CESIUM|2D3D|TO3D] ========== Transition Complete =========="
      );
    } else {
      console.warn("[CESIUM|2D3D|TO3D] ✗ Transition not completed, cancelling");
      onCancel?.(false);
    }
  };
};
