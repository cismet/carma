import { useCallback } from "react";

import {
  Cartesian2,
  Cartesian3,
  Ray,
  PerspectiveFrustum,
  Scene,
  isValidScene,
  isValidCamera,
} from "@carma/cesium";
import { Easing } from "@carma-commons/math";

import type { Ratio, Radians } from "@carma/units/types";

import {
  AnimationMap,
  cancelAnimation,
  cesiumAnimateFov,
  sceneHasTweens,
} from "../../scene/camera/animations";
import {
  DEFAULT_MAX_FOV,
  DEFAULT_MIN_FOV,
  computeNextFov,
} from "../../scene/camera";
import { useCesiumContext } from "../../context";
import { EmitCesiumCtxFn } from "../../context/cesium-context-event-map";

type ZoomOptions = {
  duration?: number;
  moveRateFactor?: number;
  fovMode?: boolean;
};

// Value to subtract from the globe distance to get the minimum zoom distance when not over scene content
// Should be significantly over maximum elevations of area of interest to prevent camera going under the surface
const FALLBACK_MIN_DISTANCE_TO_GLOBE = 2500;

const MOVE_RATE_EQUIVALENT_FACTOR = 0.5;

const defaultZoomOptions: Required<ZoomOptions> = {
  duration: 0.5,
  moveRateFactor: 1,
  fovMode: false,
};

// Scratch objects to avoid allocations on every zoom
const scratchScreenCenter = new Cartesian2();
const scratchNewPosition = new Cartesian3();

const zoom = (
  scene: Scene,
  animationMap: AnimationMap,
  isZoomOut = false,
  duration: number,
  moveRateFactor: number
): void => {
  // Early validation - check once at start
  if (!isValidScene(scene)) {
    console.warn("[zoom] Invalid scene");
    return;
  }

  const { camera, canvas } = scene;

  let wasCancelled = false;

  if (animationMap.get(scene)) {
    cancelAnimation(scene, animationMap);
    wasCancelled = true;
  }

  if (sceneHasTweens(scene)) {
    camera.completeFlight();
    console.debug("completing previous zoom or other flyTo animation");
    wasCancelled = true;
  }

  // Calculate screen center
  scratchScreenCenter.x = canvas.clientWidth / 2;
  scratchScreenCenter.y = canvas.clientHeight / 2;

  // Pick positions - validate everything (Cesium can return invalid/destroyed objects)
  const scenePickPosition = scene.pickPosition?.(scratchScreenCenter);
  const pickRay = camera.getPickRay?.(scratchScreenCenter);

  // Validate pick ray exists and has required properties
  if (!pickRay || !pickRay.origin || !pickRay.direction) {
    console.debug("[zoom] Invalid pick ray - aborting");
    return;
  }

  const globePickPosition = scene.globe.pick?.(pickRay, scene);
  const cameraPosition = camera.position;

  // Calculate distance
  const globeDistance = globePickPosition
    ? Cartesian3.distance(cameraPosition, globePickPosition)
    : undefined;

  const sceneDistance = scenePickPosition
    ? Cartesian3.distance(cameraPosition, scenePickPosition)
    : undefined;

  let distance: number;
  if (sceneDistance !== undefined) {
    distance = sceneDistance;
  } else if (globeDistance !== undefined) {
    distance = globeDistance - FALLBACK_MIN_DISTANCE_TO_GLOBE;
  } else {
    console.debug("[zoom] No valid distance - aborting");
    return;
  }

  // Validate zoom constraints
  const maxDistance = scene.screenSpaceCameraController.maximumZoomDistance;
  const minDistance = scene.screenSpaceCameraController.minimumZoomDistance;

  if (maxDistance === undefined || maxDistance === Number.POSITIVE_INFINITY) {
    console.warn(
      "Cesium maximumZoomDistance is undefined or infinite, zooming may not work as expected, set maximumZoomDistance in cesium config for ScreenSpaceCameraController"
    );
  }
  if (minDistance === undefined || minDistance === 0) {
    console.warn(
      "Cesium minimumZoomDistance is undefined or 0, zooming may not work as expected, set minimumZoomDistance in cesium config for ScreenSpaceCameraController"
    );
  }

  // Calculate offset and clamp
  let offsetOnRay = isZoomOut
    ? -distance * moveRateFactor
    : (distance * 0.5) / moveRateFactor;

  if (distance - offsetOnRay > maxDistance) {
    offsetOnRay = distance - maxDistance;
  }
  if (distance - offsetOnRay < minDistance) {
    offsetOnRay = distance - minDistance;
  }

  // Execute zoom - revalidate before async operation (camera could become invalid)
  if (!isValidCamera(camera)) {
    console.debug("[zoom] Invalid camera before flyTo - aborting");
    return;
  }

  Ray.getPoint(pickRay, offsetOnRay, scratchNewPosition);
  camera.flyTo({
    destination: scratchNewPosition,
    orientation: {
      heading: camera.heading,
      pitch: camera.pitch,
      roll: camera.roll,
    },
    duration,
    easingFunction: wasCancelled
      ? Easing.QUADRATIC_OUT
      : Easing.QUADRATIC_IN_OUT,
  });
};

