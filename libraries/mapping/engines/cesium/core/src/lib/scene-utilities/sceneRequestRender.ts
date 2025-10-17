import {
  handleDelayedRender,
  type DelayedRenderOptions,
} from "@carma-commons/dom/window";
import { tryWithValidScene } from "@carma-mapping/engines/cesium/api";
import { Scene } from "cesium";

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
