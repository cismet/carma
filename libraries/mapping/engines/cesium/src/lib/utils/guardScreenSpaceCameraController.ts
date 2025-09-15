// guardSSCC.ts
import type { ScreenSpaceCameraController } from "cesium";
import { isValidScreenSpaceCameraController } from "./instanceGates";

export const guardScreenSpaceCameraController = (
  sscc: ScreenSpaceCameraController,
  label?: string
) => {
  const ensure = <T>(
    fn: (s: ScreenSpaceCameraController) => T,
    fallback: T
  ): T => {
    if (!isValidScreenSpaceCameraController(sscc)) {
      console.warn("SSCC gate invalid", label);
      return fallback;
    }
    try {
      return fn(sscc);
    } catch (e) {
      console.warn("SSCC gate call failed", label, e);
      return fallback;
    }
  };

  return {
    enableZoom(flag: boolean) {
      ensure((s) => {
        s.enableZoom = flag;
      }, undefined);
      return this;
    },
    enableTilt(flag: boolean) {
      ensure((s) => {
        s.enableTilt = flag;
      }, undefined);
      return this;
    },
    enableLook(flag: boolean) {
      ensure((s) => {
        s.enableLook = flag;
      }, undefined);
      return this;
    },
    enableRotate(flag: boolean) {
      ensure((s) => {
        s.enableRotate = flag;
      }, undefined);
      return this;
    },
  };
};
