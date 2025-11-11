import type { Map as LeafletMap } from "leaflet";
import type {
  Scene,
  CesiumTerrainProvider,
  HeadingPitchJson,
} from "@carma/cesium";
import {
  HeadingPitchRange,
  ensureSceneReady,
  cameraToHeadingPitchJson,
} from "@carma/cesium";
import {
  TransitionStage,
  type TransitionToLeafletOptions,
  type TransitionToLeafletCallbacks,
} from "./types";
import { animateInterpolateHeadingPitchRange } from "@carma-mapping/engines/cesium/legacy";
import { getGroundPosition } from "./utils/cesium/get-ground-position";
import { calculateAnimationDuration } from "./utils/cesium/calculate-animation-duration";
import { fadeOutContainer } from "./utils/dom-utils";
import { calculateZoomFromDistance } from "./zoom-distance-converter";
import { applyZoomSnapToView } from "./utils/cesium/adjust-for-zoom-snap";
import { handleToLeafletTransitionError } from "./utils/cesium/handle-to-leaflet-transition-error";
import { radToDegNumeric } from "@carma/units/helpers";
import type { Degrees, Meters } from "@carma/units/types";

/**
 * Pure function: Orchestrates transition from Cesium (3D) to Leaflet (2D)
 * No React or context dependencies - just Cesium Scene and Leaflet Map
 * Returns heading/pitch for use in the next transition back to Cesium.
 * Returns undefined if transition fails.
 */
export const transitionToLeaflet = async (
  scene: Scene,
  leaflet: LeafletMap,
  cesiumContainer: HTMLElement,
  terrainProviders: {
    TERRAIN?: CesiumTerrainProvider;
    SURFACE?: CesiumTerrainProvider;
  },
  callbacks: TransitionToLeafletCallbacks,
  options: TransitionToLeafletOptions = {}
): Promise<HeadingPitchJson | undefined> => {
  const { step2_cssTransitionDurationMs = 1000 } = options;
  const { onStageChange, onComplete, onError, onLeafletViewSet } = callbacks;

  console.debug("[CESIUM|TO_LEAFLET] Starting transition");

  try {
    // onStageChange(TransitionStage.PREPARE_2D, "Preparing for 2D transition");
    // Wait for 2 frames to ensure WebGL state is stable for picking operations
    // pickTranslucentDepth can cause "destroyed object" errors during tile processing
    await ensureSceneReady(scene, 2);

    const { camera } = scene;
    const lastHeadingPitch = cameraToHeadingPitchJson(camera);

    // onStageChange(TransitionStage.ANIMATE_CAMERA, "Animating camera to top-down view");

    const groundResult = await getGroundPosition(
      scene,
      terrainProviders.TERRAIN
    );
    if (!groundResult) {
      throw new Error("No valid ground position found");
    }

    const { groundPos, cartographic, distance: initialDistance } = groundResult;

    const container = scene.canvas.parentElement;
    if (!container) {
      throw new Error("Canvas has no parent container");
    }
    const cssWidth = container.clientWidth;
    const cssHeight = container.clientHeight;

    // Calculate Leaflet zoom from Cesium camera distance
    const lat = radToDegNumeric(cartographic.latitude);
    const lng = radToDegNumeric(cartographic.longitude);

    const zoom = calculateZoomFromDistance(
      scene,
      cssWidth,
      cssHeight,
      lat as Degrees,
      initialDistance as Meters
    );

    if (zoom === null) {
      throw new Error("Failed to calculate zoom from distance");
    }

    const initialView = {
      center: { lat, lng },
      zoom,
    };

    const {
      view: finalView,
      distance: finalDistance,
      zoomDiff,
    } = applyZoomSnapToView(
      initialView,
      initialDistance,
      leaflet.options.zoomSnap,
      options.zoomSnapThreshold
    );

    // Set Leaflet view with snap-adjusted zoom to allow correct tile preloading
    leaflet.setView(finalView.center, finalView.zoom, { animate: false });
    onLeafletViewSet?.(finalView);

    const duration = calculateAnimationDuration(camera, zoomDiff);

    const handleAnimationComplete = async () => {
      onStageChange(TransitionStage.FADE_IN_3D, "Fading out 3D view");
      await fadeOutContainer(
        cesiumContainer,
        step2_cssTransitionDurationMs,
        "[CESIUM|TO_LEAFLET] Fading out Cesium container"
      );
      //onStageChange(TransitionStage.COMPLETE, "Transition to 2D complete");
      onComplete?.();
    };

    const topDownNorthUpHeadingPitch = new HeadingPitchRange(
      0,
      -Math.PI / 2,
      finalDistance
    );

    animateInterpolateHeadingPitchRange(
      scene,
      groundPos,
      topDownNorthUpHeadingPitch,
      {
        duration,
        onComplete: handleAnimationComplete,
        cancelable: false,
        useCurrentDistance: false,
      }
    );

    return lastHeadingPitch;
  } catch (error: unknown) {
    handleToLeafletTransitionError(
      error,
      cesiumContainer,
      step2_cssTransitionDurationMs,
      { onStageChange, onError }
    );
    return undefined;
  }
};
