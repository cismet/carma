import type { Scene, JulianDate } from "cesium";
import { isValidScene } from "./instanceGates";
import { guardScreenSpaceCameraController } from "./guardScreenSpaceCameraController";
import { guardCamera } from "./guardCamera";
import { guardPrimitiveCollection } from "./guardPrimitiveCollection";
import type { CesiumContextType } from "../CesiumContext";
import { pushDebugStack } from "./debugStack";

export const guardScene = (
  ctx: CesiumContextType,
  scene: Scene,
  label?: string
) => {
  const ensure = <T>(fn: (scene: Scene) => T, fallback: T): T => {
    if (!isValidScene(scene)) {
      console.warn("Scene gate invalid", label);
      return fallback;
    }
    pushDebugStack(ctx, 2);
    try {
      return fn(scene);
    } catch (e) {
      console.warn("Scene gate call failed", label, e);
      return fallback;
    }
  };

  return {
    // Render
    requestRender() {
      ensure((scene) => scene.requestRender(), undefined);
      return this;
    },

    // Camera scoped callback (guarded)
    camera<T>(
      cb: (camera: ReturnType<typeof guardCamera>) => T,
      fallback?: T
    ): T | undefined {
      return ensure(
        (scene) => cb(guardCamera(scene.camera, label)),
        fallback as T
      );
    },

    primitives: guardPrimitiveCollection(ctx, scene.primitives, label),

    screenSpaceCameraController<T>(
      cb: (sscc: ReturnType<typeof guardScreenSpaceCameraController>) => T,
      fallback?: T
    ): T | undefined {
      return ensure(
        (scene) =>
          cb(
            guardScreenSpaceCameraController(
              scene.screenSpaceCameraController,
              label
            )
          ),
        fallback as T
      );
    },

    // Event listeners (preUpdate)
    addPreUpdate(listener: (scene: Scene, time?: JulianDate) => void) {
      ensure((scene) => scene.preUpdate.addEventListener(listener), undefined);
      return this;
    },
    removePreUpdate(listener: (scene: Scene, time?: JulianDate) => void) {
      ensure(
        (scene) => scene.preUpdate.removeEventListener(listener),
        undefined
      );
      return this;
    },
  };
};
