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
import { getTiledMapCenterZoomEquivalent } from "../../utils/leaflet/get-tiled-map-center-zoom-equivalent";
import { getCameraHeightAboveGround } from "../../utils/cesium/get-camera-height-above-ground";
import { sceneCenterPixelSizeToLeafletZoom } from "../../utils/cesium/scene-center-pixel-size-to-leaflet-zoom";

type AnimateCesiumToTopDownOptions = {
  scene: Scene;
  leaflet: LeafletMap;
  onAnimationComplete: () => void;
  setPrevHPR: (hpr: HeadingPitchRange) => void;
  onTransitionCancel: () => void;
  onLeafletViewSet?: (params: {
    center: { lat: number; lng: number };
    zoom: number;
  }) => void;
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
    onTransitionCancel,
    onLeafletViewSet,
  }: AnimateCesiumToTopDownOptions
): boolean => {
  const camera = scene.camera;
  if (!isValidCamera(camera)) {
    console.info(
      "[CESIUM] [CESIUM|2D3D|TO2D] No valid camera found – cancel transition"
    );
    onTransitionCancel();
    return false;
  }

  // Use pickPosition to get terrain-aware ground position at screen center
  const centerPickResult = pickSceneCanvasCenter(scene, {
    depthTestAgainstTerrain: true,
    getCoordinates: true,
  });

  const groundPos = centerPickResult.scenePosition;
  const cartographic = centerPickResult.coordinates;

  let animationStarted = false;

  let height = camera.positionCartographic.height;
  let distance = height;

  const hasGroundPos = defined(groundPos) && defined(cartographic);
  if (!hasGroundPos) {
    console.info(
      "[CESIUM] [CESIUM|2D3D|TO2D] No valid ground height (depth) found – cancel transition"
    );
    onTransitionCancel();
    return false;
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
        "[CESIUM] [CESIUM|2D3D|TO2D] Adjusting camera for zoomSnap",
        {
          zoomSnap,
          currentZoom,
          targetZoom,
          heightFactor,
          distanceBefore,
          distanceAfter: distance,
          heightBefore,
          heightAfter: height,
          zoomDiff,
        }
      );
    }
  } else {
    console.debug(
      "[CESIUM] [CESIUM|2D3D|TO2D] No zoomSnap - using current zoom",
      { leafletOptions: leaflet.options }
    );
  }

  const duration =
    getTopDownCameraDeviationAngle(scene.camera) * 2 + zoomDiff * 1;

  const onComplete2d = async () => {
    try {
      const { latitude, longitude, zoom } =
        await getTiledMapCenterZoomEquivalent(scene);
      console.log("[2D3D|TRANSITION] Setting Leaflet view after animation:", {
        latitude,
        longitude,
        zoom,
        hasLeaflet: !!leaflet,
      });

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

      // Apply zoomSnap if configured
      let snappedZoom = zoom;
      const { zoomSnap } = leaflet.options;
      if (zoomSnap && zoomSnap > 0) {
        snappedZoom = Math.round(zoom / zoomSnap) * zoomSnap;
        console.log("[2D3D|TRANSITION] Snapping zoom:", {
          originalZoom: zoom,
          zoomSnap,
          snappedZoom,
        });
      }

      console.warn(
        "[2D3D|TRANSITION] CALLING leaflet.setView",
        { latitude, longitude, snappedZoom, stack: new Error().stack }
      );
      leaflet.setView([latitude, longitude], snappedZoom, noAnimation);
      console.log("[2D3D|TRANSITION] Leaflet view set successfully");

      if (onLeafletViewSet) {
        console.warn(
          "[2D3D|TRANSITION] INVOKING onLeafletViewSet callback",
          { center: { lat: latitude, lng: longitude }, zoom: snappedZoom }
        );
        onLeafletViewSet({ center: { lat: latitude, lng: longitude }, zoom: snappedZoom });
      } else {
        console.warn("[2D3D|TRANSITION] NO onLeafletViewSet callback registered!");
      }
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
    // Log current camera and pixel resolution before starting animation
    const currentHeight = camera.positionCartographic.height;
    const currentDistance = Cartesian3.distance(pos, camera.position);

    console.debug(
      "[CESIUM] [CESIUM|2D3D|TO2D] BEFORE animation - current state",
      {
        currentHeight,
        currentDistance,
        targetHeight: height,
        targetDistance: distance,
      }
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
        useCurrentDistance: false, // Interpolate range to match zoom snap target
      }
    );
    animationStarted = true;
  }

  return animationStarted;
};