const fovZoom = (
  scene: Scene,
  animationMap: AnimationMap,
  emit: EmitCesiumCtxFn,
  zoomIn: boolean,
  duration: number,
  moveRateFactor: number,
  maxFov = DEFAULT_MAX_FOV,
  minFov = DEFAULT_MIN_FOV
) => {
  cancelAnimation(scene, animationMap);

  const { camera } = scene;

  if (!(camera.frustum instanceof PerspectiveFrustum)) {
    console.debug("[fovZoom] Camera frustum is not PerspectiveFrustum");
    return;
  }

  if (!camera.frustum.fov) {
    console.debug("[fovZoom] No FOV on frustum");
    return;
  }

  const currentFov = camera.frustum.fov as Radians;
  const step = zoomIn ? 1 : -1;
  const stepFraction = (moveRateFactor * MOVE_RATE_EQUIVALENT_FACTOR) as Ratio;
  const targetFov = computeNextFov(
    currentFov,
    step,
    minFov,
    maxFov,
    stepFraction
  );

  // Use the same per-frame animation helper; it updates on each render
  cesiumAnimateFov(scene, animationMap, emit, {
    startFov: currentFov,
    targetFov,
    duration,
    easingFunction: Easing.SINUSOIDAL_IN_OUT,
  });
};

/**
 * @param zoomOptions - Options for the zoom animation.
 * @param zoomOptions.fovMode - The mode of the zoom animation. Default is "zoom".
 * @param zoomOptions.duration - The duration of the animation in milliseconds. Default is 0.5.
 * @param zoomOptions.moveRateFactor - The factor by which the camera's default zoom/moveRate increment be amplified by, default 1.
 */

export function useZoomControls(zoomOptions: Partial<ZoomOptions> = {}) {
  const { duration, fovMode, moveRateFactor } = {
    ...defaultZoomOptions,
    ...zoomOptions,
  };

  const { sceneRef, animationMapRef, emit } = useCesiumContext();

  const handleZoomIn = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      const scene = sceneRef.current;
      if (!isValidScene(scene) || !scene || !animationMapRef.current) return;
      fovMode
        ? fovZoom(
            scene,
            animationMapRef.current,
            emit,
            true, // zoomIn = true for zoom in
            duration * 1000,
            moveRateFactor
          )
        : zoom(scene, animationMapRef.current, false, duration, moveRateFactor);
    },
    [animationMapRef, duration, moveRateFactor, emit, fovMode, sceneRef]
  );

  const handleZoomOut = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      const scene = sceneRef.current;
      if (!isValidScene(scene) || !scene || !animationMapRef.current) return;
      fovMode
        ? fovZoom(
            scene,
            animationMapRef.current,
            emit,
            false, // zoomIn = false for zoom out
            duration * 1000,
            moveRateFactor
          )
        : zoom(scene, animationMapRef.current, true, duration, moveRateFactor);
    },
    [animationMapRef, duration, emit, moveRateFactor, fovMode, sceneRef]
  );

  return { handleZoomIn, handleZoomOut };
}
