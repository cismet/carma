import { isValidScene } from "./instanceGates";
import { guardScreenSpaceCameraController } from "./guardScreenSpaceCameraController";
import { guardCamera } from "./guardCamera";
import type {
  Scene,
  Viewer,
  Camera,
  PrimitiveCollection,
  JulianDate,
  ScreenSpaceCameraController,
} from "cesium";

// Guard operations on Scene accessed via a Viewer instance. We validate the viewer,
// then operate on its scene with safe defaults and no-throw semantics.
export const guardScene = (sceneLike: unknown, label?: string) => {
  const ensure = <T>(fn: (scene: Scene) => T, fallback: T): T => {
    try {
      if (!isValidScene(sceneLike as Scene)) {
        console.warn("Scene gate invalid", label);
        return fallback;
      }
      return fn(sceneLike as Scene);
    } catch (e) {
      console.warn("Scene gate call failed", label, e);
      return fallback;
    }
  };

  return {
    // Render
    requestRender() {
      ensure((scene) => scene.requestRender(), undefined as unknown as void);
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

    // Primitives collection scoped callback
    primitives<T>(
      cb: (prims: PrimitiveCollection) => T,
      fallback?: T
    ): T | undefined {
      return ensure((scene) => cb(scene.primitives), fallback as T);
    },

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
      ensure(
        (scene) => scene.preUpdate.addEventListener(listener),
        undefined as unknown as void
      );
      return this;
    },
    removePreUpdate(listener: (scene: Scene, time?: JulianDate) => void) {
      ensure(
        (scene) => scene.preUpdate.removeEventListener(listener),
        undefined as unknown as void
      );
      return this;
    },
  };
};
