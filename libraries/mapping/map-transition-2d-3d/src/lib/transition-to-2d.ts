import type { MutableRefObject } from "react";
import type { Map as LeafletMap } from "leaflet";
import {
  Cartesian3,
  Cartographic,
  HeadingPitchRange,
  defined,
  isValidScene,
  isValidCamera,
  type Scene,
} from "@carma/cesium";

import { normalizeOptions, Logger } from "@carma-commons/utils";

const logger = new Logger("Transition:2D");

import type { TopicMapCtxEvent } from "@carma-mapping/engines/carma-cismap";
import type { EmitFn as EmitCesiumFn } from "@carma-mapping/engines/cesium/core";
import {
  animateInterpolateHeadingPitchRange,
  getCameraHeightAboveGround,
  getTopDownCameraDeviationAngle,
  pickSceneCenter,
  cesiumCenterPixelSizeToLeafletZoom,
} from "@carma-mapping/engines/cesium/core";

import {
  MapTransitionState,
  type TransitionStageTracker,
  type TransitionTo2dConfig,
} from "./TransitionContext";
import { startStage, endStage } from "./transition-stage-helpers";
import { getTiledMapCenterZoomEquivalent } from "./get-tiled-map-center-zoom-equivalent";

const MapState = {
  uninitialized: "uninitialized",
  ...MapTransitionState,
};

const noAnimation = {
  animate: false,
  duration: 0,
};

export type TransitionTo2dParams = {
  leafletMapRef: MutableRefObject<LeafletMap | null>;
  sceneRef: MutableRefObject<Scene | null>;
  transitionStateRef: MutableRefObject<string>;
  transitionStageTrackerRef: MutableRefObject<TransitionStageTracker>;
  setLast3dCameraOrientation: (hpr: HeadingPitchRange) => void;
  setLast3dAnimationDuration: (duration: number) => void;
  config?: TransitionTo2dConfig;
  emitCesiumEvent: EmitCesiumFn;
  emitTopicMapEvent: (event: TopicMapCtxEvent, data: any) => void;
  onComplete?: (isTo2d: boolean) => void;
  onCancel?: (isTo2D: boolean) => void;
};

