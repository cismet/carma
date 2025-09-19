import type { Scene } from "cesium";
// undocumented cesium function to get if animation is running
// https://community.cesium.com/t/cancel-a-camera-flyto-intentionally/1371/6
export const sceneHasTweens = (scene: Scene & { tweens: [] }) => {
  return scene && scene.tweens && scene.tweens.length > 0;
};
