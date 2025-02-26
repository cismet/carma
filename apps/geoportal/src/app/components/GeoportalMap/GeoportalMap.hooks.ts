import { useEffect } from "react";
import { useSelector } from "react-redux";
import { BoundingSphere, HeadingPitchRange, PerspectiveFrustum } from "cesium";
import { useCesiumContext, getOrbitPoint } from "@carma-mapping/cesium-engine";

import { getObliqueMode } from "../../store/slices/ui";

export function useObliqueMode() {
  const isObliqueMode = useSelector(getObliqueMode);
  const { viewerRef } = useCesiumContext();

  useEffect(() => {
    let wheelCleanupFn: (() => void) | undefined;

    if (viewerRef.current) {
      const viewer = viewerRef.current;

      if (isObliqueMode) {
        const center = getOrbitPoint(viewer);

        const targetPitch = -Math.PI / 4; // 45 degrees down from horizontal

        const adjustedPitch = Math.max(targetPitch, -Math.PI / 2 + 0.01);
        const heightAboveGround = 1000; // meters
        const range = heightAboveGround / Math.tan(-adjustedPitch);

        viewer.camera.flyToBoundingSphere(new BoundingSphere(center, 1000), {
          offset: new HeadingPitchRange(
            viewer.camera.heading,
            targetPitch,
            range
          ),
          duration: 2,
        });

        // Disable camera tilt by locking the camera controller
        // TODO find workaround for tilt locking everything.
        viewer.scene.screenSpaceCameraController.enableTilt = false;
        viewer.scene.screenSpaceCameraController.enableRotate = true;
        viewer.scene.screenSpaceCameraController.enableZoom = false;

        // Add mouse wheel event listener to control FOV
        const handleWheel = (event: WheelEvent) => {
          event.preventDefault();

          if (!(viewer.camera.frustum instanceof PerspectiveFrustum)) {
            return;
          }
          const currentFov = viewer.camera.frustum.fov;

          const sensitivity = 0.002;
          const newFov = currentFov * (1 + event.deltaY * sensitivity);

          const minFov = Math.PI / 60; // 6 degrees
          const maxFov = Math.PI / 2; // 90 degrees
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
      } else {
        // Re-enable camera tilt and zoom when not in oblique mode
        viewer.scene.screenSpaceCameraController.enableTilt = true;
        viewer.scene.screenSpaceCameraController.enableZoom = true;
        viewer.scene.screenSpaceCameraController.enableRotate = true;
        viewer.scene.screenSpaceCameraController.enableTranslate = true;
        if (viewer.camera.frustum instanceof PerspectiveFrustum) {
          viewer.camera.frustum.fov = Math.PI / 3;
        }
      }
    }

    return wheelCleanupFn;
  }, [isObliqueMode, viewerRef]);
}

export default useObliqueMode;
