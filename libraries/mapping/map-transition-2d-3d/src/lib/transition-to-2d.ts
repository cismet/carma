import type { MutableRefObject } from "react";
import type { Map as LeafletMap } from "leaflet";
import type {
  Cartesian3,
  Cartographic,
  HeadingPitchRange,
  Scene,
  CesiumWidget,
} from "@carma/cesium";

import { Logger } from "@carma-commons/utils";
import { radToDeg } from "@carma/units/helpers";

const logger = new Logger("Transition:2D");

// Cesium core functions will be dynamically imported to comply with lazy-loading

import {
  MapTransitionState,
  type TransitionStageTracker,
  type TransitionTo2dConfig,
} from "./TransitionContext";
import { startStage, endStage } from "./transition-stage-helpers";

const noAnimation = {
  animate: false,
  duration: 0,
};

export type TransitionTo2dParams = {
  leafletMapRef: MutableRefObject<LeafletMap | null>;
  sceneRef: MutableRefObject<Scene | null>;
  widgetRef: MutableRefObject<CesiumWidget | null>;
  transitionStateRef: MutableRefObject<MapTransitionState>;
  transitionStageTrackerRef: MutableRefObject<TransitionStageTracker>;
  setLast3dCameraOrientation: (hpr: HeadingPitchRange) => void;
  setLast3dAnimationDuration: (duration: number) => void;
  config?: TransitionTo2dConfig;
  onComplete?: (isTo2d: boolean) => void;
  onCancel?: (isTo2D: boolean) => void;
};

