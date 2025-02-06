import { useCallback } from "react";

import { Viewer } from "cesium";

const MOVERATE_FACTOR = 0.33;

/**
 * @param viewerRef - reference to the Cesium Viewer component
 * @param moveRateFactor - The factor by which the camera's default zoom/moveRate increment be amplified by.
 */

export function useZoomControls(
  viewerRef: React.MutableRefObject<Viewer | null>,
  moveRateFactor = MOVERATE_FACTOR
) {
  const viewer = viewerRef.current;

  const handleZoomIn = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      if (!viewer) return;
      const scene = viewer.scene;
      const camera = viewer.camera;
      const ellipsoid = scene.globe.ellipsoid;

      const cameraHeight = ellipsoid.cartesianToCartographic(
        camera.position
      ).height;
      const moveRate = cameraHeight * moveRateFactor;
      camera.moveForward(moveRate);
    },
    [viewer, moveRateFactor]
  );

  const handleZoomOut = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      if (!viewer) return;
      const scene = viewer.scene;
      const camera = viewer.camera;
      const ellipsoid = scene.globe.ellipsoid;

      const cameraHeight = ellipsoid.cartesianToCartographic(
        camera.position
      ).height;
      const moveRate = cameraHeight * moveRateFactor;
      camera.moveBackward(moveRate);
    },
    [viewer, moveRateFactor]
  );

  return { handleZoomIn, handleZoomOut };
}
