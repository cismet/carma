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
    durationFactorCameraDeviation,
    durationFactorZoomDiff,
    maxDuration: maxDurationTo2d,
  } = config;

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
    transitionStateRef.current = MapTransitionState.preTransitionTo2d;
    try {
      await runTransitionLifecycleHandlers(
        transitionLifecycleRef,
        MapTransitionState.preTransitionTo2d
      );
    } catch (error) {
      console.warn("preTransitionTo2d failed", error);
      // continue with actual transition
    }

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
      console.info(
        "[CESIUM|2D3D|TO2D] No valid ground height (depth) found – cancel transition"
      );
      transitionStateRef.current = MapState.mode3d;
      onCancel?.(true);
      throw new Error(
        "Transition to 2D cancelled: no valid ground height found"
      );
    }

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
      const heightBefore = height;
      const distanceBefore = distance;

      if (currentZoom === null) {
        console.warn("could not determine current zoom level");
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

        console.debug(
          "TRANSITION TO 2D [2D|3D] zoomSnap",
          zoomSnap,
          currentZoom,
          targetZoom,
          heightFactor,
          distance,
          distanceBefore,
          height,
          heightBefore,
          zoomDiff
        );
      }
    } else {
      console.info("no zoomSnap applied", leafletMap);
    }

    // TODO: getTopDownCameraDeviationAngle was removed - need to implement or find replacement
    const cameraDeviation = 0; // Fallback value
    const calculatedDuration =
      (cameraDeviation ?? 0) * durationFactorCameraDeviation +
      (zoomDiff ?? 0) * durationFactorZoomDiff;
    const duration = Math.min(calculatedDuration, maxDurationTo2d); // Cap at configured max
    setLast3dAnimationDuration(duration);

    const onComplete2d = async () => {
      try {
        const { lat, lng, zoom } = await getTiledMapCenterZoomEquivalent(scene);
        if (!leafletMap) {
          console.warn("leaflet not available no transition possible [zoom]");
          onCancel(false);
          throw new Error(
            "Transition to 2D cancelled: leaflet not available in onComplete"
          );
        }
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          console.warn("latitude or longitude is undefined, skipping");
          onCancel(false);
          throw new Error("Transition to 2D cancelled: invalid coordinates");
        }
        if (!Number.isFinite(zoom)) {
          console.warn("zoom is undefined, skipping");
          onCancel(false);
          throw new Error("Transition to 2D cancelled: invalid zoom");
        }

        leafletMap.setView([lat, lng], zoom, noAnimation);
      } catch (error) {
        console.error("could not determine center zoom equivalent", error);
        onCancel(false);
        throw new Error(`Transition to 2D cancelled: ${error}`);
      }

      // trigger the visual transition
      // Emit events: TopicMap becomes active, Cesium becomes suspended
      emitTopicMapEvent(TopicMapCtxEvent.Activate);
      emitCesiumEvent(CtxEvent.Suspend, undefined);

      transitionStateRef.current = MapState.mode2d;
      onComplete?.(true);
    };

    console.debug("[Animation|2D3D] duration zoom", distance);

    transitionStateRef.current = MapState.transitionTo2d;
    if (hasGroundPos) {
      // rotate around the groundposition at center
      console.debug(
        "[CESIUM|2D3D|TO2D] setting prev HPR zoom",
        groundPos,
        height
      );

      animateInterpolateHeadingPitchRange(
        scene,
        pos,
        new HeadingPitchRange(0, -Math.PI / 2, distance),
        {
          setPrevious: setLast3dCameraOrientation,
          duration: duration * 1000,
          onComplete: onComplete2d,
          cancelable: false,
        }
      );
    } else {
      onCancel(false);
      // no transition possible
      transitionStateRef.current = MapState.mode3d;
    }
  };
};
