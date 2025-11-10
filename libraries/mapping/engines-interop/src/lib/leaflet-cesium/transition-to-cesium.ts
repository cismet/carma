import type {
  Scene,
  CesiumTerrainProvider,
  HeadingPitchJson,
} from "@carma/cesium";
import { isValidScene } from "@carma/cesium";
import {
  TransitionStage,
  type TransitionToCesiumOptions,
  type TransitionCallbacks,
} from "./types";
import { prepareLeafletForTransition } from "./utils/leaflet/leaflet-preparation";
import { restoreCesiumCameraView } from "./utils/cesium/camera-restore";
import { promiseWithTimeout } from "@carma-commons/utils/promise";
import { tiledMapToCesium } from "./utils/tiled-map-to-cesium";
import { defaultTransitionOptions } from "./utils/cesium/elevation-reference";
import { Degrees } from "@carma/units/types";
import { type LeafletMap, getLeafletView } from "@carma/leaflet";

/**
 * Pure function: Orchestrates transition from Leaflet (LeafletLike) to Cesium (3D)
 * No React or context dependencies - just Cesium Scene and Leaflet Map
 *
 * targetHeadingPitch contains only heading/pitch from previous 3D view.
 * Range (distance) is always calculated from current Leaflet zoom level.
 */
export const transitionToCesium = async (
  scene: Scene,
  leaflet: LeafletMap,
  cesiumContainer: HTMLElement,
  resolutionScale: number,
  terrainProviders: {
    TERRAIN?: CesiumTerrainProvider;
    SURFACE?: CesiumTerrainProvider;
  },
  targetHeadingPitch: HeadingPitchJson | null,
  callbacks: TransitionCallbacks,
  options: TransitionToCesiumOptions = {}
): Promise<void> => {
  // Extract options with defaults
  const {
    step1_prepare2dViewMaxZoom = 20,
    step1_zoomOutDurationMs = 1000,
    step1_zoomOutEaseLinearity = 0.5,
    step2_initialRenderTimeoutMs = 100,
    step3_resourceWaitTimeoutMs = 500,
    step4_cssTransitionDurationMs = 1000,
    step5_postCssDelayMs = 200,
    step6_cameraAnimationDurationMs = 1500,
    defaultHeading = 0 as Degrees,
    defaultPitch = -45 as Degrees,
  } = options;

  const { onStageChange, onComplete, onError } = callbacks;

  console.debug("[LEAFLET|TO_CESIUM] Starting transition", {
    hasLeaflet: !!leaflet,
    hasScene: isValidScene(scene),
    targetHeadingPitch,
  });

  try {
    // Stage 1: Prepare 2D view - zoom out if needed
    onStageChange(
      TransitionStage.PREPARE_2D,
      "Preparing 2D view for transition"
    );

    await prepareLeafletForTransition(leaflet, {
      maxZoom: step1_prepare2dViewMaxZoom,
      zoomOutDuration: step1_zoomOutDurationMs,
      zoomOutEaseLinearity: step1_zoomOutEaseLinearity,
      zoomOutTimeoutBuffer:
        step2_initialRenderTimeoutMs + step3_resourceWaitTimeoutMs,
    });

    onStageChange(TransitionStage.ZOOM_OUT, "Leaflet zoom completed");

    // Stage 2: Position Cesium camera to match Leaflet view
    onStageChange(TransitionStage.POSITION_3D_CAMERA, "Positioning 3D camera");

    if (!isValidScene(scene)) {
      throw new Error("Scene became invalid during transition");
    }

    // Cancel any ongoing camera flights
    scene.camera.cancelFlight();

    // Get Leaflet view for camera positioning
    const leafletView = getLeafletView(leaflet);

    console.debug("[LEAFLET|TO_CESIUM] Leaflet view:", leafletView);

    // Position Cesium camera using terrain providers for elevation
    const { success: cameraPositioned, groundPosition } =
      await tiledMapToCesium(
        scene,
        {
          terrain: terrainProviders.TERRAIN,
          surface: terrainProviders.SURFACE,
        },
        resolutionScale,
        leafletView,
        defaultTransitionOptions
      );

    if (!cameraPositioned) {
      console.warn("[LEAFLET|TO_CESIUM] Failed to position camera");
    }

    if (!groundPosition) {
      console.warn("[LEAFLET|TO_CESIUM] No ground position available");
    }

    // Stage 3: Wait for initial render and resources
    onStageChange(
      TransitionStage.WAIT_RESOURCES,
      "Waiting for resources to load"
    );

    const initialWaitMs = step2_initialRenderTimeoutMs;
    await promiseWithTimeout(
      new Promise((resolve) => requestAnimationFrame(resolve)),
      initialWaitMs
    );

    // Additional resource wait
    await promiseWithTimeout(
      new Promise((resolve) =>
        setTimeout(resolve, step3_resourceWaitTimeoutMs)
      ),
      step3_resourceWaitTimeoutMs + 100
    );

    // Stage 4: Fade in Cesium container
    onStageChange(TransitionStage.FADE_IN_3D, "Fading in 3D view");

    // Set up CSS transition property (if not already set)
    cesiumContainer.style.transition = `opacity ${step4_cssTransitionDurationMs}ms ease-in-out`;

    // Force initial opacity to 0 and pointer-events to none
    cesiumContainer.style.opacity = "0";
    cesiumContainer.style.pointerEvents = "none";

    // Force a reflow to ensure the initial state is applied
    void cesiumContainer.offsetHeight;

    // Now trigger the transition to opacity 1
    cesiumContainer.style.opacity = "1";
    cesiumContainer.style.pointerEvents = "auto";

    // Wait for CSS fade-in to complete
    await promiseWithTimeout(
      new Promise((resolve) =>
        setTimeout(resolve, step4_cssTransitionDurationMs)
      ),
      step4_cssTransitionDurationMs + 100
    );

    // Stage 4.5: Additional delay to ensure CSS is fully complete
    await promiseWithTimeout(
      new Promise((resolve) => setTimeout(resolve, step5_postCssDelayMs)),
      step5_postCssDelayMs + 100
    );

    // Stage 5: Animate camera to final position (if previous HPR exists)
    onStageChange(TransitionStage.ANIMATE_CAMERA, "Animating camera");

    const handleComplete = () => {
      onStageChange(TransitionStage.COMPLETE, "Transition to 3D complete");
      console.debug("[LEAFLET|TO_CESIUM] Complete");
      if (onComplete) {
        onComplete();
      }
    };

    // Try to restore camera heading/pitch (range comes from zoom-based position)
    // Use ground position from terrain sampling instead of picking from buffer
    const animationStarted = restoreCesiumCameraView(
      scene,
      groundPosition,
      targetHeadingPitch,
      step6_cameraAnimationDurationMs,
      handleComplete,
      defaultPitch,
      defaultHeading
    );

    if (!animationStarted) {
      // No animation, complete immediately
      handleComplete();
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    onStageChange(TransitionStage.ERROR, `Transition failed: ${err.message}`);
    console.error("[LEAFLET|TO_CESIUM] Error:", error);

    if (onError) {
      onError(err);
    }

    throw error;
  }
};
