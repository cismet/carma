import type { Viewer } from "cesium";
import { isValidViewer } from "./instanceGates";
import { guardEntityCollection } from "./guardEntityCollection";
import { guardScene } from "./guardScene";
import { guardCamera } from "./guardCamera";
import type { CesiumContextType } from "../CesiumContext";
import { pushDebugStack } from "./debugStack";

export const guardViewer = (
  ctx: CesiumContextType,
  viewer: Viewer,
  label?: string
) => {
  const ensure = <T>(fn: (v: Viewer) => T, fallback: T): T => {
    try {
      if (!isValidViewer(viewer)) {
        console.warn("Viewer gate invalid", label);
        return fallback;
      }
      pushDebugStack(ctx, 2);
      return fn(viewer);
    } catch (e) {
      console.warn("Viewer gate call failed", label, e);
      return fallback;
    }
  };

  return {
    scene<T>(
      cb: (scene: ReturnType<typeof guardScene>, viewer: Viewer) => T,
      fallback?: T
    ): T | undefined {
      return ensure(
        (v) => cb(guardScene(ctx, v.scene, label), v),
        fallback as T
      );
    },
    entities<T>(
      cb: (
        entities: ReturnType<typeof guardEntityCollection>,
        viewer: Viewer
      ) => T,
      fallback?: T
    ): T | undefined {
      return ensure(
        (v) => cb(guardEntityCollection(ctx, v.entities, label), v),
        fallback as T
      );
    },
    camera<T>(
      cb: (camera: ReturnType<typeof guardCamera>, viewer: Viewer) => T,
      fallback?: T
    ): T | undefined {
      return ensure((v) => cb(guardCamera(v.camera, label), v), fallback as T);
    },
  };
};
