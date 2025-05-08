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
} from "cesium";
import {
  cesiumAnimateFov,
  getOrbitPoint,
  type ViewerAnimationMap,
} from "@carma-mapping/cesium-engine";
import {
  DerivedExteriorOrientation,
  enuToEcef,
} from "./transformExteriorOrientation";
import { Vector3Arr } from "types/math";

const ENTER_DURATION = 1000;
const LEAVE_BASE_DURATION = 800;
const MAX_FLY_DURATION = 2000;

/**
 * Computes and flies to an improved camera orientation based on image metadata
 * @param viewer Cesium viewer instance
 * @param imageRecord Oblique image record containing metadata
 * @param onComplete Callback to execute after flight completion
 */
export const flyToExteriorOrientation = (
  viewer: Viewer,
  exteriorOrientation: DerivedExteriorOrientation,
  onComplete?: () => void
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

  const maxDurationSecond = MAX_FLY_DURATION / 1000;

  const duration = Math.max(
    0.05,
    Math.min(
      maxDurationSecond,
      Math.sqrt(Math.abs(currentDistanceToCamera)) / 10
    )
  );

  // TODO workaround until using actual exterior orientation up vector,
  // but that one is rotating differently by each camera ID
  const localEnuUpAxis: Vector3Arr = [0, 0, 1];
  const upZ = enuToEcef(localEnuUpAxis, position);

  // Execute the camera flight
  viewer.camera.flyTo({
    destination: position,
    orientation: {
      direction,
      up: new Cartesian3(...upZ),
    },
    endTransform: Matrix4.IDENTITY,
    duration,
    complete: onComplete,
  });
};

export const resetCamera = (viewer: Viewer) => {
  viewer.camera.lookAtTransform(Matrix4.IDENTITY);
  viewer.scene.requestRender();
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
      easingFunction: EasingFunction.SINUSOIDAL_IN_OUT,
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
