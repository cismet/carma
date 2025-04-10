import { useEffect, useMemo, useRef } from "react";
import { useSelector } from "react-redux";

import {
  BoundingSphere,
  Cartesian3,
  EasingFunction,
  HeadingPitchRange,
  Math as CesiumMath,
  PerspectiveFrustum,
  Ray,
  Viewer,
} from "cesium";

import {
  cesiumAnimateFov,
  getOrbitPoint,
  useCesiumContext,
  useFovWheelZoom,
} from "@carma-mapping/cesium-engine";

import { getObliqueMode } from "../../store/slices/ui";
import { useObliqueDataContext } from "./useObliqueDataContext";

const PITCH_TOLERANCE_THRESHOLD = CesiumMath.toRadians(10);
const HEIGHT_TOLERANCE_THRESHOLD = 150.0;

const VALID_CORRECTION_DISTANCE_THRESHOLD = 10000.0;
const FOV_ZOOM_WHEEL_CHANGE_RATE = 0.01;

// Options for local overrides
export interface ObliqueModeOptions {
  fixedPitch?: number;
  fixedHeight?: number;
  minFov?: number;
  maxFov?: number;
  headingOffset?: number;
}

const preUpdateCallback = (
  viewer: Viewer,
  fixedPitch: number,
  fixedHeight: number
) => {
  // Safety checks for viewer and its components
  if (!viewer || !viewer.scene || !viewer.scene.globe || !viewer.camera) {
    return;
  }

  const currentPosition = viewer.camera.position;
  const ellipsoid = viewer.scene.globe.ellipsoid;

  // Handle potential null from cartesianToCartographic
  const currentCartographic =
    ellipsoid.cartesianToCartographic(currentPosition);
  if (!currentCartographic) {
    return;
  }

  const currentPitch = viewer.camera.pitch;

  const heightDifference = Math.abs(currentCartographic.height - fixedHeight);
  const pitchDifference = Math.abs(currentPitch - fixedPitch);

  const shouldPitchCorrect = pitchDifference > PITCH_TOLERANCE_THRESHOLD;
  const shouldHeightCorrect = heightDifference > HEIGHT_TOLERANCE_THRESHOLD;

  if (shouldPitchCorrect || shouldHeightCorrect) {
    const longitude = currentCartographic.longitude;
    const latitude = currentCartographic.latitude;

    const fixedPosition = Cartesian3.fromRadians(
      longitude,
      latitude,
      fixedHeight
    );

    const distance = Cartesian3.distance(fixedPosition, viewer.camera.position);

    if (distance > VALID_CORRECTION_DISTANCE_THRESHOLD) {
      console.warn(distance, "Target position is too far away, aborting");
      return;
    }

    viewer.camera.setView({
      destination: fixedPosition,
      orientation: {
        heading: viewer.camera.heading,
        pitch: fixedPitch,
        roll: 0,
      },
    });
  }
};

