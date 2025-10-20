import { useState } from "react";

import { type Map as LeafletMap } from "leaflet";
import {
  Cartographic,
  Cartesian3,
  defined,
  HeadingPitchRange,
} from "@carma/cesium";

import {
  useCarmaTopicMapContext,
  TopicMapCtxEvent,
} from "@carma-mapping/engines/carma-cismap";

import { normalizeOptions, promiseWithTimeout } from "@carma-commons/utils";
import { isZoom } from "@carma-commons/units/helpers";
import { waitForAnimationFrames } from "@carma-commons/dom/window";
import { LeafletMapEventNames } from "@carma-mapping/engines/leaflet";

// Import from cesium engine
import {
  useCesiumContext,
  CtxEvent,
  animateInterpolateHeadingPitchRange,
  getCameraHeightAboveGround,
  pickSceneCenter,
  cesiumCenterPixelSizeToLeafletZoom,
} from "@carma-mapping/engines/cesium/core";
import {
  isValidScene,
  isValidCamera,
  tryWithValidCamera,
} from "@carma/cesium";

// Import transition context
import { useTransitionContext } from "./use-transition-context";
import { MapTransitionState } from "./TransitionContext";
import { runTransitionLifecycleHandlers } from "./transition-lifecycle-helpers";

// Import transition utilities (now local)
import { getTiledMapCenterZoomEquivalent } from "./get-tiled-map-center-zoom-equivalent";
import { tiledMapToCesium } from "./tiled-map-to-cesium";

// Transition state helpers
const MapState = {
  uninitialized: "uninitialized",
  ...MapTransitionState,
};

export const isTransitionState = (state: unknown): boolean => {
  return [
    MapTransitionState.preTransitionTo2d,
    MapTransitionState.transitionTo2d,
    MapTransitionState.postTransitionTo2d,
    MapTransitionState.preTransitionTo3d,
    MapTransitionState.transitionTo3d,
    MapTransitionState.postTransitionTo3d,
  ].includes(state as MapTransitionState);
};

export const shouldBlockUserInput = (state: unknown): boolean => {
  // Post-transition states should NOT block user input
  if (
    state === MapTransitionState.postTransitionTo3d ||
    state === MapTransitionState.postTransitionTo2d
  ) {
    return false;
  }
  // All other transition states should block
  return isTransitionState(state);
};

type TransitionOptions = {
  onComplete?: (isTo2d: boolean) => void;
  onCancel?: (isTo2D: boolean) => void;
  duration?: number; // milliseconds
  maxZoom?: number; // max zoom level to transition from 2D to 3D
  zoomOutDuration?: number; // milliseconds
  zoomOutEaseLinearity?: number; // 0 to 1
  zoomOutTimeoutBuffer?: number; // milliseconds
};

const noop = () => {};
const noAnimation = {
  animate: false,
  duration: 0,
};

const defaultTransitionOptions: Required<TransitionOptions> = {
  onComplete: noop,
  onCancel: noop,
  duration: 1000,
  maxZoom: 20,
  zoomOutDuration: 700,
  zoomOutEaseLinearity: 0.75,
  zoomOutTimeoutBuffer: 100,
};

