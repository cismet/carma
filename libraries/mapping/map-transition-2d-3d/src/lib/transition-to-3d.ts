import type { MutableRefObject } from "react";
import type { Map as LeafletMap } from "leaflet";
import type { Scene, CesiumWidget, HeadingPitchRange } from "@carma/cesium";

import { promiseWithTimeout } from "@carma-commons/utils";
import { isZoom } from "@carma-commons/units/helpers";
import type { Longitude, Latitude } from "@carma/geo/types";
import { waitForAnimationFrames } from "@carma-commons/dom/window";
import {
  LeafletMapEventNames,
  getLeafletPosition,
} from "@carma-mapping/engines/leaflet";

import type { CesiumPoseWithFallback } from "@carma/cesium/core";

import {
  type TransitionTo3dConfig,
} from "./TransitionContext";
import { tiledMapToCesium } from "./tiled-map-to-cesium";

export type TransitionTo3dParams = {
  leafletMapRef: MutableRefObject<LeafletMap | null>;
  sceneRef: MutableRefObject<Scene | null>;
  widgetRef: MutableRefObject<CesiumWidget | null>;
  last3dCameraOrientation: HeadingPitchRange | null;
  last3dAnimationDuration: number;
  config?: TransitionTo3dConfig;
  
  // Callbacks for side effects (engine switching, CSS fades, etc)
  onTransitionStart?: () => void; // Called at start - emit Cesium.Activate + TopicMap.Suspend
  onSceneReady?: () => void; // Called when scene is ready for positioning
  onCameraPositioned?: () => void; // Called after camera positioned - trigger CSS fade-in
  onComplete?: (isTo2d: boolean) => void; // Called at end
  onCancel?: (isTo2D: boolean, stage: string) => void; // Called on cancel with stage info for debugging
};

