import { useCallback } from "react";

import { type Scene, type Viewer } from "cesium";

import { cesiumCameraForceOblique } from "../utils/cesiumCameraForceOblique";

const viewerPreUpdateHandlers = new WeakMap<Viewer, (scene: Scene) => void>();

export function useCesiumCameraForceOblique(
  viewer: Viewer | undefined,
  fixedPitch: number,
  fixedHeight: number
) {
  const enableCameraForceOblique = useCallback(() => {
    if (!viewer) return;

    const onPreupdate = () => {
      cesiumCameraForceOblique(viewer, fixedPitch, fixedHeight);
    };

    if (!viewerPreUpdateHandlers.has(viewer)) {
      viewer.scene.preUpdate.addEventListener(onPreupdate);
      viewerPreUpdateHandlers.set(viewer, onPreupdate);
    }
  }, [viewer, fixedPitch, fixedHeight]);

  const disableCameraForceOblique = useCallback(() => {
    if (!viewer) return;

    if (viewerPreUpdateHandlers.has(viewer)) {
      const handlerToRemove = viewerPreUpdateHandlers.get(viewer);
      viewer.scene.preUpdate.removeEventListener(handlerToRemove!);
      viewerPreUpdateHandlers.delete(viewer);
    }
  }, [viewer]);

  return { enableCameraForceOblique, disableCameraForceOblique };
}
