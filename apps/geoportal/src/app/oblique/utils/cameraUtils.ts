import { type MutableRefObject } from "react";
import {
  BoundingSphere,
  Cartesian3,
  EasingFunction,
  HeadingPitchRange,
  Matrix4,
  PerspectiveFrustum,
  Ray,
  type Viewer,
  defined,
  Math as CesiumMath,
} from "cesium";
import {
  cesiumAnimateFov,
  getOrbitPoint,
  isValidViewerInstance,
  type ViewerAnimationMap,
} from "@carma-mapping/cesium-engine";
import { DerivedExteriorOrientation } from "./transformExteriorOrientation";
import type { AnimationConfig } from "../types";

const ENTER_DURATION = 1000;
const LEAVE_BASE_DURATION = 800;
const MAX_FLY_DURATION_MS = 2000; // ms
const MIN_FLY_DURATION_MS = 50; // should be about a frame to avoid zero duration artifacts in calculations and code paths taken
const DEFAULT_EASING_FUNCTION = EasingFunction.LINEAR_NONE;
const DYNAMIC_DISTANCE_TO_MS_FACTOR = 100;

/**
 * Computes and flies to an improved camera orientation based on image metadata
 * @param viewer Cesium viewer instance
 * @param imageRecord Oblique image record containing metadata
 * @param onComplete Callback to execute after flight completion
 * @param flyToOptions Optional configuration for the flight animation
 */
export const flyToExteriorOrientation = (
  viewer: Viewer,
  exteriorOrientation: DerivedExteriorOrientation,
  onComplete?: () => void,
  flyToOptions: AnimationConfig = {}
): void => {
  if (
    !viewer ||
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

  // Calculate appropriate flight duration based on distance
  const currentDistanceToCamera = Cartesian3.distance(
    viewer.camera.positionWC,
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
  viewer.camera.flyTo({
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

export const resetCamera = (viewer: Viewer) => {
  if (isValidViewerInstance(viewer) && defined(viewer.camera)) {
    viewer.camera.lookAtTransform(Matrix4.IDENTITY);
    viewer.scene.requestRender();
  }
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
  viewer: Viewer,
  viewerAnimationMap: ViewerAnimationMap,
  originalFovRef: MutableRefObject<number | null>,
  targetPitch: number,
  targetHeight: number,
  onComplete: () => void
) => {
  if (viewer.camera.frustum instanceof PerspectiveFrustum) {
    originalFovRef.current = viewer.camera.frustum.fov;
  }

  const center = getOrbitPoint(viewer);
  const range =
    viewer.camera.positionCartographic.height / Math.tan(-targetPitch);

  const sphere = new BoundingSphere(center, range);

  const flightCompleteCallback = () => {
    const ray = new Ray(viewer.camera.position, viewer.camera.direction);
    const currentCartographic =
      viewer.scene.globe.ellipsoid.cartesianToCartographic(
        viewer.camera.position
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

      viewer.camera.flyTo({
        destination: newPosition,
        orientation: {
          heading: viewer.camera.heading,
          pitch: targetPitch,
          roll: 0,
        },
        duration: 0.5,
        complete: onComplete,
      });
    } else {
      onComplete();
      viewer.scene.requestRender();
    }
  };

  viewer.camera.flyToBoundingSphere(sphere, {
    offset: new HeadingPitchRange(viewer.camera.heading, targetPitch, range),
    duration: ENTER_DURATION / 1000,
    complete: flightCompleteCallback,
  });
};

export const leaveObliqueMode = (
  viewer: Viewer,
  viewerAnimationMap: ViewerAnimationMap,
  originalFovRef: MutableRefObject<number | null>,
  onComplete: () => void
) => {
  if (
    viewer.camera.frustum instanceof PerspectiveFrustum &&
    originalFovRef.current !== null
  ) {
    const currentFov = viewer.camera.frustum.fov || 1;
    const targetFov = originalFovRef.current || 1;

    if (currentFov === targetFov) {
      console.debug("No FOV change needed, skipping animation");
      onComplete();
      return;
    }

    const adaptiveLeaveDuration =
      LEAVE_BASE_DURATION * Math.abs(currentFov - targetFov);

    cesiumAnimateFov({
      viewer,
      viewerAnimationMap,
      startFov: currentFov,
      targetFov,
      duration: adaptiveLeaveDuration,
      onComplete: () => {
        onComplete();
      },
    });
  } else {
    // If no animation is needed, directly reset the FOV and invoke the onComplete callback
    if (viewer.camera.frustum instanceof PerspectiveFrustum) {
      viewer.camera.frustum.fov =
        originalFovRef.current || viewer.camera.frustum.fov;
    }
    onComplete();
  }
};
