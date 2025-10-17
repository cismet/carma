import type { MarkerPrimitiveData } from "./types";

import { updateTransform } from "./updateTransform";
import { Scene } from "cesium";
import { tryWithValidScene } from "@carma-mapping/engines/cesium/api";
import { sceneRequestRender } from "../scene-utilities";

const detachPreUpdate = (scene: Scene, data: MarkerPrimitiveData) => {
  if (!data.onPreUpdate) {
    return;
  }

  tryWithValidScene(scene, () => {
    scene.preUpdate.removeEventListener(data.onPreUpdate!);
  });

  data.onPreUpdate = undefined;
};

export const detachListeners = (scene: Scene, data: MarkerPrimitiveData) => {
  detachPreUpdate(scene, data);
};

export const attachListeners = (scene: Scene, data: MarkerPrimitiveData) => {
  const config = data.modelConfig;

  if (!config) {
    return;
  }

  detachListeners(scene, data);

  const onPreUpdate = () => updateTransform(scene, data);

  tryWithValidScene(scene, () => {
    scene.preUpdate.addEventListener(onPreUpdate);
  });

  data.onPreUpdate = onPreUpdate;
  sceneRequestRender(scene);
};
