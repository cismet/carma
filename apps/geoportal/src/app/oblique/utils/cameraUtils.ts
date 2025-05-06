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
  Math as CesiumMath,
} from "cesium";
import {
  cesiumAnimateFov,
  getOrbitPoint,
  type ViewerAnimationMap,
} from "@carma-mapping/cesium-engine";
import type { ObliqueImageRecord, NearestObliqueImageRecord } from "../types";

const ENTER_DURATION = 1000;
const LEAVE_BASE_DURATION = 800;

/**
 * Computes and flies to an improved camera orientation based on image metadata
 * @param viewer Cesium viewer instance
 * @param imageRecord Oblique image record containing metadata
 * @param onComplete Callback to execute after flight completion
 */
export const flyToImprovedOrientation = (
  viewer: Viewer,
  imageRecord: ObliqueImageRecord | NearestObliqueImageRecord,
  onComplete?: () => void
): void => {
  if (!viewer || !imageRecord || !imageRecord.record) {
    console.debug("Missing required parameters for improved orientation calculation");
    return;
  }

  // Get camera position from image record
  const { centerWGS84 } = imageRecord.record;
  if (!centerWGS84 || centerWGS84.length < 3) {
    console.debug("Missing center coordinates in image record");
    return;
  }

  // Create position from WGS84 coordinates
  const [longitude, latitude, height] = centerWGS84;
  const position = Cartesian3.fromDegrees(longitude, latitude, height);

  // Look for camera orientation vectors in the global state
  // This is populated by CameraVectorControls component
  const cameraState = (window as any).__obliqueCameraState;
  
  if (!cameraState) {
    console.debug("No camera state available from CameraVectorControls");
    return;
  }

  const { directionVectorECEF, upVector } = cameraState;
  
  if (!directionVectorECEF || !upVector) {
    console.debug("Missing direction or up vectors in camera state");
    return;
  }

  // Prepare vectors for camera orientation
  const dirVec = new Cartesian3(
    directionVectorECEF[0],
    directionVectorECEF[1],
    directionVectorECEF[2]
  );
  
  const upVec = new Cartesian3(
    upVector[0],
    upVector[1],
    upVector[2]
  );

  // Validate vectors
  const dirMagnitude = Cartesian3.magnitude(dirVec);
  const upMagnitude = Cartesian3.magnitude(upVec);
  
  if (dirMagnitude < CesiumMath.EPSILON6 || upMagnitude < CesiumMath.EPSILON6) {
    console.debug("Direction or up vector has near-zero magnitude");
    return;
  }

  // Normalize vectors for camera orientation
  const normalizedDirection = Cartesian3.normalize(dirVec, new Cartesian3());
  const normalizedUp = Cartesian3.normalize(upVec, new Cartesian3());

  // Calculate appropriate flight duration based on distance
  const currentDistanceToCamera = Cartesian3.distance(
    viewer.camera.positionWC,
    position
  );

  const duration = Math.max(
    0.05,
    Math.min(3, Math.sqrt(Math.abs(currentDistanceToCamera)) / 10)
  );

  // Execute the camera flight
  viewer.camera.flyTo({
    destination: position,
    orientation: {
      direction: normalizedDirection,
      up: normalizedUp
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
