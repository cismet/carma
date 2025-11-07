import type { Map as LeafletMap } from "leaflet";
import type {
  Scene,
  CesiumTerrainProvider,
  HeadingPitchJson,
} from "@carma/cesium";
import { isValidScene } from "@carma/cesium";
import { Radians } from "@carma/units/types";
import {
  TransitionStage,
  type TransitionToLeafletOptions,
  type TransitionToLeafletCallbacks,
} from "./types";
import { animateCesiumToTopDownLeafletLikeViewAsync } from "./utils/animate-cesium-to-top-down-leaflet-like-view";
import { promiseWithTimeout } from "@carma-commons/utils/promise";

/**
 * Pure function: Orchestrates transition from Cesium (3D) to Leaflet (LeafletLike)
 * No React or context dependencies - just Cesium Scene and Leaflet Map
 * Returns heading/pitch (not range) and duration for use in the next transition back to Cesium.
 * Range is always derived from Leaflet zoom level during 2D→3D transition.
 */
export const transitionToLeaflet = async (
  scene: Scene,
  leaflet: LeafletMap,
  cesiumContainer: HTMLElement,
  resolutionScale: number,
  terrainProviders: {
    TERRAIN?: CesiumTerrainProvider;
    SURFACE?: CesiumTerrainProvider;
  },
  callbacks: TransitionToLeafletCallbacks,
  options: TransitionToLeafletOptions = {}
): Promise<HeadingPitchJson> => {
  const {
    step1_cameraAnimationDurationMs = 1000,
    step2_cssTransitionDurationMs = 1000,
  } = options;

  const { onStageChange, onComplete, onError, onLeafletViewSet } = callbacks;

  console.debug("[CESIUM] [CESIUM|2D3D|TO2D] Starting transition to 2D mode", {
    hasLeaflet: !!leaflet,
    hasScene: isValidScene(scene),
  });

  // Capture the target heading/pitch (not range) for return
  let capturedHeadingPitch: HeadingPitchJson | null = null;

  try {
    onStageChange(TransitionStage.PREPARE_2D, "Preparing for 2D transition");

    // Wait a frame to ensure scene is fully ready after previous operations
    console.debug(
      "[CESIUM] [CESIUM|2D3D|TO2D] Waiting for next frame to ensure scene readiness"
    );
    await new Promise((resolve) => requestAnimationFrame(resolve));

    // Verify scene is still valid after waiting
    if (!isValidScene(scene)) {
      throw new Error("Scene became invalid during transition");
    }

    console.debug(
      "[CESIUM] [CESIUM|2D3D|TO2D] Scene ready, proceeding with transition"
    );

    // Start transition visuals
    onStageChange(
      TransitionStage.ANIMATE_CAMERA,
      "Animating camera to top-down view"
    );
    console.debug(
      "[CESIUM] [CSS] [CESIUM|2D3D|TO2D] Starting transition visuals"
    );

    const handleAnimationComplete = async () => {
      // Fade out Cesium container
      onStageChange(TransitionStage.FADE_IN_3D, "Fading out 3D view");
      console.debug("[CSS|2D3D|TO2D] Fading out Cesium container");

      // Set up CSS transition and trigger fade-out
      cesiumContainer.style.transition = `opacity ${step2_cssTransitionDurationMs}ms ease-in-out`;
      cesiumContainer.style.opacity = "0";
      cesiumContainer.style.pointerEvents = "none";

      // Wait for fade-out to complete before marking transition complete
      await promiseWithTimeout(
        new Promise((resolve) =>
          setTimeout(resolve, step2_cssTransitionDurationMs)
        ),
        step2_cssTransitionDurationMs + 100
      );

      onStageChange(TransitionStage.COMPLETE, "Transition to 2D complete");
      if (onComplete) {
        onComplete();
      }
    };

    capturedHeadingPitch = await animateCesiumToTopDownLeafletLikeViewAsync(
      scene,
      leaflet,
      terrainProviders.TERRAIN,
      {
        scene,
        leaflet,
        resolutionScale,
        onAnimationComplete: handleAnimationComplete,
        onTransitionCancel: () => {
          onStageChange(TransitionStage.ERROR, "Transition cancelled");
          if (onError) {
            onError(new Error("Transition cancelled"));
          }
        },
        onLeafletViewSet,
      }
    );

    // Return the captured heading/pitch (not range) and duration
    if (!capturedHeadingPitch) {
      console.warn(
        "[CESIUM] [CESIUM|2D3D|TO2D] No heading/pitch captured, using defaults"
      );
      return {
        heading: 0 as Radians,
        pitch: -(Math.PI / 2) as Radians,
      };
    }

    return capturedHeadingPitch;
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    onStageChange(TransitionStage.ERROR, `Transition failed: ${err.message}`);
    console.error("[CESIUM] [CESIUM|2D3D|TO2D] Transition error:", error);

    // Hard disable Cesium view on error - Leaflet is always our fallback
    cesiumContainer.style.transition = `opacity ${step2_cssTransitionDurationMs}ms ease-in-out`;
    cesiumContainer.style.opacity = "0";
    cesiumContainer.style.pointerEvents = "none";

    // CRITICAL: Call onError to update switcher state to Leaflet
    // Without this, the switcher thinks it's still in Cesium mode
    if (onError) {
      onError(err);
    }

    // Return default heading/pitch since we're falling back to 2D
    return {
      heading: 0 as Radians,
      pitch: -(Math.PI / 2) as Radians,
    };
  }
};
