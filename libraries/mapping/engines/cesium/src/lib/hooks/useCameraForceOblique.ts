import { useCallback } from "react";

import { type Scene, type Viewer } from "cesium";

import { cesiumCameraForceOblique } from "../utils/cesiumCameraForceOblique";
import { cesiumSceneHasTweens } from "../utils/cesiumAnimations";

const viewerPreUpdateHandlers = new WeakMap<Viewer, (scene: Scene) => void>();

export function useCesiumCameraForceOblique(
  viewerRef: React.MutableRefObject<Viewer | null>,
  fixedPitch: number,
  fixedHeight: number
) {
  const enableCameraForceOblique = useCallback(() => {
    if (!viewerRef.current) return;

    const viewer = viewerRef.current;

    const onPreupdate = () => {
      !cesiumSceneHasTweens(viewer) &&
        cesiumCameraForceOblique(viewer, fixedPitch, fixedHeight);
    };

    if (!viewerPreUpdateHandlers.has(viewer)) {
      viewer.scene.preUpdate.addEventListener(onPreupdate);
      viewerPreUpdateHandlers.set(viewer, onPreupdate);
    }
  }, [viewerRef, fixedPitch, fixedHeight]);

  const disableCameraForceOblique = useCallback(() => {
    if (!viewerRef.current) return;

    const viewer = viewerRef.current;

    if (viewerPreUpdateHandlers.has(viewer)) {
      const handlerToRemove = viewerPreUpdateHandlers.get(viewer);
      viewer.scene.preUpdate.removeEventListener(handlerToRemove!);
      viewerPreUpdateHandlers.delete(viewer);
    }
  }, [viewerRef]);

  return { enableCameraForceOblique, disableCameraForceOblique };
}
