import {
  handleDelayedRender,
  type DelayedRenderOptions,
} from "@carma-commons/dom/window";
import { tryWithValidScene } from "@carma/cesium";
import { Scene } from "@carma/cesium";

export const sceneRequestRender = (
  scene: Scene,
  opts?: DelayedRenderOptions
): Promise<void> => {
  const renderOnce = () => {
    tryWithValidScene(scene, () => {
      scene.requestRender();
    });
  };
  return handleDelayedRender(renderOnce, opts);
};
