import {
  Cartesian3,
  Cartographic,
  defined,
  HeadingPitchRange,
} from "@carma/cesium";
import type { Map as LeafletMap } from "leaflet";
import {
  getTopDownCameraDeviationAngle,
  isValidCamera,
  type Scene,
} from "@carma/cesium";

import {
  pickSceneCanvasCenter,
  animateInterpolateHeadingPitchRange,
} from "@carma-mapping/engines/cesium/legacy";

import { noAnimation } from "../constants";

type AnimateCesiumToTopDownOptions = {
  scene: Scene;
  leaflet: LeafletMap;
  onAnimationComplete: () => void;
  setPrevHPR: (hpr: HeadingPitchRange) => void;
  setPrevDuration: (duration: number) => void;
  onTransitionCancel: () => void;
};

/**
 * Animates Cesium camera to top-down 2D view
 * Returns true if animation started, false if cancelled
 */
export const animateCesiumToTopDownLeafletLikeView = (
  scene: Scene,
  leaflet: LeafletMap,
  {
    onAnimationComplete,
    setPrevHPR,
    setPrevDuration,
    onTransitionCancel,
  }: AnimateCesiumToTopDownOptions
): boolean => {
  // Use pickPosition to get terrain-aware ground position at screen center
  const centerPickResult = pickSceneCanvasCenter(scene, {
    depthTestAgainstTerrain: true,
    getCoordinates: true,
  });

  const groundPos = centerPickResult.scenePosition;
  const cartographic = centerPickResult.coordinates;

  let animationStarted = false;

  const camera = scene.camera;
  if (!isValidCamera(camera)) {
    console.info(
      "[CESIUM] [CESIUM|2D3D|TO2D] No valid camera found – cancel transition"
    );
    onTransitionCancel();
    return false;
  }

  let height = camera.positionCartographic.height;
  let distance = height;

  const hasGroundPos = defined(groundPos) && defined(cartographic);
  if (!hasGroundPos) {
    console.info(
      "[CESIUM] [CESIUM|2D3D|TO2D] No valid ground height (depth) found – cancel transition"
    );
    onTransitionCancel();
    return;
  }

  const pos = groundPos as Cartesian3;
  const carto = cartographic as Cartographic;
  distance = Cartesian3.distance(pos, camera.position);
  height = carto.height + distance;

  // evaluate angles for animation duration
  let zoomDiff = 0;

  const { zoomSnap } = leaflet.options;

  if (zoomSnap) {
    // Move the cesium camera to the next zoom snap level of leaflet before transitioning
    const currentZoom = sceneCenterPixelSizeToLeafletZoom(scene).value;
    const heightBefore = height;
    const distanceBefore = distance;

    if (currentZoom === null) {
      console.error("[CESIUM] could not determine current zoom level");
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
        "[CESIUM] TRANSITION TO 2D [2D|3D] zoomSnap",
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
    console.info("[CESIUM] no zoomSnap applied", leaflet);
  }

  const duration =
    getTopDownCameraDeviationAngle(scene.camera) * 2 + zoomDiff * 1;
  setPrevDuration(duration);

  const onComplete2d = async () => {
    try {
      const { latitude, longitude, zoom } =
        await getTiledMapCenterZoomEquivalent(scene);
      if (!leaflet) {
        console.warn(
          "[CESIUM] leaflet not available no transition possible [zoom]"
        );
        return;
      }
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        console.warn("[CESIUM] latitude or longitude is undefined, skipping");
        return;
      }
      if (!Number.isFinite(zoom)) {
        console.warn("[CESIUM] zoom is undefined, skipping");
        return;
      }

      leaflet.setView([latitude, longitude], zoom, noAnimation);
    } catch (error) {
      console.error(
        "[CESIUM] could not determine center zoom equivalent",
        error
      );
      return;
    }

    onAnimationComplete();
  };

  console.debug("[CESIUM] [Animation|2D3D] duration zoom", distance);

  if (hasGroundPos) {
    // rotate around the groundposition at center
    console.debug(
      "[CESIUM] [CESIUM|2D3D|TO2D] setting prev HPR zoom",
      groundPos,
      height
    );

    animateInterpolateHeadingPitchRange(
      cesiumContext,
      pos,
      new HeadingPitchRange(0, -Math.PI / 2, distance),
      {
        setPrevious: setPrevHPR,
        duration: duration * 1000,
        onComplete: onComplete2d,
        cancelable: false,
        useCurrentDistance: false, // Interpolate range to match zoom snap target
      }
    );
    animationStarted = true;
  }

  return animationStarted;
};
