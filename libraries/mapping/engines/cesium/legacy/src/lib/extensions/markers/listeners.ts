import { isValidScene, Scene } from "@carma/cesium";
import type { MarkerPrimitiveData } from "./index.d";

import { updateTransform } from "./updateTransform";

export const detachListeners = (scene: Scene, data: MarkerPrimitiveData) => {
  if (!data.onPreUpdate) {
    return;
  }

  if (!isValidScene(scene)) {
    return;
  }

  scene.preUpdate.removeEventListener(data.onPreUpdate!);

  data.onPreUpdate = undefined;
};

export const attachListeners = (scene: Scene, data: MarkerPrimitiveData) => {
  const config = data.modelConfig;

  if (!config || !isValidScene(scene)) {
    return;
  }

  detachListeners(scene, data);

  const onPreUpdate = () => updateTransform(scene, data);

  scene.preUpdate.addEventListener(onPreUpdate);

  data.onPreUpdate = onPreUpdate;
  scene.requestRender();
};