export function useObliqueMode(options: ObliqueModeOptions = {}) {
  // Get options from context and merge with any locally provided options
  const contextOptions = useObliqueDataContext();
  const fixedPitch = options.fixedPitch ?? contextOptions.fixedPitch;
  const fixedHeight = options.fixedHeight ?? contextOptions.fixedHeight;
  const minFov = options.minFov ?? contextOptions.minFov;
  const maxFov = options.maxFov ?? contextOptions.maxFov;
  const headingOffset = options.headingOffset ?? contextOptions.headingOffset;

  const isObliqueMode = useSelector(getObliqueMode);
  const { viewerRef } = useCesiumContext();
  const originalFovRef = useRef<number | null>(null);

  // Store callback reference for cleanup
  const preUpdateCallbackFnRef = useRef<((scene: any) => void) | null>(null);
  const fovAnimationCleanupRef = useRef<(() => void) | null>(null);

  // Use the shared context to get oblique data
  const {
    nearestImage,
    distanceToNearestImage,
    refreshNearestImageSearch,
    converter,
  } = useObliqueDataContext();

  const wheelZoomOptions = useMemo(
    () => ({
      minFov,
      maxFov,
      fovChangeRate: FOV_ZOOM_WHEEL_CHANGE_RATE,
      enabled: isObliqueMode,
    }),
    [minFov, maxFov, isObliqueMode]
  );

  const { setEnabled: setWheelZoomEnabled } = useFovWheelZoom(
    viewerRef,
    wheelZoomOptions
  );

  useEffect(() => {
    if (!viewerRef.current) {
      return;
    }

    const viewer = viewerRef.current;
    const cameraController = viewer.scene.screenSpaceCameraController;

    let preUpdateCallbackFn: ((scene: any) => void) | null = null;
    let fovAnimationCleanup: (() => void) | null = null;

    if (preUpdateCallbackFnRef.current) {
      viewer.scene.preUpdate.removeEventListener(
        preUpdateCallbackFnRef.current
      );
      preUpdateCallbackFnRef.current = null;
    }

    if (fovAnimationCleanupRef.current) {
      fovAnimationCleanupRef.current();
      fovAnimationCleanupRef.current = null;
    }

    cameraController.enableRotate = true;
    cameraController.enableTilt = true;
    cameraController.enableTranslate = true;

    // Enable or disable wheel zoom based on oblique mode state
    setWheelZoomEnabled(isObliqueMode);

    if (isObliqueMode) {
      if (viewer.camera.frustum instanceof PerspectiveFrustum) {
        originalFovRef.current = viewer.camera.frustum.fov;
      }

      const center = getOrbitPoint(viewer);
      const range =
        viewer.camera.positionCartographic.height / Math.tan(-fixedPitch);

      // Animation first, only add preUpdateCallback after animation completes
      const sphere = new BoundingSphere(center, range);

      // Define preUpdateCallbackFn here as a local constant so we can reference
      // the exact same function in both setup and cleanup
      preUpdateCallbackFn = () =>
        preUpdateCallback(viewer, fixedPitch, fixedHeight);

      const flightCompleteCallback = () => {
        // After the flyTo animation, we need to adjust the camera position to be exactly at fixedHeight
        // Get the ray from camera to center point
        const ray = new Ray(viewer.camera.position, viewer.camera.direction);

        // Calculate the distance to move along this ray to get to the desired height
        // First, get current camera height above ellipsoid
        const currentCartographic =
          viewer.scene.globe.ellipsoid.cartesianToCartographic(
            viewer.camera.position
          );

        if (!currentCartographic) {
          console.debug("Failed to get cartographic position");
          return;
        }

        const currentHeight = currentCartographic.height;

        // Calculate how far we need to move to achieve fixedHeight
        const heightDifference = fixedHeight - currentHeight;

        // If there's a significant difference, adjust the camera position
        if (Math.abs(heightDifference) > 100) {
          // Create a new position by moving along the ray
          // If we need to move up (heightDifference is positive), move backward
          // If we need to move down (heightDifference is negative), move forward
          const distanceToMove = heightDifference / Math.sin(-fixedPitch);
          const newPosition = Ray.getPoint(ray, -distanceToMove);

          viewer.camera.flyTo({
            destination: newPosition,
            orientation: {
              heading: viewer.camera.heading,
              pitch: fixedPitch,
              roll: 0,
            },
            duration: 0.5,
            complete: function () {
              // Store the reference to ensure we remove exactly this function later
              preUpdateCallbackFnRef.current = preUpdateCallbackFn;
              viewer.scene.preUpdate.addEventListener(preUpdateCallbackFn);

              viewer.scene.requestRender();
            },
          });
        } else {
          // No need for an additional flight, just add the callback
          // Store the reference to ensure we remove exactly this function later
          preUpdateCallbackFnRef.current = preUpdateCallbackFn;
          viewer.scene.preUpdate.addEventListener(preUpdateCallbackFn);
        }
      };

      viewer.camera.flyToBoundingSphere(sphere, {
        offset: new HeadingPitchRange(viewer.camera.heading, fixedPitch, range),
        duration: 1,
        complete: flightCompleteCallback,
      });
    } else {
      // Non-oblique mode
      if (
        viewer.camera.frustum instanceof PerspectiveFrustum &&
        originalFovRef.current !== null
      ) {
        const currentFov = viewer.camera.frustum.fov;
        const targetFov = originalFovRef.current;

        // Clean up any existing animation
        if (fovAnimationCleanupRef.current) {
          fovAnimationCleanupRef.current();
          fovAnimationCleanupRef.current = null;
        }

        // Animate back to original FOV
        fovAnimationCleanup = cesiumAnimateFov({
          viewer,
          startFov: currentFov,
          targetFov,
          duration: 300,
          easingFunction: EasingFunction.SINUSOIDAL_IN_OUT,
        });

        // Store the cleanup function
        fovAnimationCleanupRef.current = fovAnimationCleanup;
      }
    }

    return () => {
      // Clean up all event listeners
      if (preUpdateCallbackFn) {
        viewer.scene.preUpdate.removeEventListener(preUpdateCallbackFn);
        preUpdateCallbackFnRef.current = null;
      }

      if (fovAnimationCleanup) {
        fovAnimationCleanup();
      }
      setWheelZoomEnabled(false);
    };
  }, [
    isObliqueMode,
    viewerRef,
    fixedPitch,
    fixedHeight,
    minFov,
    maxFov,
    headingOffset,
    setWheelZoomEnabled,
  ]);

  return {
    isObliqueMode,
    nearestImage,
    distanceToNearestImage,
    refreshNearestImageSearch,
    converter,
  };
}

export default useObliqueMode;
