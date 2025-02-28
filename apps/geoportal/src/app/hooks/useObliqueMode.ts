import { useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import {
  BoundingSphere,
  HeadingPitchRange,
  PerspectiveFrustum,
  Cartesian3,
  Viewer,
  EasingFunction,
  Matrix4,
  Ray,
} from "cesium";
import { useCesiumContext, getOrbitPoint } from "@carma-mapping/cesium-engine";

import { getObliqueMode } from "../store/slices/ui";

type ObliqueModeOptions = {
  fixedPitch?: number;
  fixedHeight?: number;
  minFov?: number;
  maxFov?: number;
  headingOffset?: number;
};

const defaultOptions: ObliqueModeOptions = {
  fixedHeight: 1000,
  fixedPitch: -Math.PI / 4,
  maxFov: Math.PI / 2,
  minFov: Math.PI / 60,
  headingOffset: 0,
};

const preUpdateCallback = (
  viewer: Viewer,
  fixedPitch: number,
  fixedHeight: number
) => {
  const currentPosition = viewer.camera.position;
  const ellipsoid = viewer.scene.globe.ellipsoid;
  const currentCartographic =
    ellipsoid.cartesianToCartographic(currentPosition);
  const currentPitch = viewer.camera.pitch;

  const heightDifference = Math.abs(currentCartographic.height - fixedHeight);
  const pitchDifference = Math.abs(currentPitch - fixedPitch);

  if (pitchDifference > 0.03 || heightDifference > 5.0) {
    const longitude = currentCartographic.longitude;
    const latitude = currentCartographic.latitude;

    const fixedPosition = Cartesian3.fromRadians(
      longitude,
      latitude,
      fixedHeight
    );

    const distance = Cartesian3.distance(fixedPosition, viewer.camera.position);

    if (distance > 10000) {
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
      cancelAnimationFrame(animationFrameId);
      return;
    }

    const elapsed = timestamp - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = easingFunction(progress);
    const newFov = startFov + easedProgress * (targetFov - startFov);

    viewer.camera.frustum.fov = newFov;
    viewer.scene.requestRender();

    if (progress < 1) {
      animationFrameId = requestAnimationFrame(animate);
    } else {
      viewer.camera.lookAtTransform(Matrix4.IDENTITY);
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
    }
  };
};

export function useObliqueMode(options: ObliqueModeOptions = {}) {
  const { fixedPitch, fixedHeight, minFov, maxFov, headingOffset } = {
    ...defaultOptions,
    ...options,
  };

  const isObliqueMode = useSelector(getObliqueMode);
  const { viewerRef } = useCesiumContext();
  const originalFovRef = useRef<number | null>(null);
  const fovAnimationCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let wheelCleanupFn: (() => void) | undefined;
    let cameraPreUpdateRemoveCallback: (() => void) | undefined;

    if (viewerRef.current) {
      const viewer = viewerRef.current;

      const cameraController = viewer.scene.screenSpaceCameraController;
      cameraController.enableZoom = !isObliqueMode;
      cameraController.enableRotate = true;
      cameraController.enableTilt = true;
      cameraController.enableTranslate = true;

      if (isObliqueMode) {
        if (viewer.camera.frustum instanceof PerspectiveFrustum) {
          originalFovRef.current = viewer.camera.frustum.fov;
        }

        const center = getOrbitPoint(viewer);
        const range = fixedHeight / Math.tan(-fixedPitch);

        // Setup wheel handler first
        const handleWheel = (event: WheelEvent) => {
          event.preventDefault();

          if (!(viewer.camera.frustum instanceof PerspectiveFrustum)) {
            return;
          }

          const currentFov = viewer.camera.frustum.fov;
          const baseSensitivity = 0.002;
          const zoomingOut = event.deltaY > 0;

          let adaptiveSensitivity;
          if (zoomingOut) {
            const fovRatio = Math.min(maxFov / currentFov, 4);
            adaptiveSensitivity = baseSensitivity * fovRatio;
          } else {
            adaptiveSensitivity =
              baseSensitivity * Math.max(0.8, currentFov / (Math.PI / 4));
          }

          const delta = event.deltaY * adaptiveSensitivity;
          const newFovTarget = currentFov * (1 + delta);

          const targetFov = Math.max(minFov, Math.min(newFovTarget, maxFov));

          if (fovAnimationCleanupRef.current) {
            fovAnimationCleanupRef.current();
          }

          fovAnimationCleanupRef.current = animateFov({
            viewer,
            startFov: currentFov,
            targetFov,
            duration: 500,
            easingFunction: EasingFunction.SINUSOIDAL_OUT,
          });
        };

        const container = viewer.container;
        if (container) {
          container.addEventListener("wheel", handleWheel, { passive: false });

          wheelCleanupFn = () => {
            container.removeEventListener("wheel", handleWheel);
          };
        }

        // Animation first, only add preUpdateCallback after animation completes
        const sphere = new BoundingSphere(center, range);
        viewer.camera.flyToBoundingSphere(sphere, {
          offset: new HeadingPitchRange(
            viewer.camera.heading,
            fixedPitch,
            range
          ),
          duration: 1,
          complete: function () {
            // After the flyTo animation, we need to adjust the camera position to be exactly at fixedHeight
            // Get the ray from camera to center point
            const ray = new Ray(
              viewer.camera.position,
              viewer.camera.direction
            );
            // Calculate the distance to move along this ray to get to the desired height
            // First, get current camera height above ellipsoid
            const currentHeight =
              viewer.scene.globe.ellipsoid.cartesianToCartographic(
                viewer.camera.position
              ).height;
            // Calculate how far we need to move to achieve fixedHeight
            const heightDifference = fixedHeight - currentHeight;
            // If there's a significant difference, adjust the camera position
            if (Math.abs(heightDifference) > 1) {
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
                  const callback = () =>
                    preUpdateCallback(viewer, fixedPitch, fixedHeight);
                  viewer.scene.preUpdate.addEventListener(callback);

                  cameraPreUpdateRemoveCallback = () => {
                    viewer.scene.preUpdate.removeEventListener(callback);
                  };

                  viewer.scene.requestRender();
                },
              });
            }
            // After the position adjustment, now add the constraint callback
          },
        });
      } else {
        // Clean up preUpdateCallback when leaving oblique mode
        if (cameraPreUpdateRemoveCallback) {
          cameraPreUpdateRemoveCallback();
        }

        if (
          viewer.camera.frustum instanceof PerspectiveFrustum &&
          originalFovRef.current !== null
        ) {
          const currentFov = viewer.camera.frustum.fov;
          const targetFov = originalFovRef.current;

          // Clean up any existing animation
          if (fovAnimationCleanupRef.current) {
            fovAnimationCleanupRef.current();
          }

          // Animate back to original FOV
          fovAnimationCleanupRef.current = animateFov({
            viewer,
            startFov: currentFov,
            targetFov,
            duration: 300,
            easingFunction: EasingFunction.SINUSOIDAL_IN_OUT,
          });
        }
      }
    }

    return () => {
      if (wheelCleanupFn) {
        wheelCleanupFn();
      }

      // Clean up any FOV animations
      if (fovAnimationCleanupRef.current) {
        fovAnimationCleanupRef.current();
        fovAnimationCleanupRef.current = null;
      }

      if (cameraPreUpdateRemoveCallback) {
        cameraPreUpdateRemoveCallback();
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
}

export default useObliqueMode;
