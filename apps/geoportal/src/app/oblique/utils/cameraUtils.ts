import { type MutableRefObject } from "react";
import { Easing } from "@carma-commons/math";
import {
  BoundingSphere,
  Cartesian3,
  HeadingPitchRange,
  Matrix4,
  PerspectiveFrustum,
  Ray,
  defined,
  CesiumMath,
  type Scene,
} from "@carma/cesium";
import { pickSceneCenter } from "@carma-mapping/engines/cesium";
import { DerivedExteriorOrientation } from "./transformExteriorOrientation";
import type { AnimationConfig } from "../types";

// ...

const ENTER_DURATION = 1000;
const LEAVE_BASE_DURATION = 800;
const MAX_FLY_DURATION_MS = 2000; // ms
const MIN_FLY_DURATION_MS = 50; // should be about a frame to avoid zero duration artifacts in calculations and code paths taken
const DEFAULT_EASING_FUNCTION = Easing.LINEAR_NONE;
const DYNAMIC_DISTANCE_TO_MS_FACTOR = 100;

/**
 * Computes and flies to an improved camera orientation based on image metadata
 * @param scene Cesium scene instance
 * @param imageRecord Oblique image record containing metadata
 * @param onComplete Callback to execute after flight completion
 * @param flyToOptions Optional configuration for the flight animation
 */
export const flyToExteriorOrientation = (
  scene: Scene,
  exteriorOrientation: DerivedExteriorOrientation,
  onComplete?: () => void,
  flyToOptions: AnimationConfig = {}
): void => {
  if (
    !exteriorOrientation ||
    !exteriorOrientation.position.wgs84 ||
    !exteriorOrientation.rotation.ecef.direction
  ) {
    console.debug(
      "Missing required parameters for improved orientation calculation",
      exteriorOrientation,
      exteriorOrientation.position.wgs84,
      exteriorOrientation.rotation.ecef.direction
    );
    return;
  }

  // Create position from WGS84 coordinates
  const [longitude, latitude, height] = exteriorOrientation.position.wgs84;
  const position = Cartesian3.fromDegrees(longitude, latitude, height);

  const direction = new Cartesian3(
    ...exteriorOrientation.rotation.ecef.direction
  );

  const up = new Cartesian3(...exteriorOrientation.rotation.ecef.up);

  if (!defined(direction) || !defined(up)) {
    console.debug(
      "Missing direction or up vectors in camera state",
      direction,
      up
    );
    return;
  }

  const camera = scene.camera;

  // Calculate appropriate flight duration based on distance
  const currentDistanceToCamera = Cartesian3.distance(
    camera.positionWC,
    position
  );

  // TODO: also factor in orientation change
  const duration = getDynamicDurationSecondsFromDistance(
    currentDistanceToCamera,
    flyToOptions.duration
  );

  const easingFunction = flyToOptions.easingFunction || DEFAULT_EASING_FUNCTION;

  // TODO workaround until using actual exterior orientation up vector,
  // but that one is rotating differently by each camera ID
  // const localEnuUpAxis: Vector3Arr = [0, 0, 1];
  // const upZ = enuToEcef(localEnuUpAxis, position);

  // Execute the camera flight
  camera.flyTo({
    destination: position,
    orientation: {
      direction,
      up,
    },
    endTransform: Matrix4.IDENTITY,
    duration,
    easingFunction,
    complete: onComplete,
  });
};

const distanceSqrtInMetersToMilliseconds = (
  distance: number,
  min: number,
  max: number,
  factor = DYNAMIC_DISTANCE_TO_MS_FACTOR
) => {
  const distanceToMSeconds = Math.sqrt(Math.abs(distance)) * factor;
  return CesiumMath.clamp(distanceToMSeconds, min, max);
};

