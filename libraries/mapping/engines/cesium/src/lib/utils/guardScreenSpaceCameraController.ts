// guardSSCC.ts
import type { ScreenSpaceCameraController } from "cesium";
import { isValidScreenSpaceCameraController } from "./instanceGates";

export const guardScreenSpaceCameraController = (
  ssccLike: unknown,
  label?: string
) => {
  const ensure = <T>(
    fn: (s: ScreenSpaceCameraController) => T,
    fallback: T
  ): T => {
    if (!isValidScreenSpaceCameraController(ssccLike)) {
      console.warn("SSCC gate invalid", label);
      return fallback;
    }
    try {
      return fn(ssccLike as ScreenSpaceCameraController);
    } catch (e) {
      console.warn("SSCC gate call failed", label, e);
      return fallback;
    }
  };

  return {
    enableZoom(flag: boolean) {
      ensure((s) => {
        s.enableZoom = flag;
      }, undefined as unknown as void);
      return this;
    },
    enableTilt(flag: boolean) {
      ensure((s) => {
        s.enableTilt = flag;
      }, undefined as unknown as void);
      return this;
    },
    enableLook(flag: boolean) {
      ensure((s) => {
        s.enableLook = flag;
      }, undefined as unknown as void);
      return this;
    },
    enableRotate(flag: boolean) {
      ensure((s) => {
        s.enableRotate = flag;
      }, undefined as unknown as void);
      return this;
    },
  };
};
