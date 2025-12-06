import { useCallback } from "react";

import { type Scene } from "@carma/cesium";

import { cesiumCameraForceOblique } from "../utils/cesiumCameraForceOblique";
import { sceneHasTweens } from "../utils/sceneHasTweens";

const scenePreUpdateHandlers = new WeakMap<Scene, (scene: Scene) => void>();

export function useCesiumCameraForceOblique(
  sceneRef: React.MutableRefObject<Scene | null>,
  fixedPitch: number,
  fixedHeight: number,
  shouldSuspendRef: React.MutableRefObject<boolean>,
  checkExternalAnimations?: (scene: Scene) => boolean
) {
  const enableCameraForceOblique = useCallback(() => {
    if (!sceneRef.current) return;

    const scene = sceneRef.current;

    const onPreupdate = () => {
      const isAnimating =
        sceneHasTweens(scene) || checkExternalAnimations?.(scene);
      !isAnimating &&
        cesiumCameraForceOblique(
          scene,
          fixedPitch,
          fixedHeight,
          shouldSuspendRef
        );
    };

    if (!scenePreUpdateHandlers.has(scene)) {
      scene.preUpdate.addEventListener(onPreupdate);
      scenePreUpdateHandlers.set(scene, onPreupdate);
    }
  }, [
    sceneRef,
    shouldSuspendRef,
    fixedPitch,
    fixedHeight,
    checkExternalAnimations,
  ]);

  const disableCameraForceOblique = useCallback(() => {
    if (!sceneRef.current) return;

    const scene = sceneRef.current;

    if (scenePreUpdateHandlers.has(scene)) {
      const handlerToRemove = scenePreUpdateHandlers.get(scene);
      scene.preUpdate.removeEventListener(handlerToRemove!);
      scenePreUpdateHandlers.delete(scene);
    }
  }, [sceneRef]);

  return { enableCameraForceOblique, disableCameraForceOblique };
}
