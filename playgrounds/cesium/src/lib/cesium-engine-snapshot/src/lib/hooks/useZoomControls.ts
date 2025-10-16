import { useCallback } from "react";

import { useCesiumViewer } from "./useCesiumViewer";

const MOVERATE_FACTOR = 0.33;

export function useZoomControls(moveRateFactor: number = MOVERATE_FACTOR) {
  const viewer = useCesiumViewer();

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
