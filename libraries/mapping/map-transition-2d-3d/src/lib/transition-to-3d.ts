import type { MutableRefObject } from "react";
import type { Map as LeafletMap } from "leaflet";
import type { Scene, CesiumWidget } from "cesium";
import {
  Cartesian3,
  HeadingPitchRange,
  isValidScene,
  tryWithValidCamera,
} from "@carma/cesium";

import { promiseWithTimeout } from "@carma-commons/utils";
import { isZoom } from "@carma-commons/units/helpers";
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

import { MapTransitionState } from "./TransitionContext";
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
  last3dCameraOrientation: HeadingPitchRange | null;
  last3dAnimationDuration: number;
  config: Required<TransitionTo3dConfig>;
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
    last3dCameraOrientation,
    last3dAnimationDuration,
    config,
    emitCesiumEvent,
    emitTopicMapEvent,
    subscribe,
    onComplete,
    onCancel,
  } = params;

  const { step1_prepare2dView, step2_cameraAnimation } = config;
  const {
    maxZoom,
    zoomOutDuration,
    zoomOutEaseLinearity,
    zoomOutTimeoutBuffer,
  } = step1_prepare2dView;
  const duration = step2_cameraAnimation.duration;

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
        const durationMs = Math.max(0, zoomOutDuration);
        const durationSeconds = durationMs / 1000;
        leaflet.flyTo(leaflet.getCenter(), maxZoom, {
          duration: durationSeconds,
          animate: durationSeconds > 0,
          easeLinearity: zoomOutEaseLinearity,
        });
      }

      if (moveEndPromise) {
        const timeoutMs =
          Math.max(0, zoomOutDuration) + Math.max(0, zoomOutTimeoutBuffer);
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

    await prepareLeafletForTransition(leafletMap);

    // cancel any ongoing flight
    tryWithValidCamera(
      scene.camera,
      (camera) => {
        camera.cancelFlight();
      },
      "transitionToMode3d"
    );

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
            delay: 500, // Wait for CSS fade-in to complete
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
          delay: 500, // Wait for CSS fade-in to complete
          duration: duration, // Use config duration (1000ms default)
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
      onCancel(false);
      throw new Error("Transition to 3D cancelled: widget not available");
    }

    const resolutionScale = widget.resolutionScale;
    if (!Number.isFinite(resolutionScale) || resolutionScale === null) {
      console.warn("resolution scale not available");
      onCancel(false);
      throw new Error(
        "Transition to 3D cancelled: resolution scale not available"
      );
    }

    transitionStateRef.current = MapTransitionState.transitionTo3d;

    console.log(
      "[CESIUM|2D3D|TO3D] ========== STEP 1: Activating Cesium =========="
    );
    // Emit events FIRST: Cesium becomes active, TopicMap becomes suspended
    // This triggers tileset loading
    emitCesiumEvent(CtxEvent.Activate, undefined);
    emitTopicMapEvent(TopicMapCtxEvent.Suspend);
    console.log("[CESIUM|2D3D|TO3D] ✓ Cesium activated, TopicMap suspended");

    console.log(
      "[CESIUM|2D3D|TO3D] ========== STEP 2: Initial Render =========="
    );
    // Request initial render to start loading and wait for it
    scene.requestRender();
    try {
      await promiseWithTimeout(waitForAnimationFrames(1), 500, {
        timeoutValue: undefined,
      });
      console.log("[CESIUM|2D3D|TO3D] ✓ Initial render completed");
    } catch (err) {
      console.warn("[CESIUM|2D3D|TO3D] ⚠ Initial render timeout:", err);
    }

    console.log(
      "[CESIUM|2D3D|TO3D] ========== STEP 3: Wait for Tilesets =========="
    );
    // Wait for all visible tilesets to load their initial tiles BEFORE positioning camera
    console.log(
      "[CESIUM|2D3D|TO3D] Waiting for SceneResourcesReady event (timeout: 10s)..."
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
        10000, // 10 second timeout for resource loading
        "Scene resources ready timeout"
      );
    } catch (err) {
      const elapsed = Date.now() - resourcesStartTime;
      console.warn(
        `[CESIUM|2D3D|TO3D] ⚠ Timeout after ${elapsed}ms, continuing anyway:`,
        err
      );
      // Continue anyway - resources might already be loaded
    }

    console.log(
      "[CESIUM|2D3D|TO3D] ========== STEP 4: Position Camera =========="
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

    try {
      await tiledMapToCesium(
        sceneBeforePositioning,
        { latitude, longitude },
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

    if (transitionCompleted) {
      console.log(
        "[CESIUM|2D3D|TO3D] ========== STEP 5: Finalize Transition =========="
      );

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

      transitionStateRef.current = MapTransitionState.postTransitionTo3d;

      console.log(
        "[CESIUM|2D3D|TO3D] ========== STEP 6: Start Camera Animation =========="
      );
      // Start camera animation
      animateCesiumView();
      console.log(
        "[CESIUM|2D3D|TO3D] ========== Transition Complete =========="
      );
    } else {
      console.warn("[CESIUM|2D3D|TO3D] ✗ Transition not completed, cancelling");
      onCancel(false);
      return;
    }
  };
};
