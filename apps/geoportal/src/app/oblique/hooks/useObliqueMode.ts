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
import { useEffect, useRef } from "react";
import { useSelector } from "react-redux";

import { getOrbitPoint, useCesiumContext } from "@carma-mapping/cesium-engine";

import { getObliqueMode } from "../../store/slices/ui";
import { resetCamera } from "../utils/cameraUtils";
import { useObliqueDataContext } from "./useObliqueDataContext";

const PITCH_TOLERANCE_THRESHOLD = CesiumMath.toRadians(10);
const HEIGHT_TOLERANCE_THRESHOLD = 150.0;

const VALID_CORRECTION_DISTANCE_THRESHOLD = 10000.0;

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

interface AnimateFovOptions {
  viewer: Viewer;
  startFov: number;
  targetFov: number;
  duration?: number;
  easingFunction?: (time: number) => number;
  onComplete?: () => void;
}

const animateFov = ({
  viewer,
  startFov,
  targetFov,
  duration = 300,
  easingFunction = EasingFunction.SINUSOIDAL_IN_OUT,
  onComplete,
}: AnimateFovOptions): (() => void) => {
  const startTime = performance.now();
  let animationFrameId: number;

  const animate = (timestamp: number) => {
    if (!(viewer.camera.frustum instanceof PerspectiveFrustum)) {
      resetCamera(viewer);
      return;
    }

    const elapsed = timestamp - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = easingFunction(progress);
    const newFov = startFov + easedProgress * (targetFov - startFov);

    viewer.camera.frustum.fov = newFov;

    if (progress < 1) {
      animationFrameId = requestAnimationFrame(animate);
    } else {
      resetCamera(viewer);
      if (onComplete) {
        onComplete();
      }
    }
  };

  animationFrameId = requestAnimationFrame(animate);

  // Return cleanup function
  return () => {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      resetCamera(viewer);
    }
  };
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

  // Store all callback references to ensure proper cleanup
  const wheelEventHandlerRef = useRef<((event: WheelEvent) => void) | null>(
    null
  );
  const preUpdateCallbackFnRef = useRef<((scene: any) => void) | null>(null);
  const fovAnimationCleanupRef = useRef<(() => void) | null>(null);

  // Use the shared context to get oblique data
  const {
    nearestImage,
    distanceToNearestImage,
    refreshNearestImageSearch,
    converter,
  } = useObliqueDataContext();

  useEffect(() => {
    if (!viewerRef.current) {
      return;
    }

    const viewer = viewerRef.current;
    const cameraController = viewer.scene.screenSpaceCameraController;

    // Define all event handlers as local constants
    let wheelEventHandler: ((event: WheelEvent) => void) | null = null;
    let preUpdateCallbackFn: ((scene: any) => void) | null = null;
    let fovAnimationCleanup: (() => void) | null = null;

    // Clean up any existing event handlers from previous renders
    // Do this immediately to prevent stale event handlers
    if (wheelEventHandlerRef.current) {
      viewer.canvas.removeEventListener("wheel", wheelEventHandlerRef.current);
      wheelEventHandlerRef.current = null;
    }

    if (preUpdateCallbackFnRef.current) {
      viewer.scene.preUpdate.removeEventListener(
        preUpdateCallbackFnRef.current
      );
      preUpdateCallbackFnRef.current = null;
    }

    // Clean up any animation callbacks immediately
    if (fovAnimationCleanupRef.current) {
      fovAnimationCleanupRef.current();
      fovAnimationCleanupRef.current = null;
    }

    cameraController.enableZoom = !isObliqueMode;
    cameraController.enableRotate = true;
    cameraController.enableTilt = true;
    cameraController.enableTranslate = true;

    if (isObliqueMode) {
      if (viewer.camera.frustum instanceof PerspectiveFrustum) {
        originalFovRef.current = viewer.camera.frustum.fov;
      }

      const center = getOrbitPoint(viewer);
      const range =
        viewer.camera.positionCartographic.height / Math.tan(-fixedPitch);

      // Define wheel handler as a local constant
      wheelEventHandler = (event: WheelEvent) => {
        event.preventDefault();

        if (!(viewer.camera.frustum instanceof PerspectiveFrustum)) {
          return;
        }

        const currentFov = viewer.camera.frustum.fov;
        const baseSensitivity = 0.002;
        const zoomingOut = event.deltaY > 0;

        let adaptiveSensitivity;
        if (zoomingOut) {
          // When zooming out, sensitivity decreases as we approach maxFov
          const remainingRange = maxFov - currentFov;
          adaptiveSensitivity =
            baseSensitivity * (remainingRange / (maxFov - minFov));
        } else {
          // When zooming in, sensitivity decreases as we approach minFov
          const remainingRange = currentFov - minFov;
          adaptiveSensitivity =
            baseSensitivity * (remainingRange / (maxFov - minFov));
        }

        const delta = event.deltaY * adaptiveSensitivity;
        let newFov = currentFov + delta;

        // Clamp to min/max FOV
        newFov = Math.max(minFov, Math.min(maxFov, newFov));

        // Only update if there's a meaningful change
        if (Math.abs(newFov - currentFov) > 0.0001) {
          viewer.camera.frustum.fov = newFov;
        }
      };

      // Store the handler in the ref and add the event listener
      wheelEventHandlerRef.current = wheelEventHandler;
      viewer.canvas.addEventListener("wheel", wheelEventHandler, {
        passive: false,
      });

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
        fovAnimationCleanup = animateFov({
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
      // Clean up all event listeners using local constants
      if (wheelEventHandler) {
        viewer.canvas.removeEventListener("wheel", wheelEventHandler);
        wheelEventHandlerRef.current = null;
      }

      if (preUpdateCallbackFn) {
        viewer.scene.preUpdate.removeEventListener(preUpdateCallbackFn);
        preUpdateCallbackFnRef.current = null;
      }

      if (fovAnimationCleanup) {
        fovAnimationCleanup();
      }
    };
  }, [
    isObliqueMode,
    viewerRef,
    fixedPitch,
    fixedHeight,
    minFov,
    maxFov,
    headingOffset,
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
