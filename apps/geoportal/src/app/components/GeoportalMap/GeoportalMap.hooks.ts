import { useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import {
  BoundingSphere,
  HeadingPitchRange,
  PerspectiveFrustum,
  Cartesian3,
  Viewer,
  EasingFunction,
} from "cesium";
import { useCesiumContext, getOrbitPoint } from "@carma-mapping/cesium-engine";

import { getObliqueMode } from "../../store/slices/ui";

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
  // Get current camera state
  const currentPosition = viewer.camera.position;
  const ellipsoid = viewer.scene.globe.ellipsoid;
  const currentCartographic =
    ellipsoid.cartesianToCartographic(currentPosition);
  const currentPitch = viewer.camera.pitch;

  // Check if pitch or height has changed significantly
  // Use a larger threshold for height to allow smoother rotation
  const heightDifference = Math.abs(currentCartographic.height - fixedHeight);
  const pitchDifference = Math.abs(currentPitch - fixedPitch);

  // Only correct if significantly off-target (more tolerant thresholds)
  // This allows smoother rotation while still maintaining general constraints
  if (pitchDifference > 0.03 || heightDifference > 5.0) {
    // Get current position in lat/lon
    const longitude = currentCartographic.longitude;
    const latitude = currentCartographic.latitude;

    // Create a new position at the same lat/lon but with fixed height
    const fixedPosition = Cartesian3.fromRadians(
      longitude,
      latitude,
      fixedHeight
    );

    // Update camera position and orientation
    // Use setView with preservePositionHeightOnly to maintain rotation
    viewer.camera.setView({
      destination: fixedPosition,
      orientation: {
        heading: viewer.camera.heading, // Keep current heading for rotation
        pitch: fixedPitch, // Force target pitch
        roll: 0,
      },
    });
  }
};

export function useObliqueMode(options: ObliqueModeOptions = {}) {
  const { fixedPitch, fixedHeight, minFov, maxFov, headingOffset } = {
    ...defaultOptions,
    ...options,
  };

  const isObliqueMode = useSelector(getObliqueMode);
  const { viewerRef } = useCesiumContext();
  const originalFovRef = useRef<number | null>(null);

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

        viewer.camera.flyToBoundingSphere(
          new BoundingSphere(center, fixedHeight),
          {
            offset: new HeadingPitchRange(
              viewer.camera.heading,
              fixedPitch,
              range
            ),
            duration: 2,
          }
        );

        const handleWheel = (event: WheelEvent) => {
          event.preventDefault();

          if (!(viewer.camera.frustum instanceof PerspectiveFrustum)) {
            return;
          }
          const currentFov = viewer.camera.frustum.fov;

          const sensitivity = 0.002;
          const newFov = currentFov * (1 + event.deltaY * sensitivity);

          const clampedFov = Math.max(minFov, Math.min(newFov, maxFov));

          // Set the new FOV
          if (viewer.camera.frustum.fov !== clampedFov) {
            viewer.camera.frustum.fov = clampedFov;
          }
        };

        const container = viewer.container;
        if (container) {
          container.addEventListener("wheel", handleWheel, { passive: false });

          wheelCleanupFn = () => {
            container.removeEventListener("wheel", handleWheel);
          };
        }

        const callback = () =>
          preUpdateCallback(viewer, fixedPitch, fixedHeight);

        viewer.scene.preUpdate.addEventListener(callback);

        cameraPreUpdateRemoveCallback = () => {
          viewer.scene.preUpdate.removeEventListener(callback);
        };
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
          const duration = 300;
          const startTime = performance.now();

          let animationFrameId: number;

          const animateFov = (timestamp: number) => {
            const elapsed = timestamp - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easedProgress = EasingFunction.SINUSOIDAL_IN_OUT(progress);
            const newFov =
              currentFov + easedProgress * (targetFov - currentFov);

            if (viewer.camera.frustum instanceof PerspectiveFrustum) {
              viewer.camera.frustum.fov = newFov;
              viewer.scene.requestRender();
            }

            if (progress < 1) {
              animationFrameId = requestAnimationFrame(animateFov);
            }
          };

          animationFrameId = requestAnimationFrame(animateFov);

          // Add cleanup for animation if component unmounts during animation
          const existingCleanup = cameraPreUpdateRemoveCallback;
          cameraPreUpdateRemoveCallback = () => {
            if (existingCleanup) {
              existingCleanup();
            }
            if (animationFrameId) {
              cancelAnimationFrame(animationFrameId);
            }
          };
        }
      }
    }

    return () => {
      if (wheelCleanupFn) {
        wheelCleanupFn();
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