export const createTransitionTo2d = (params: TransitionTo2dParams) => {
  const {
    leafletMapRef,
    sceneRef,
    transitionStateRef,
    transitionStageTrackerRef,
    setLast3dCameraOrientation,
    setLast3dAnimationDuration,
    config,
    emitCesiumEvent,
    emitTopicMapEvent,
    onComplete,
    onCancel,
  } = params;

  const { step2_cameraTiltAnimation = {}, step3_cssFadeOut = {} } =
    config ?? {};

  const {
    durationFactorCameraDeviationMs = 1.5,
    durationFactorZoomDiffMs = 500,
    maxDurationMs: maxDurationTo2dMs = 2000,
  } = step2_cameraTiltAnimation;

  const { durationMs: cssFadeOutDurationMs = 1000 } = step3_cssFadeOut;

  return async (
    CtxEvent: typeof import("@carma-mapping/engines/cesium/core").CtxEvent,
    TopicMapCtxEvent: typeof import("@carma-mapping/engines/carma-cismap").TopicMapCtxEvent
  ) => {
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

    transitionStateRef.current = MapTransitionState.preTransitionTo2d;
    startStage(transitionStageTrackerRef, "step1_calculatePosition");

    logger.debug("Attempting pick at scene center for ground position");
    endStage(transitionStageTrackerRef, "step1_calculatePosition");

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
      transitionStateRef.current = MapState.mode3d;
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

    // evaluate angles for animation duration
    let zoomDiff = 0;

    const { zoomSnap } = leafletMap.options;
    if (zoomSnap) {
      // Move the cesium camera to the next zoom snap level of leaflet before transitioning
      const currentZoom = cesiumCenterPixelSizeToLeafletZoom(scene).value;

      if (currentZoom === null) {
        logger.error(
          "[CESIUM|2D3D|TO2D] ✗ Could not determine current zoom level"
        );
        transitionStateRef.current = MapState.mode3d;
        onCancel?.(true);
        throw new Error(
          "Transition to 2D cancelled: could not determine zoom level"
        );
      } else {
        // go to the next integer zoom snap level
        // smaller values is further away
        const intMultiple = currentZoom * (1 / zoomSnap);
        const targetZoom =
          intMultiple % 1 < 0.75 // prefer zooming out
            ? Math.floor(intMultiple) * zoomSnap
            : Math.ceil(intMultiple) * zoomSnap;
        zoomDiff = currentZoom - targetZoom;
        const heightFactor = Math.pow(2, zoomDiff);
        const { groundHeight } = getCameraHeightAboveGround(scene);

        distance = distance * heightFactor;
        height = groundHeight + distance;

        logger.log(
          `[CESIUM|2D3D|TO2D] Zoom calculation: ${currentZoom.toFixed(
            2
          )} → ${targetZoom} (diff: ${zoomDiff.toFixed(2)})`
        );
      }
    } else {
      logger.log("[CESIUM|2D3D|TO2D] ⚠ No zoomSnap applied");
    }

    logger.log(
      "[CESIUM|2D3D|TO2D] ========== STEP 2: Tilt Camera to Nadir =========="
    );

    // Calculate animation duration based on camera deviation and zoom change
    const cameraDeviation = getTopDownCameraDeviationAngle(sceneCamera);
    const calculatedDurationMs =
      (cameraDeviation ?? 0) * durationFactorCameraDeviationMs +
      (zoomDiff ?? 0) * durationFactorZoomDiffMs;
    const durationMs = Math.min(calculatedDurationMs, maxDurationTo2dMs); // Cap at configured max

    logger.log(
      `[CESIUM|2D3D|TO2D] Tilt animation duration: ${durationMs.toFixed(
        0
      )}ms (deviation: ${((cameraDeviation * 180) / Math.PI).toFixed(
        1
      )}°, zoomDiff: ${zoomDiff.toFixed(2)})`
    );

    setLast3dAnimationDuration(durationMs);

    const onComplete2d = async () => {
      logger.log(
        "[CESIUM|2D3D|TO2D] ========== STEP 3: Switch to 2D Map =========="
      );

      try {
        const { lat, lng, zoom } = await getTiledMapCenterZoomEquivalent(scene);
        if (!leafletMap) {
          logger.error("[CESIUM|2D3D|TO2D] ✗ Leaflet not available");
          onCancel?.(false);
          throw new Error(
            "Transition to 2D cancelled: leaflet not available in onComplete"
          );
        }
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          logger.error("✗ Invalid coordinates");
          onCancel?.(false);
          throw new Error("Transition to 2D cancelled: invalid coordinates");
        }
        if (!Number.isFinite(zoom)) {
          logger.error("✗ Invalid zoom");
          onCancel?.(false);
          throw new Error("Transition to 2D cancelled: invalid zoom");
        }

        logger.debug(
          `Setting Leaflet view: [${lat.toFixed(6)}, ${lng.toFixed(
            6
          )}] zoom=${zoom}`
        );
        leafletMap.setView([lat, lng], zoom, noAnimation);
        logger.debug("✓ Leaflet view set");
      } catch (error) {
        logger.error("✗ Failed to determine center/zoom", error);
        onCancel?.(false);
        throw new Error(`Transition to 2D cancelled: ${error}`);
      }

      // trigger the visual transition
      // Emit events: TopicMap becomes active, Cesium becomes suspended
      logger.debug("Activating TopicMap, suspending Cesium");
      emitTopicMapEvent(TopicMapCtxEvent.Activate, undefined);
      emitCesiumEvent(CtxEvent.Suspend, undefined);
      logger.debug("✓ TopicMap activated, Cesium suspended");

      transitionStateRef.current = MapState.mode2d;
      logger.info("========== Transition to 2D Complete ===========");
      onComplete?.(true);
    };

    transitionStateRef.current = MapState.transitionTo2d;
    startStage(transitionStageTrackerRef, "step2_cameraTiltAnimation");

    if (hasGroundPos) {
      logger.debug(
        `Starting camera tilt animation (${durationMs.toFixed(0)}ms)...`
      );

      animateInterpolateHeadingPitchRange(
        scene,
        pos,
        new HeadingPitchRange(0, -Math.PI / 2, distance),
        {
          setPrevious: setLast3dCameraOrientation,
          duration: durationMs,
          onComplete: onComplete2d,
          cancelable: false,
        }
      );
    } else {
      logger.error("✗ No ground position, cannot transition");
      onCancel?.(false);
      transitionStateRef.current = MapState.mode3d;
    }
  };
};
