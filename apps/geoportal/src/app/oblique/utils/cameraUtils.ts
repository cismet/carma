import { type MutableRefObject } from "react";
import {
  BoundingSphere,
  EasingFunction,
  HeadingPitchRange,
  Matrix4,
  PerspectiveFrustum,
  Ray,
  type Viewer,
} from "cesium";
import { cesiumAnimateFov, getOrbitPoint } from "@carma-mapping/cesium-engine";

const ENTER_DURATION = 1000;
const LEAVE_BASE_DURATION = 800;

export const resetCamera = (viewer: Viewer) => {
  viewer.camera.lookAtTransform(Matrix4.IDENTITY);
  viewer.scene.requestRender();
};

export const enterObliqueMode = (
  viewer: Viewer,
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
  originalFovRef: MutableRefObject<number | null>,
  leaveObliqueModeAnimationRef: MutableRefObject<(() => void) | null>,
  onComplete: () => void
) => {
  if (
    viewer.camera.frustum instanceof PerspectiveFrustum &&
    originalFovRef.current !== null
  ) {
    const currentFov = viewer.camera.frustum.fov || 1;
    const targetFov = originalFovRef.current || 1;

    if (leaveObliqueModeAnimationRef.current) {
      leaveObliqueModeAnimationRef.current();
      leaveObliqueModeAnimationRef.current = null;
    }

    if (currentFov === targetFov) {
      console.debug("No FOV change needed, skipping animation");
      onComplete();
      return;
    }

    const adaptiveLeaveDuration =
      LEAVE_BASE_DURATION * Math.abs(currentFov - targetFov);

    const leaveObliqueModeAnimation = cesiumAnimateFov({
      viewer,
      startFov: currentFov,
      targetFov,
      duration: adaptiveLeaveDuration,
      easingFunction: EasingFunction.SINUSOIDAL_IN_OUT,
      onComplete: () => {
        leaveObliqueModeAnimationRef.current = null; // Ensure cleanup after animation completes
        onComplete();
      },
    });

    leaveObliqueModeAnimationRef.current = leaveObliqueModeAnimation;
  } else {
    // If no animation is needed, directly reset the FOV and invoke the onComplete callback
    if (viewer.camera.frustum instanceof PerspectiveFrustum) {
      viewer.camera.frustum.fov =
        originalFovRef.current || viewer.camera.frustum.fov;
    }
    onComplete();
  }
};
