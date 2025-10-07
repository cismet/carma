import { useCallback } from "react";

import { type Scene } from "cesium";

import { cesiumCameraForceOblique } from "../utils/cesiumCameraForceOblique";
import { sceneHasTweens } from "../utils/sceneHasTweens";
import { isValidScene, tryWithValidScene } from "../utils/instanceGates";

const scenePreUpdateHandlers = new WeakMap<Scene, (scene: Scene) => void>();

export function useCesiumCameraForceOblique(
  sceneRef: React.MutableRefObject<Scene | null>,
  fixedPitch: number,
  fixedHeight: number,
  shouldSuspendRef: React.MutableRefObject<boolean>
) {
  const enableCameraForceOblique = useCallback(() => {
    const scene = sceneRef.current;
    if (!isValidScene(scene)) return;

    const onPreUpdate = () => {
      !sceneHasTweens(scene) &&
        cesiumCameraForceOblique(
          scene,
          fixedPitch,
          fixedHeight,
          shouldSuspendRef
        );
    };

    if (!scenePreUpdateHandlers.has(scene)) {
      tryWithValidScene(scene, (scene) => {
        scene.preUpdate.addEventListener(onPreUpdate);
        scenePreUpdateHandlers.set(scene, onPreUpdate);
      });
    }
  }, [sceneRef, shouldSuspendRef, fixedPitch, fixedHeight]);

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