export const useMapTransition = (options: TransitionOptions = {}) => {
  const {
    duration,
    onComplete,
    onCancel,
    maxZoom,
    zoomOutEaseLinearity,
    zoomOutDuration,
    zoomOutTimeoutBuffer,
  } = normalizeOptions(options, defaultTransitionOptions);

  const { leafletMapRef, emit: emitTopicMapEvent } = useCarmaTopicMapContext();
  const { transitionStateRef, transitionLifecycleRef } = useTransitionContext();
  const { widgetRef, sceneRef, emit: emitCesiumEvent } = useCesiumContext();

  const [prevHPR, setPrevHPR] = useState<HeadingPitchRange | null>(null);
  const [prevDuration, setPrevDuration] = useState<number>(0);

  // todo render in lower res when suspended?
  //const [resolutionScale, setResolutionScale] = useState<number | null>(null);

  const prepareLeafletForTransition = async (
    leaflet: LeafletMap | null | undefined
  ) => {
    if (!leaflet) {
      return;
    }

    const cleanups: Array<() => void> = [];

    const zoom = leaflet.getZoom();
    const shouldZoomOut = isZoom(zoom) && zoom > maxZoom;

    let moveEndPromise: Promise<void> | undefined;

    if (shouldZoomOut) {
      moveEndPromise = new Promise<void>((resolve) => {
        const handle = () => {
          leaflet.off(LeafletMapEventNames.zoomend, handle);
          resolve();
        };
        cleanups.push(() => leaflet.off(LeafletMapEventNames.zoomend, handle));
        leaflet.once(LeafletMapEventNames.zoomend, handle);
      });
    }

    leaflet.stop();

    try {
      if (shouldZoomOut && Number.isFinite(maxZoom)) {
        const durationMs = Math.max(0, zoomOutDuration);
        const durationSeconds = durationMs / 1000;
        leaflet.flyTo(leaflet.getCenter(), maxZoom, {
          duration: durationSeconds,
          animate: durationSeconds > 0,
          easeLinearity: zoomOutEaseLinearity,
        });
      }

      if (moveEndPromise) {
        const timeoutMs =
          Math.max(0, zoomOutDuration) + Math.max(0, zoomOutTimeoutBuffer);
        await promiseWithTimeout(moveEndPromise, timeoutMs);
      }
    } finally {
      cleanups.forEach((cleanup) => cleanup());
    }
  };

  const transitionToMode3d = async () => {
    const leafletMap = leafletMapRef.current;
    console.debug("[CESIUM|2D3D|TO3D] transitionToMode3d called", {
      sceneValid: isValidScene(sceneRef.current),
      leafletMap,
    });

    const scene = sceneRef.current;
    if (!isValidScene(scene) || !leafletMap) {
      console.warn("[CESIUM|2D3D|TO3D] cesium or leaflet not available", {
        sceneValid: isValidScene(scene),
        leafletMap: !!leafletMap,
      });
      onCancel?.(false);
      throw new Error(
        "Transition to 3D cancelled: scene or leaflet not available"
      );
    }

    transitionStateRef.current = MapTransitionState.preTransitionTo3d;

    await prepareLeafletForTransition(leafletMap);

    // cancel any ongoing flight
    if (scene) {
      tryWithValidCamera(
        scene.camera,
        (camera) => {
          camera.cancelFlight();
        },
        "transitionToMode3d"
      );
    }

    const onComplete3d = () => {
      console.debug("[CESIUM|2D3D|TO3D] onComplete3d - setting mode to mode3d");
      transitionStateRef.current = MapState.mode3d;
      onComplete?.(false);
    };

    const onCancelAnimation3d = () => {
      console.debug(
        "[CESIUM|2D3D|TO3D] animation cancelled by user - setting mode to mode3d"
      );
      transitionStateRef.current = MapState.mode3d;
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

      if (pos && prevHPR) {
        console.debug(
          "[CESIUM|2D3D|TO3D] restore 3d camera position zoom",
          pos,
          prevHPR
        );
        animateInterpolateHeadingPitchRange(scene, pos, prevHPR, {
          delay: duration, // allow the css transition to finish
          duration: prevDuration * 1000,
          useCurrentDistance: true,
          cancelable: true, // Allow user to cancel post-transition animation
          onComplete: onComplete3d,
          onCancel: onCancelAnimation3d, // Just clear transition state, don't jump
        });
      } else {
        console.debug(
          "[CESIUM|2D3D|TO3D] to change to 3d camera position applied zoom",
          pos,
          prevHPR
        );
        onComplete3d();
        return;
      }
    };

    const { lat: latitude, lng: longitude } = leafletMap.getCenter();
    const zoom = leafletMap.getZoom();

    const widget = widgetRef.current;
    if (!widget) {
      console.warn("widget not available");
      onCancel(false);
      throw new Error("Transition to 3D cancelled: widget not available");
    }

    const resolutionScale = widget.resolutionScale;
    if (!Number.isFinite(resolutionScale) || resolutionScale === null) {
      console.warn("resolution scale not available");
      onCancel(false);
      throw new Error(
        "Transition to 3D cancelled: resolution scale not available"
      );
    }

    transitionStateRef.current = MapTransitionState.transitionTo3d;

    let transitionCompleted = false;

    try {
      await tiledMapToCesium({ latitude, longitude }, zoom, resolutionScale, {
        cause: "SwitchMapMode to 3d",
        onComplete: () => {
          transitionCompleted = true;
        },
      });
    } catch (error) {
      console.error("[TRANSITION|ERROR] Failed to transition to 3D:", error);
      transitionStateRef.current = MapTransitionState.mode2d;
      onCancel?.(false);
      throw new Error(`Transition to 3D cancelled: ${error}`);
    }

    if (transitionCompleted) {
      await waitForAnimationFrames(1);
      console.debug(
        "[CESIUM|2D3D|TO3D] tiledMapToCesium complete - transition to 3D"
      );
      // Emit events: Cesium becomes active, TopicMap becomes suspended
      emitCesiumEvent(CtxEvent.Activate, undefined);
      emitTopicMapEvent(TopicMapCtxEvent.Suspend);

      transitionStateRef.current = MapTransitionState.postTransitionTo3d;
      await waitForAnimationFrames(1);
      animateCesiumView();
    } else {
      onCancel(false);
      return;
    }
  };

  const transitionToMode2d = async () => {
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
    const duration = (cameraDeviation ?? 0) * 2 + (zoomDiff ?? 0) * 1;
    setPrevDuration(duration);

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
          setPrevious: setPrevHPR,
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
  return { transitionToMode2d, transitionToMode3d };
};
export default useMapTransition;
