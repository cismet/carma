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
  type TransitionTo2dConfig,
} from "./TransitionContext";
import { runTransitionLifecycleHandlers } from "./transition-lifecycle-helpers";
import type { TransitionLifecycleRef } from "./transition-lifecycle-helpers";
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
  transitionLifecycleRef: TransitionLifecycleRef;
  setLast3dCameraOrientation: (hpr: HeadingPitchRange) => void;
  setLast3dAnimationDuration: (duration: number) => void;
  config: Required<TransitionTo2dConfig>;
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
    transitionLifecycleRef,
    setLast3dCameraOrientation,
    setLast3dAnimationDuration,
    config,
    emitCesiumEvent,
    emitTopicMapEvent,
    onComplete,
    onCancel,
  } = params;

  const {
    step2_cameraTiltAnimation = {},
    step3_cssFadeOut = {},
  } = config;

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
      console.warn("leaflet not available no transition possible [zoom]");
      onCancel?.(true);
      throw new Error("Transition to 2D cancelled: leaflet not available");
    }
    const scene = sceneRef.current;
    if (!isValidScene(scene)) {
      console.warn("cesium not available no transition possible [zoom]");
      onCancel?.(true);
      throw new Error("Transition to 2D cancelled: scene not available");
    }
    console.log(
      "[CESIUM|2D3D|TO2D] ========== Starting Transition to 2D =========="
    );

    transitionStateRef.current = MapTransitionState.preTransitionTo2d;
    try {
      await runTransitionLifecycleHandlers(
        transitionLifecycleRef,
        MapTransitionState.preTransitionTo2d
      );
    } catch (error) {
      console.warn("[CESIUM|2D3D|TO2D] preTransitionTo2d failed", error);
      // continue with actual transition
    }

    console.log(
      "[CESIUM|2D3D|TO2D] ========== STEP 1: Calculate Camera Position & Zoom =========="
    );

    // Do not transition if we cannot pick ground from depth (ellipsoid-only is not allowed)
    const { scenePosition: groundPos, coordinates: cartographic } =
      pickSceneCenter(scene, { getCoordinates: true });

    const sceneCamera = scene.camera;
    if (!isValidCamera(sceneCamera)) {
      console.warn("[CESIUM|2D3D|TO2D] camera not valid");
      onCancel?.(true);
      throw new Error("Transition to 2D cancelled: camera not valid");
    }

    let height = sceneCamera.positionCartographic.height;
    let distance = height;

    const hasGroundPos = defined(groundPos) && defined(cartographic);
    if (!hasGroundPos) {
      console.error(
        "[CESIUM|2D3D|TO2D] ✗ No valid ground height (depth) found – cancel transition"
      );
      transitionStateRef.current = MapState.mode3d;
      onCancel?.(true);
      throw new Error(
        "Transition to 2D cancelled: no valid ground height found"
      );
    }

    console.log("[CESIUM|2D3D|TO2D] ✓ Ground position found");

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
        console.error("[CESIUM|2D3D|TO2D] ✗ Could not determine current zoom level");
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

        console.log(
          `[CESIUM|2D3D|TO2D] ✓ Zoom calculation: ${currentZoom.toFixed(2)} → ${targetZoom} (diff: ${zoomDiff.toFixed(2)})`
        );
      }
    } else {
      console.log("[CESIUM|2D3D|TO2D] ⚠ No zoomSnap applied");
    }

    console.log(
      "[CESIUM|2D3D|TO2D] ========== STEP 2: Tilt Camera to Nadir =========="
    );

    // Calculate animation duration based on camera deviation and zoom change
    const cameraDeviation = getTopDownCameraDeviationAngle(sceneCamera);
    const calculatedDurationMs =
      (cameraDeviation ?? 0) * durationFactorCameraDeviationMs +
      (zoomDiff ?? 0) * durationFactorZoomDiffMs;
    const durationMs = Math.min(calculatedDurationMs, maxDurationTo2dMs); // Cap at configured max
    
    console.log(
      `[CESIUM|2D3D|TO2D] Tilt animation duration: ${durationMs.toFixed(0)}ms (deviation: ${((cameraDeviation * 180) / Math.PI).toFixed(1)}°, zoomDiff: ${zoomDiff.toFixed(2)})`
    );
    
    setLast3dAnimationDuration(durationMs);

    const onComplete2d = async () => {
      console.log(
        "[CESIUM|2D3D|TO2D] ========== STEP 3: Switch to 2D Map =========="
      );

      try {
        const { lat, lng, zoom } = await getTiledMapCenterZoomEquivalent(scene);
        if (!leafletMap) {
          console.error("[CESIUM|2D3D|TO2D] ✗ Leaflet not available");
          onCancel(false);
          throw new Error(
            "Transition to 2D cancelled: leaflet not available in onComplete"
          );
        }
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          console.error("[CESIUM|2D3D|TO2D] ✗ Invalid coordinates");
          onCancel(false);
          throw new Error("Transition to 2D cancelled: invalid coordinates");
        }
        if (!Number.isFinite(zoom)) {
          console.error("[CESIUM|2D3D|TO2D] ✗ Invalid zoom");
          onCancel(false);
          throw new Error("Transition to 2D cancelled: invalid zoom");
        }

        console.log(
          `[CESIUM|2D3D|TO2D] Setting Leaflet view: [${lat.toFixed(6)}, ${lng.toFixed(6)}] zoom=${zoom}`
        );
        leafletMap.setView([lat, lng], zoom, noAnimation);
        console.log("[CESIUM|2D3D|TO2D] ✓ Leaflet view set");
      } catch (error) {
        console.error("[CESIUM|2D3D|TO2D] ✗ Failed to determine center/zoom", error);
        onCancel(false);
        throw new Error(`Transition to 2D cancelled: ${error}`);
      }

      // trigger the visual transition
      // Emit events: TopicMap becomes active, Cesium becomes suspended
      console.log("[CESIUM|2D3D|TO2D] Activating TopicMap, suspending Cesium");
      emitTopicMapEvent(TopicMapCtxEvent.Activate);
      emitCesiumEvent(CtxEvent.Suspend, undefined);
      console.log("[CESIUM|2D3D|TO2D] ✓ TopicMap activated, Cesium suspended");

      transitionStateRef.current = MapState.mode2d;
      console.log("[CESIUM|2D3D|TO2D] ========== Transition to 2D Complete ==========");
      onComplete?.(true);
    };

    transitionStateRef.current = MapState.transitionTo2d;

    if (hasGroundPos) {
      console.log(
        `[CESIUM|2D3D|TO2D] Starting camera tilt animation (${durationMs.toFixed(0)}ms)...`
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
      console.error("[CESIUM|2D3D|TO2D] ✗ No ground position, cannot transition");
      onCancel(false);
      transitionStateRef.current = MapState.mode3d;
    }
  };
};
