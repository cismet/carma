import {
  handleDelayedRender,
  type DelayedRenderOptions,
} from "@carma-commons/utils";
import { tryWithValidScene } from "./instanceGates";
import { Scene } from "cesium";

export const sceneRequestRender = (
  scene: Scene,
  opts?: DelayedRenderOptions
) => {
  const renderOnce = () => {
    tryWithValidScene(scene, () => {
      scene.requestRender();
    });
  };
  handleDelayedRender(renderOnce, opts);
};
