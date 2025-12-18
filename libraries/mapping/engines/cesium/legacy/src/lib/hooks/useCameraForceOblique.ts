import { useCallback, useRef } from "react";

import { type Scene } from "@carma/cesium";

import {
  cesiumCameraForceOblique,
  testCameraObliqueCompliant,
  type CameraForceObliqueOptions,
} from "../utils/cesiumCameraForceOblique";
export { testCameraObliqueCompliant };
import { sceneHasTweens } from "../utils/sceneHasTweens";

export type { CameraForceObliqueOptions };

const scenePreUpdateHandlers = new WeakMap<Scene, (scene: Scene) => void>();

export function useCesiumCameraForceOblique(
  sceneRef: React.MutableRefObject<Scene | null>,
  options: CameraForceObliqueOptions,
  shouldSuspendRef: React.MutableRefObject<boolean>,
  checkExternalAnimations?: (scene: Scene) => boolean
) {
  // Use ref to avoid stale closure - callback can change when isTransitioning changes
  const checkExternalAnimationsRef = useRef(checkExternalAnimations);
  checkExternalAnimationsRef.current = checkExternalAnimations;

  const enableCameraForceOblique = useCallback(() => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;

    const onPreupdate = () => {
      if (shouldSuspendRef.current) return;
      const isAnimating =
        sceneHasTweens(scene) || checkExternalAnimationsRef.current?.(scene);
      if (!isAnimating) {
        cesiumCameraForceOblique(scene, options);
      }
    };

    if (!scenePreUpdateHandlers.has(scene)) {
      scene.preUpdate.addEventListener(onPreupdate);
      scenePreUpdateHandlers.set(scene, onPreupdate);
    }
  }, [sceneRef, shouldSuspendRef, options]);

  const disableCameraForceOblique = useCallback(() => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;

    if (scenePreUpdateHandlers.has(scene)) {
      const handlerToRemove = scenePreUpdateHandlers.get(scene);
      scene.preUpdate.removeEventListener(handlerToRemove!);
      scenePreUpdateHandlers.delete(scene);
    }
  }, [sceneRef]);

  return {
    enableCameraForceOblique,
    disableCameraForceOblique,
    options,
  };
}