export const createTransitionTo2d = (params: TransitionTo2dParams) => {
  const {
    leafletMapRef,
    sceneRef,
    widgetRef,
    transitionStateRef,
    transitionStageTrackerRef,
    setLast3dCameraOrientation,
    setLast3dAnimationDuration,
    config,
    onComplete,
    onCancel,
  } = params;

  const { step2_cameraTiltAnimation = {} } = config ?? {};

  const {
    durationFactorCameraDeviationMs = 1.5,
    durationFactorZoomDiffMs = 500,
    maxDurationMs: maxDurationTo2dMs = 2000,
  } = step2_cameraTiltAnimation;

  return async () => {
    // Dynamic import of Cesium types and functions to comply with lazy-loading
    const {
      Cartesian3,
      HeadingPitchRange,
      defined,
      isValidScene,
      isValidCamera,
    } = await import("@carma/cesium");
    const {
      animateInterpolateHeadingPitchRange,
      getTopDownCameraDeviationAngle,
      pickSceneCenter,
      cesiumCenterPixelSizeToLeafletZoom,
    } = await import("@carma-mapping/engines/cesium/core");

    const leafletMap = leafletMapRef.current;
    if (!leafletMap) {
      logger.warn("leaflet not available no transition possible [zoom]");
      onCancel?.(true);
      throw new Error("Transition to 2D cancelled: leaflet not available");
    }
    const scene = sceneRef.current;
    if (!isValidScene(scene)) {
      logger.warn("cesium not available no transition possible [zoom]");
      onCancel?.(true);
      throw new Error("Transition to 2D cancelled: scene not available");
    }
    logger.info("========== Starting Transition to 2D ==========");

    startStage(
      transitionStateRef,
      transitionStageTrackerRef,
      MapTransitionState.to2d_step1_calculatePosition
    );

    logger.debug("Attempting pick at scene center for ground position");
    endStage(
      transitionStageTrackerRef,
      MapTransitionState.to2d_step1_calculatePosition
    );

    // Do not transition if we cannot pick ground from depth (ellipsoid-only is not allowed)
    const { scenePosition: groundPos, coordinates: cartographic } =
      pickSceneCenter(scene, { getCoordinates: true });

    const sceneCamera = scene.camera;
    if (!isValidCamera(sceneCamera)) {
      logger.warn("[CESIUM|2D3D|TO2D] camera not valid");
      onCancel?.(true);
      throw new Error("Transition to 2D cancelled: camera not valid");
    }

    let height = sceneCamera.positionCartographic.height;
    let distance = height;

    const hasGroundPos = defined(groundPos) && defined(cartographic);
    if (!hasGroundPos) {
      logger.error(
        "✗ No valid ground height (depth) found – cancel transition"
      );
      transitionStateRef.current = MapTransitionState.mode3d;
      onCancel?.(true);
      throw new Error(
        "Transition to 2D cancelled: no valid ground height found"
      );
    }

    logger.debug("✓ Ground position found");

    // Start transition visuals only after we know we can complete it
    const pos = groundPos as Cartesian3;
    const carto = cartographic as Cartographic;
    distance = Cartesian3.distance(pos, sceneCamera.position);
    height = carto.height + distance;

    // ========== Calculate target zoom level (once) ==========
    const currentZoom = cesiumCenterPixelSizeToLeafletZoom(scene).value;
    if (currentZoom === null) {
      logger.error(
        "[CESIUM|2D3D|TO2D] ✗ Could not determine current zoom level"
      );
      transitionStateRef.current = MapTransitionState.mode3d;
      onCancel?.(true);
      throw new Error(
        "Transition to 2D cancelled: could not determine zoom level"
      );
    }

    // Apply zoom snap if configured
    let targetZoom = currentZoom;
    const { zoomSnap } = leafletMap.options;

    logger.log(`[CESIUM|2D3D|TO2D] zoomSnap from Leaflet options: ${zoomSnap}`);

    if (zoomSnap) {
      // Move the cesium camera to the next zoom snap level of leaflet before transitioning
      // smaller values is further away
      const intMultiple = currentZoom * (1 / zoomSnap);
      targetZoom =
        intMultiple % 1 < 0.75 // prefer zooming out
          ? Math.floor(intMultiple) * zoomSnap
          : Math.ceil(intMultiple) * zoomSnap;

      logger.log(
        `[CESIUM|2D3D|TO2D] Zoom snap: ${currentZoom.toFixed(
          2
        )} → ${targetZoom}`
      );
    } else {
      logger.log("[CESIUM|2D3D|TO2D] ⚠ No zoomSnap applied");
    }

    // Calculate the correct range for the target zoom level
    // Use the same method as tiledMapToCesium to ensure consistency
    const { getPixelResolutionFromZoomAtLatitudeRad } = await import(
      "@carma/geo/utils"
    );
    const { getFrustumPixelDimensionsForDistance } = await import(
      "@carma/cesium/core"
    );

    const START_DISTANCE = 1000;
    const latRad = carto.latitude as any; // Cartographic.latitude is Radians (branded)
    const baseTargetPixelResolution = getPixelResolutionFromZoomAtLatitudeRad(
      targetZoom,
      latRad as any
    );
    const actualDPR = window.devicePixelRatio || 1;
    const LEAFLET_DPR_FACTOR = 1 / actualDPR;
    const targetPixelResolution =
      baseTargetPixelResolution * LEAFLET_DPR_FACTOR;

    const widget = widgetRef?.current;
    const resolutionScale = widget?.resolutionScale ?? 1.0;
    const baseComputedPixelResolution = getFrustumPixelDimensionsForDistance(
      scene.camera.frustum as any, // PerspectiveFrustum
      scene.drawingBufferWidth,
      scene.drawingBufferHeight,
      START_DISTANCE,
      resolutionScale
    )?.average;

    if (!baseComputedPixelResolution) {
      logger.error("[CESIUM|2D3D|TO2D] Could not compute pixel resolution");
      onCancel?.(true);
      throw new Error(
        "Transition to 2D cancelled: could not compute pixel resolution"
      );
    }

    const resolutionRatio = targetPixelResolution / baseComputedPixelResolution;
    const computedDistance = START_DISTANCE * resolutionRatio;

    // Use the computed distance as the range for the nadir view
    // Use orbit point ground height, not camera ground height
    const orbitGroundHeight = carto.height;
    distance = computedDistance;
    height = orbitGroundHeight + distance;

    logger.log(
      `[CESIUM|2D3D|TO2D] Range calculation for zoom ${targetZoom}: ${distance.toFixed(
        2
      )}m (orbit ground: ${orbitGroundHeight.toFixed(
        2
      )}m, total height: ${height.toFixed(2)}m)`
    );

    logger.log(
      "[CESIUM|2D3D|TO2D] ========== STEP 2: Calculate Camera to Nadir Animation Duration =========="
    );

    // Calculate animation duration based on camera deviation
    const cameraDeviation = getTopDownCameraDeviationAngle(sceneCamera);
    const zoomDiff = Math.abs(currentZoom - targetZoom);
    const calculatedDurationMs =
      (cameraDeviation ?? 0) * durationFactorCameraDeviationMs +
      zoomDiff * durationFactorZoomDiffMs;
    const durationMs = Math.min(calculatedDurationMs, maxDurationTo2dMs); // Cap at configured max

    logger.log(
      `[CESIUM|2D3D|TO2D] Tilt animation duration: ${durationMs.toFixed(
        0
      )}ms (deviation: ${((cameraDeviation * 180) / Math.PI).toFixed(
        1
      )}°, zoomDiff: ${zoomDiff.toFixed(2)})`
    );

    setLast3dAnimationDuration(durationMs);

    // ========== STEP 3: Set Leaflet View (BEFORE animation) ==========
    logger.log(
      "[CESIUM|2D3D|TO2D] ========== STEP 3: Position 2D Map (before tilt) =========="
    );

    // Use the orbit point (ground position) for lat/lng, not camera position
    const lat = radToDeg(carto.latitude as any); // Cartographic lat/lng are Radians (branded)
    const lng = radToDeg(carto.longitude as any);

    // Log position comparison for debugging
    const cameraLat = radToDeg(
      sceneCamera.positionCartographic.latitude as any
    );
    const cameraLng = radToDeg(
      sceneCamera.positionCartographic.longitude as any
    );
    logger.log(
      `[CESIUM|2D3D|TO2D] Position: orbit=[${lat.toFixed(6)}, ${lng.toFixed(
        6
      )}] camera=[${cameraLat.toFixed(6)}, ${cameraLng.toFixed(6)}]`
    );

    // Use the target zoom we calculated earlier (already snapped if needed)
    const zoom = targetZoom;

    if (!leafletMap) {
      logger.error("[CESIUM|2D3D|TO2D] ✗ Leaflet not available");
      onCancel?.(false);
      throw new Error("Transition to 2D cancelled: leaflet not available");
    }

    logger.debug(
      `Setting Leaflet view (orbit point): [${lat.toFixed(6)}, ${lng.toFixed(
        6
      )}] zoom=${zoom} - tiles will load during animation`
    );
    leafletMap.setView([lat, lng], zoom, noAnimation);
    logger.debug("✓ Leaflet view set - tiles loading in background");

    // ========== STEP 4: Animate Camera to Nadir ==========
    startStage(
      transitionStateRef,
      transitionStageTrackerRef,
      MapTransitionState.to2d_step2_cameraTiltAnimation
    );

    if (!hasGroundPos) {
      logger.error("✗ No ground position, cannot transition");
      onCancel?.(false);
      transitionStateRef.current = MapTransitionState.mode3d;
      return;
    }

    logger.debug(
      `Starting camera animation to nadir around orbit point (${durationMs.toFixed(
        0
      )}ms)...`
    );

    // Animate camera: pitch up to nadir while orbiting around the center ground point
    // Interpolate both pitch AND range to match the target zoom level
    await new Promise<void>((resolve) => {
      animateInterpolateHeadingPitchRange(
        scene,
        pos,
        new HeadingPitchRange(0, -Math.PI / 2, distance),
        {
          setPrevious: setLast3dCameraOrientation,
          duration: durationMs,
          onComplete: () => {
            logger.debug(
              "✓ Camera animation to nadir complete - onComplete callback fired"
            );
            endStage(
              transitionStageTrackerRef,
              MapTransitionState.to2d_step2_cameraTiltAnimation
            );
            resolve();
          },
          cancelable: false,
          useCurrentDistance: false, // Interpolate range to match zoom snap
        }
      );
    });

    // ========== STEP 6: Trigger Fade Transition ==========
    // NOW start the CSS fade-out stage AFTER pitch animation onComplete callback
    // This ensures the fade happens only after the camera animation is truly done
    logger.debug("✓ Starting fade transition - animation onComplete has fired");

    startStage(
      transitionStateRef,
      transitionStageTrackerRef,
      MapTransitionState.to2d_step3_cssFadeOut
    );

    // Wait for CSS fade to complete (get duration from config)
    const { step3_cssFadeOut = {} } = config ?? {};
    const fadeDurationMs = step3_cssFadeOut.durationMs ?? 1000;

    logger.debug(`Waiting for CSS fade (${fadeDurationMs}ms)...`);
    await new Promise<void>((resolve) => {
      setTimeout(() => resolve(), fadeDurationMs);
    });

    logger.debug("✓ CSS fade complete");
    endStage(
      transitionStageTrackerRef,
      MapTransitionState.to2d_step3_cssFadeOut
    );
    transitionStateRef.current = MapTransitionState.mode2d;
    logger.info("========== Transition to 2D Complete ===========");
    onComplete?.(true);
  };
};
