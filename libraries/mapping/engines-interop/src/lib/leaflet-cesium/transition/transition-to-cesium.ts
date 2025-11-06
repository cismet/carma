import type { Scene, CesiumTerrainProvider } from "@carma/cesium";
import type { Map as LeafletMap } from "leaflet";
import { isValidScene } from "@carma/cesium";
import {
  TransitionStage,
  type TransitionToCesiumOptions,
  type TransitionCallbacks,
} from "./types";
import { prepareLeafletForTransition } from "./utils/leaflet-preparation";
import { restoreCesiumCameraView } from "./utils/camera-restore";
import { promiseWithTimeout } from "@carma-commons/utils/promise";
import { tiledMapToCesium } from "../utils/cesium/tiled-map-to-cesium";
import { defaultTransitionOptions } from "../utils/cesium/elevation-reference";
import type { TargetHeadingPitch } from "./transition-to-leaflet";
import { Degrees } from "libraries/commons/units/types/src/lib/base/angles";

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
  targetHeadingPitch: TargetHeadingPitch | null,
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

  console.debug("[CESIUM] [CESIUM|2D3D|TO3D] Starting transition to 3D mode", {
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
    console.debug("[CESIUM] [CESIUM|2D3D|TO3D] Step 1: Preparing Leaflet map");

    await prepareLeafletForTransition(leaflet, {
      maxZoom: step1_prepare2dViewMaxZoom,
      zoomOutDuration: step1_zoomOutDurationMs,
      zoomOutEaseLinearity: step1_zoomOutEaseLinearity,
      zoomOutTimeoutBuffer:
        step2_initialRenderTimeoutMs + step3_resourceWaitTimeoutMs,
    });

    onStageChange(TransitionStage.ZOOM_OUT, "Leaflet zoom completed");

    // Stage 2: Position Cesium camera to match Leaflet view
    onStageChange(
      TransitionStage.POSITION_3D_CAMERA,
      "Positioning 3D camera"
    );
    console.debug(
      "[CESIUM] [CESIUM|2D3D|TO3D] Step 2: Positioning Cesium camera"
    );

    if (!isValidScene(scene)) {
      throw new Error("Scene became invalid during transition");
    }

    // Cancel any ongoing camera flights
    scene.camera.cancelFlight();

    // Get Leaflet center and zoom for camera positioning
    const center = leaflet.getCenter();
    const zoom = leaflet.getZoom();

    console.debug("[CESIUM] [CESIUM|2D3D|TO3D] Leaflet center/zoom:", {
      lat: center.lat,
      lng: center.lng,
      zoom,
    });

    // Position Cesium camera using terrain providers for elevation
    const { success: cameraPositioned, groundPosition } =
      await tiledMapToCesium(
        scene,
        {
          terrain: terrainProviders.TERRAIN,
          surface: terrainProviders.SURFACE,
        },
        resolutionScale,
        { latitude: center.lat, longitude: center.lng },
        zoom,
        defaultTransitionOptions
      );

    if (!cameraPositioned) {
      console.warn("[CESIUM] [CESIUM|2D3D|TO3D] Failed to position camera");
    }

    if (!groundPosition) {
      console.warn("[CESIUM] [CESIUM|2D3D|TO3D] No ground position available");
    }

    // Stage 3: Wait for initial render and resources
    onStageChange(
      TransitionStage.WAIT_RESOURCES,
      "Waiting for resources to load"
    );
    console.debug(
      "[CESIUM] [CESIUM|2D3D|TO3D] Step 3: Waiting for initial render"
    );

    const initialWaitMs = step2_initialRenderTimeoutMs;
    await promiseWithTimeout(
      new Promise((resolve) => requestAnimationFrame(resolve)),
      initialWaitMs
    );

    // Additional resource wait
    console.debug("[CESIUM] [CESIUM|2D3D|TO3D] Waiting for resources");
    await promiseWithTimeout(
      new Promise((resolve) =>
        setTimeout(resolve, step3_resourceWaitTimeoutMs)
      ),
      step3_resourceWaitTimeoutMs + 100
    );

    // Stage 4: Fade in Cesium container
    onStageChange(TransitionStage.FADE_IN_3D, "Fading in 3D view");
    console.debug(
      "[CESIUM] [CSS] [CESIUM|2D3D|TO3D] Step 4: Making Cesium container visible"
    );

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

    // Wait for CSS transition to complete before starting camera animation
    console.debug(
      "[CESIUM] [CSS] [CESIUM|2D3D|TO3D] Waiting for CSS transition:",
      step4_cssTransitionDurationMs,
      "ms"
    );

    // Wait for CSS fade-in to complete
    await promiseWithTimeout(
      new Promise((resolve) =>
        setTimeout(resolve, step4_cssTransitionDurationMs)
      ),
      step4_cssTransitionDurationMs + 100
    );

    // Stage 4.5: Additional delay to ensure CSS is fully complete
    console.debug(
      "[CESIUM] [CSS] [CESIUM|2D3D|TO3D] Post-CSS delay:",
      step5_postCssDelayMs,
      "ms"
    );
    await promiseWithTimeout(
      new Promise((resolve) => setTimeout(resolve, step5_postCssDelayMs)),
      step5_postCssDelayMs + 100
    );

    // Stage 5: Animate camera to final position (if previous HPR exists)
    onStageChange(TransitionStage.ANIMATE_CAMERA, "Animating camera");
    console.debug(
      "[CESIUM] [CESIUM|2D3D|TO3D] Step 5: Attempting camera animation"
    );

    const handleComplete = () => {
      onStageChange(TransitionStage.COMPLETE, "Transition to 3D complete");
      console.debug("[CESIUM] [CESIUM|2D3D|TO3D] Transition complete");
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
    onStageChange(
      TransitionStage.ERROR,
      `Transition failed: ${err.message}`
    );
    console.error("[CESIUM] [CESIUM|2D3D|TO3D] Transition error:", error);

    if (onError) {
      onError(err);
    }

    throw error;
  }
};
