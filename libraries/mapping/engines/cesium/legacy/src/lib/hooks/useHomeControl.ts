import { useCallback } from "react";

import { BoundingSphere, Cartesian3 } from "cesium";

import { useCesiumViewer } from "./useCesiumViewer";

/**
 * Hook to fly camera to home position
 * @param homePosition - The home position to fly to (Cartesian3)
 */
export const useHomeControl = (homePosition?: Cartesian3 | null) => {
  const viewer = useCesiumViewer();

  const handleHomeClick = useCallback(() => {
    console.debug("homePos click", homePosition, viewer);
    if (viewer && homePosition) {
      const boundingSphere = new BoundingSphere(homePosition, 400);
      console.debug("HOOK: [2D3D|CESIUM|CAMERA] homeClick");
      viewer.camera.flyToBoundingSphere(boundingSphere);
    }
  }, [viewer, homePosition]);

  return handleHomeClick;
};
