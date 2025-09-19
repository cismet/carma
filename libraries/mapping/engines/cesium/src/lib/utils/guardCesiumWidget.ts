import type { CesiumWidget } from "cesium";
import { isValidWidget } from "./instanceGates";
import { guardScene } from "./guardScene";
import { guardCamera } from "./guardCamera";

export const guardCesiumWidget = (widget: CesiumWidget, label?: string) => {
  const ensure = <T>(fn: (v: CesiumWidget) => T, fallback: T): T => {
    try {
      if (!isValidViewer(widget)) {
        console.warn("Viewer gate invalid", label);
        return fallback;
      }
      return fn(widget);
    } catch (e) {
      console.warn("widget gate call failed", label, e);
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
    camera<T>(
      cb: (camera: ReturnType<typeof guardCamera>, viewer: Viewer) => T,
      fallback?: T
    ): T | undefined {
      return ensure((v) => cb(guardCamera(v.camera, label), v), fallback as T);
    },
  };
};
