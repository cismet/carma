import { useCallback, useRef, type MutableRefObject } from "react";

import { readCesiumPrivateSceneTweens, type Scene } from "@carma-cesium";
import {
  cesiumCameraForceOblique,
  type CameraForceObliqueOptions,
} from "@carma-mapping/engines/cesium/core";

const scenePreUpdateHandlers = new WeakMap<Scene, (scene: Scene) => void>();

export function useCesiumCameraForceOblique(
  sceneRef: MutableRefObject<Scene | null>,
  options: CameraForceObliqueOptions,
  shouldSuspendRef: MutableRefObject<boolean>,
  checkExternalAnimations?: (scene: Scene) => boolean
) {
  const checkExternalAnimationsRef = useRef(checkExternalAnimations);
  checkExternalAnimationsRef.current = checkExternalAnimations;

  const enableCameraForceOblique = useCallback(() => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;

    const onPreupdate = () => {
      if (shouldSuspendRef.current) return;
      const isAnimating =
        (readCesiumPrivateSceneTweens(scene)?.length ?? 0) > 0 ||
        checkExternalAnimationsRef.current?.(scene);
      if (!isAnimating) {
        cesiumCameraForceOblique(scene, options);
      }
    };

    if (!scenePreUpdateHandlers.has(scene)) {
      scene.preUpdate.addEventListener(onPreupdate);
      scenePreUpdateHandlers.set(scene, onPreupdate);
    }
  }, [options, sceneRef, shouldSuspendRef]);

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
