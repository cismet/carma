import type { Scene } from "@carma/cesium";
// undocumented cesium function to get if animation is running
// https://community.cesium.com/t/cancel-a-camera-flyto-intentionally/1371/6
export const sceneHasTweens = (scene: Scene) => {
  const s = scene as Scene & { tweens: [] };
  return s && s.tweens && s.tweens.length > 0;
};
