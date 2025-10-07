import { useCallback } from "react";

import {
  Cartesian2,
  Cartesian3,
  EasingFunction,
  Ray,
  PerspectiveFrustum,
  Scene,
} from "cesium";

import type { Ratio, Radians } from "@carma/types";

import { AnimationMap, cancelAnimation } from "../utils/animationMap";
import { cesiumAnimateFov } from "../utils/cesiumAnimateFov";
import { sceneHasTweens } from "../utils/sceneHasTweens";
import { DEFAULT_MAX_FOV, DEFAULT_MIN_FOV, computeNextFov } from "../utils/fov";
import {
  tryWithValidCamera,
  tryWithValidScene,
  isValidScene,
} from "../utils/instanceGates";
import { useCesiumContext } from "./useCesiumContext";
import { EmitCesiumCtxFn } from "../cesiumContextEventMap";

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

const zoom = (
  scene: Scene,
  animationMap: AnimationMap,
  isZoomOut = false,
  duration: number,
  moveRateFactor: number
): void => {
  let wasCancelled = false;

  if (animationMap.get(scene)) {
    cancelAnimation(scene, animationMap);
    wasCancelled = true;
  } // TODO: replace with a public API when one is available to check for ongoing flyTo animations

  const { camera, canvas } = scene;

  if (sceneHasTweens(scene)) {
    tryWithValidCamera(camera, (camera) => {
      camera.completeFlight();
    });
    console.debug("completing previous zoom or other flyTo animation");
    wasCancelled = true;
  }

  const screenCenter = new Cartesian2(
    canvas.clientWidth / 2,
    canvas.clientHeight / 2
  );

  let scenePickPosition: Cartesian3 | undefined;

  tryWithValidScene(scene, (scene) => {
    scenePickPosition = scene.pickPosition(screenCenter);
  });

  let pickRay: Ray | undefined;
  tryWithValidCamera(camera, (camera) => {
    pickRay = camera.getPickRay(screenCenter);
  });

  const cameraPosition = camera.position;

  let globePickPosition: Cartesian3 | undefined;
  tryWithValidScene(scene, (scene) => {
    if (!pickRay) return;
    globePickPosition = scene.globe.pick(pickRay, scene);
  });

  let globeDistance: number | undefined = undefined;
  if (globePickPosition) {
    globeDistance = Cartesian3.distance(cameraPosition, globePickPosition);
  }

  const sceneDistance =
    scenePickPosition && Cartesian3.distance(cameraPosition, scenePickPosition);

  let distance;

  if (sceneDistance !== undefined) {
    distance = sceneDistance;
  } else if (globeDistance !== undefined) {
    distance = globeDistance - FALLBACK_MIN_DISTANCE_TO_GLOBE;
  } else {
    return;
  }

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

  let offsetOnRay = isZoomOut
    ? -distance * moveRateFactor
    : (distance * 0.5) / moveRateFactor;

  // Clamp to maxDistance
  if (distance - offsetOnRay > maxDistance) {
    offsetOnRay = distance - maxDistance;
  }

  // Clamp to minDistance
  if (distance - offsetOnRay < minDistance) {
    offsetOnRay = distance - minDistance;
  }

  // Move the camera along the ray

  tryWithValidCamera(camera, (camera) => {
    if (!pickRay) return;
    const newPosition = Ray.getPoint(pickRay, offsetOnRay, new Cartesian3());
    camera.flyTo({
      destination: newPosition,
      orientation: {
        heading: camera.heading,
        pitch: camera.pitch,
        roll: camera.roll,
      },
      duration: duration,
      easingFunction: wasCancelled
        ? EasingFunction.QUADRATIC_OUT
        : EasingFunction.QUADRATIC_IN_OUT,
    });
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
  tryWithValidCamera(scene.camera, (camera) => {
    if (!(camera.frustum instanceof PerspectiveFrustum)) {
      console.debug("Camera frustum is not PerspectiveFrustum");
      return;
    }

    if (!camera.frustum.fov) return;

    const currentFov = camera.frustum.fov as Radians;
    const step = zoomIn ? 1 : -1;
    const stepFraction = (moveRateFactor *
      MOVE_RATE_EQUIVALENT_FACTOR) as Ratio;
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
      easingFunction: EasingFunction.SINUSOIDAL_IN_OUT,
    });
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
      if (!isValidScene(sceneRef.current) || !animationMapRef.current) return;
      fovMode
        ? fovZoom(
            sceneRef.current,
            animationMapRef.current,
            emit,
            false,
            duration * 1000,
            moveRateFactor
          )
        : zoom(
            sceneRef.current,
            animationMapRef.current,
            false,
            duration,
            moveRateFactor
          );
    },
    [animationMapRef, duration, moveRateFactor, emit, fovMode, sceneRef]
  );

  const handleZoomOut = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      if (!isValidScene(sceneRef.current) || !animationMapRef.current) return;
      fovMode
        ? fovZoom(
            sceneRef.current,
            animationMapRef.current,
            emit,
            true,
            duration * 1000,
            moveRateFactor
          )
        : zoom(
            sceneRef.current,
            animationMapRef.current,
            true,
            duration,
            moveRateFactor
          );
    },
    [animationMapRef, duration, emit, moveRateFactor, fovMode, sceneRef]
  );

  return { handleZoomIn, handleZoomOut };
}