export const getDynamicDurationSecondsFromDistance = (
  distance: number,
  maxDurationMilliseconds = MAX_FLY_DURATION_MS
) => {
  const dynamicDurationMilliseconds = distanceSqrtInMetersToMilliseconds(
    distance,
    MIN_FLY_DURATION_MS,
    maxDurationMilliseconds
  );
  const duration = dynamicDurationMilliseconds / 1000;
  return duration;
};

export const enterObliqueMode = (
  scene: Scene,
  originalFovRef: MutableRefObject<number | null>,
  targetPitch: number,
  targetHeight: number,
  onComplete: () => void,
  duration?: number
) => {
  const ellipsoid = scene.globe.ellipsoid;
  const camera = scene.camera;

  if (camera.frustum instanceof PerspectiveFrustum) {
    originalFovRef.current = camera.frustum.fov;
  }

  const center = pickSceneCenter(scene);
  if (!center) {
    console.debug("Failed to get orbit point, completing without animation");
    // Still call onComplete to prevent suspension flags from being stuck
    onComplete();
    return;
  }
  const range = camera.positionCartographic.height / Math.tan(-targetPitch);

  const sphere = new BoundingSphere(center, range);

  const flightCompleteCallback = () => {
    const ray = new Ray(camera.position, camera.direction);
    const currentCartographic = ellipsoid.cartesianToCartographic(
      camera.position
    );

    if (!currentCartographic) {
      console.debug("Failed to get cartographic position");
      return;
    }

    const currentHeight = currentCartographic.height;
    const heightDifference = targetHeight - currentHeight;

    if (Math.abs(heightDifference) > 100) {
      const distanceToMove = heightDifference / Math.sin(-targetPitch);
      const newPosition = Ray.getPoint(ray, -distanceToMove);

      camera.flyTo({
        destination: newPosition,
        orientation: {
          heading: camera.heading,
          pitch: targetPitch,
          roll: 0,
        },
        duration: 0.5,
        complete: onComplete,
      });
    } else {
      onComplete();
    }
  };

  const effectiveDuration =
    duration !== undefined ? duration : ENTER_DURATION / 1000;

  console.debug(
    "Effective duration:",
    effectiveDuration,
    duration,
    ENTER_DURATION / 1000
  );

  camera.flyToBoundingSphere(sphere, {
    offset: new HeadingPitchRange(camera.heading, targetPitch, range),
    duration: effectiveDuration,
    complete: flightCompleteCallback,
  });
};

export const leaveObliqueMode = (
  scene: Scene,
  originalFovRef: MutableRefObject<number | null>,
  onComplete: () => void
) => {
  const camera = scene.camera;
  if (
    camera.frustum instanceof PerspectiveFrustum &&
    originalFovRef.current !== null
  ) {
    const currentFov = camera.frustum.fov || 1;
    const targetFov = originalFovRef.current || 1;

    if (currentFov === targetFov) {
      console.debug("No FOV change needed, skipping animation");
      onComplete();
      return;
    }

    const adaptiveLeaveDuration =
      LEAVE_BASE_DURATION * Math.abs(currentFov - targetFov);

    const startTime = performance.now();
    const animate = (time: number) => {
      const elapsed = time - startTime;
      const t = Math.min(elapsed / adaptiveLeaveDuration, 1);
      const easedT = Easing.SINUSOIDAL_IN_OUT(t);
      const newFov = currentFov + easedT * (targetFov - currentFov);

      if (camera.frustum instanceof PerspectiveFrustum) {
        camera.frustum.fov = newFov;
      }
      scene.requestRender();

      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        onComplete();
      }
    };
    requestAnimationFrame(animate);
  } else {
    // If no animation is needed, directly reset the FOV and invoke the onComplete callback
    if (camera.frustum instanceof PerspectiveFrustum) {
      camera.frustum.fov = originalFovRef.current || camera.frustum.fov;
    }
    onComplete();
  }
};

export const resetCamera = (scene: Scene) => {
  scene.camera.lookAtTransform(Matrix4.IDENTITY);
};
