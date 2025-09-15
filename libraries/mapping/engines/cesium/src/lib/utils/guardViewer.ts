import type { Viewer } from "cesium";
import { isValidViewer } from "./instanceGates";
import { guardEntityCollection } from "./guardEntityCollection";
import { guardScene } from "./guardScene";
import { guardCamera } from "./guardCamera";

export const guardViewer = (viewerLike: unknown, label?: string) => {
  const ensure = <T>(fn: (v: Viewer) => T, fallback: T): T => {
    try {
      if (!isValidViewer(viewerLike as Viewer)) {
        console.warn("Viewer gate invalid", label);
        return fallback;
      }
      return fn(viewerLike as Viewer);
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
      return ensure((v) => cb(guardScene(v.scene, label), v), fallback as T);
    },
    entities<T>(
      cb: (
        entities: ReturnType<typeof guardEntityCollection>,
        viewer: Viewer
      ) => T,
      fallback?: T
    ): T | undefined {
      return ensure(
        (v) => cb(guardEntityCollection(v.entities, label), v),
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
