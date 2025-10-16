import type { CesiumContextType } from "../../CesiumContext";
import type { MarkerPrimitiveData } from "./index.d";

import { updateTransform } from "./updateTransform";

const detachPreUpdate = (ctx: CesiumContextType, data: MarkerPrimitiveData) => {
  if (!data.onPreUpdate) {
    return;
  }

  ctx.withScene((scene) => {
    scene.preUpdate.removeEventListener(data.onPreUpdate!);
  });

  data.onPreUpdate = undefined;
};

export const detachListeners = (
  ctx: CesiumContextType,
  data: MarkerPrimitiveData
) => {
  detachPreUpdate(ctx, data);
};

export const attachListeners = (
  ctx: CesiumContextType,
  data: MarkerPrimitiveData
) => {
  const config = data.modelConfig;

  if (!config) {
    return;
  }

  detachListeners(ctx, data);

  const onPreUpdate = () => updateTransform(ctx, data);

  ctx.withScene((scene) => {
    scene.preUpdate.addEventListener(onPreUpdate);
  });

  data.onPreUpdate = onPreUpdate;
  ctx.requestRender();
};