export const createTransitionTo3d =
  (params: TransitionTo3dParams) =>
  async (poseWithFallback: CesiumPoseWithFallback) => {
    // Scene guaranteed to exist - dynamically import cesium functions
    const {
      HeadingPitchRange,
      animateInterpolateHeadingPitchRange,
      pickSceneCenter,
      isWebGLErrorRequiringReinit,
      isValidScene,
    } = await import("@carma/cesium/core");

    const {
      leafletMapRef,
      sceneRef,
      widgetRef,
      last3dCameraOrientation,
      last3dAnimationDuration,
      config,
      onTransitionStart,
      onSceneReady,
      onCameraPositioned,
      onComplete,
      onCancel,
    } = params;

    const {
      step1_prepare2dViewMaxZoom = 20,
      step1_zoomOutDurationMs = 700,
      step2_initialRenderTimeoutMs = 500,
      step3_resourceWaitTimeoutMs = 3500,
      step4_fallbackGroundElevationM = 10000,
      step5_cssFadeInDurationMs = 1000,
      step6_cameraAnimationDurationMs = 2000,
    } = config ?? {};

    const prepareLeafletForTransition = async (
      leaflet: LeafletMap | null | undefined
    ) => {
      if (!leaflet) {
        return;
      }

      const cleanups: Array<() => void> = [];

      const zoom = leaflet.getZoom();
      const shouldZoomOut = isZoom(zoom) && zoom > step1_prepare2dViewMaxZoom;

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
        if (shouldZoomOut && Number.isFinite(step1_prepare2dViewMaxZoom)) {
          const durationSeconds = Math.max(0, step1_zoomOutDurationMs) / 1000;
          leaflet.flyTo(leaflet.getCenter(), step1_prepare2dViewMaxZoom, {
            duration: durationSeconds,
            animate: durationSeconds > 0,
            easeLinearity: 0.25, // Default ease linearity
          });
        }

        if (moveEndPromise) {
          const timeoutMs =
            Math.max(0, step1_zoomOutDurationMs) +
            200; // 200ms buffer timeout
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

    await prepareLeafletForTransition(leafletMap);

    try {
      scene?.camera?.cancelFlight?.();
    } catch (error) {
      console.error("[CESIUM|2D3D|TO3D] Error cancelling flight", error);
    }

    const onComplete3d = () => {
      console.debug("[CESIUM|2D3D|TO3D] onComplete3d - setting mode to mode3d");
      onComplete?.(false);
    };

    const onCancelAnimation3d = () => {
      console.debug(
        "[CESIUM|2D3D|TO3D] animation cancelled by user - setting mode to mode3d"
      );
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
            delay: step5_cssFadeInDurationMs, // Wait for CSS fade-in to complete
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
          delay: step5_cssFadeInDurationMs, // Wait for CSS fade-in to complete
          duration: step6_cameraAnimationDurationMs, // Use config duration (2000ms default)
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

    console.log(
      "[CESIUM|2D3D|TO3D] ========== STEP 1: Starting Transition =========="
    );
    console.log("[CESIUM|2D3D|TO3D] ✓ Transition state set");

    console.log(
      "[CESIUM|2D3D|TO3D] ========== STEP 2: Initial Render =========="
    );
    // Request initial render and wait 2 frames for scene to stabilize
    scene.requestRender();
    await waitForAnimationFrames(2);
    console.log("[CESIUM|2D3D|TO3D] ✓ Initial render completed (2 frames)");

    console.log(
      "[CESIUM|2D3D|TO3D] ========== STEP 3: Position Camera =========="
    );
    // Tiles will continue loading during camera animation (no need to wait)

    // Re-validate scene before positioning (might have been destroyed)
    const sceneBeforePositioning = sceneRef.current;
    if (!isValidScene(sceneBeforePositioning)) {
      console.error(
        "[CESIUM|2D3D|TO3D] ✗ Scene was destroyed during transition"
      );
      onCancel?.(false, "scene-destroyed");
      throw new Error(
        "Transition to 3D cancelled: scene destroyed during transition"
      );
    }

    // NOW position the camera with tilesets loaded
    const cameraStartTime = Date.now();

    // Extract values from Leaflet map and Cesium widget using existing helper
    const currentLeafletMap = leafletMapRef.current;
    const widget = widgetRef.current;

    if (!currentLeafletMap || !widget) {
      console.error("[CESIUM|2D3D|TO3D] Missing Leaflet map or Cesium widget");
      onCancel?.(false, "missing-map-or-widget");
      throw new Error("Transition to 3D cancelled: missing map or widget");
    }

    const {
      lat: latitude,
      lng: longitude,
      zoom,
    } = getLeafletPosition(currentLeafletMap);
    const resolutionScale = widget.resolutionScale;

    try {
      // Wait for camera positioning to complete
      await new Promise<void>((resolve, reject) => {
        tiledMapToCesium(
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
              resolve();
            },
            onError: (error) => {
              console.error("[CESIUM|2D3D|TO3D] ✗ Camera positioning failed:", error);
              reject(error);
            }
          }
        );
      });
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
          "[CESIUM|2D3D|TO3D] ⚠ WebGL error detected during transition"
        );
        // Note: Scene reinit should be handled by context error recovery
      }

      onCancel?.(false, "camera-positioning-failed");
      throw new Error(`Transition to 3D cancelled: ${error}`);
    }

    // Camera positioning completed successfully, continue with fade-in
    console.log(
      "[CESIUM|2D3D|TO3D] ========== STEP 4: Finalize Transition =========="
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

    // Notify that camera is positioned - this triggers CSS fade-in
    console.log(
      "[CESIUM|2D3D|TO3D] ✓ Camera positioned - triggering fade-in via callback"
    );
    onCameraPositioned?.();

    console.log(
      "[CESIUM|2D3D|TO3D] ========== STEP 5: Start Camera Animation =========="
    );
    // Start camera animation
    animateCesiumView();
    console.log(
      "[CESIUM|2D3D|TO3D] ========== Transition Complete =========="
    );
  };
