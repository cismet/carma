import { useCallback } from "react";

import { type Scene } from "cesium";
import type { CesiumWidget } from "../CesiumContext";

import { cesiumCameraForceOblique } from "../utils/cesiumCameraForceOblique";
import { sceneHasTweens } from "../utils/sceneHasTweens";
import { CesiumContext } from "../CesiumContext";

const preUpdateHandlers = new WeakMap<CesiumWidget, (scene: Scene) => void>();

export function useCesiumCameraForceOblique(
  ctx: CesiumContextType,
  fixedPitch: number,
  fixedHeight: number,
  shouldSuspendRef: React.MutableRefObject<boolean>
) {
  const enableCameraForceOblique = useCallback(() => {
    const onPreupdate = () => {
      ctx.withScene((scene) => {
        !sceneHasTweens(scene) &&
          cesiumCameraForceOblique(
            ctx,
            fixedPitch,
            fixedHeight,
            shouldSuspendRef
          );
      });
    };

    ctx.withScene((scene) => {
      if (!preUpdateHandlers.has(scene)) {
        scene.preUpdate.addEventListener(onPreupdate);
        preUpdateHandlers.set(scene, onPreupdate);
      }
    });
  }, [ctx, shouldSuspendRef, fixedPitch, fixedHeight]);

  const disableCameraForceOblique = useCallback(() => {
    ctx.withScene((scene) => {
      if (preUpdateHandlers.has(scene)) {
        const handlerToRemove = preUpdateHandlers.get(scene);
        scene.preUpdate.removeEventListener(handlerToRemove!);
        preUpdateHandlers.delete(scene);
      }
    });
  }, [ctx]);

  return { enableCameraForceOblique, disableCameraForceOblique };
}
