import type {
  HeadingPitchRange,
  Scene,
  CesiumTerrainProvider,
} from "@carma/cesium";
import { isValidScene } from "@carma/cesium";
import type { Map as LeafletMap } from "leaflet";
import { TransitionStage, type TransitionToLeafletOptions } from "./types";
import { animateCesiumToTopDownLeafletLikeView as animateCameraTo2d } from "./utils/animate-cesium-to-top-down-leaflet-like-view";
import { promiseWithTimeout } from "@carma-commons/utils/promise";

/**
 * Captured camera orientation for restoration after 2D→3D transition.
 * Only heading and pitch are stored - range always comes from Leaflet zoom level.
 */
export type TargetHeadingPitch = {
  heading: number;
  pitch: number;
};

export type TransitionToLeafletResult = {
  targetHeadingPitch: TargetHeadingPitch;
  duration: number;
};

/**
 * Pure function: Orchestrates transition from Cesium (3D) to Leaflet (2D)
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
  onTransitionStage: (stage: TransitionStage, message: string) => void,
  onTransitionComplete: (() => void) | undefined,
  onTransitionError: ((error: Error) => void) | undefined,
  options: TransitionToLeafletOptions = {}
): Promise<TransitionToLeafletResult> => {
  const {
    step1_cameraAnimationDurationMs = 1000,
    step2_cssTransitionDurationMs = 1000,
  } = options;

  console.debug("[CESIUM] [CESIUM|2D3D|TO2D] Starting transition to 2D mode", {
    hasLeaflet: !!leaflet,
    hasScene: isValidScene(scene),
  });

  // Capture the target heading/pitch (not range) for return
  let capturedHeadingPitch: TargetHeadingPitch | null = null;

  try {
    onTransitionStage(
      TransitionStage.PREPARE_2D,
      "Preparing for 2D transition"
    );

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
    onTransitionStage(
      TransitionStage.ANIMATE_CAMERA,
      "Animating camera to top-down view"
    );
    console.debug(
      "[CESIUM] [CSS] [CESIUM|2D3D|TO2D] Starting transition visuals"
    );

    const handleAnimationComplete = async () => {
      // Fade out Cesium container
      onTransitionStage(TransitionStage.FADE_IN_3D, "Fading out 3D view");
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

      onTransitionStage(TransitionStage.COMPLETE, "Transition to 2D complete");
      if (onTransitionComplete) {
        onTransitionComplete();
      }
    };

    const handleTargetHeadingPitch = (hpr: HeadingPitchRange) => {
      // Extract only heading and pitch, ignore range (always comes from zoom)
      capturedHeadingPitch = {
        heading: hpr.heading,
        pitch: hpr.pitch,
      };
    };

    animateCameraTo2d(scene, leaflet, {
      scene,
      leaflet,
      onAnimationComplete: handleAnimationComplete,
      setPrevHPR: handleTargetHeadingPitch,
      setPrevDuration: () => {}, // Duration is returned directly
      onTransitionCancel: () => {
        onTransitionStage(TransitionStage.ERROR, "Transition cancelled");
        if (onTransitionError) {
          onTransitionError(new Error("Transition cancelled"));
        }
      },
    });

    // Return the captured heading/pitch (not range) and duration
    if (!capturedHeadingPitch) {
      throw new Error(
        "Failed to capture target heading/pitch during transition"
      );
    }

    return {
      targetHeadingPitch: capturedHeadingPitch,
      duration: step1_cameraAnimationDurationMs,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    onTransitionStage(
      TransitionStage.ERROR,
      `Transition failed: ${err.message}`
    );
    console.error("[CESIUM] [CESIUM|2D3D|TO2D] Transition error:", error);

    if (onTransitionError) {
      onTransitionError(err);
    }

    throw error;
  }
};
