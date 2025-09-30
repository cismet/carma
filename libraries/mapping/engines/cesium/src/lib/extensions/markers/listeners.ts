import type { CesiumContextType } from "../../CesiumContext";
import type { MarkerPrimitiveData } from "./index.d";

import { updateRotating, updateViewerFacing } from "./updateTransformations";

const detachPreUpdate = (ctx: CesiumContextType, data: MarkerPrimitiveData) => {
  if (!data.onPreUpdate) {
    return;
  }

  ctx.withScene((scene) => {
    scene.preUpdate.removeEventListener(data.onPreUpdate!);
  });

  data.onPreUpdate = undefined;
};

const detachCameraChanged = (
  ctx: CesiumContextType,
  data: MarkerPrimitiveData
) => {
  if (!data.onCameraChanged) {
    return;
  }

  ctx.withCamera((camera) => {
    camera.changed.removeEventListener(data.onCameraChanged!);
  });

  data.onCameraChanged = undefined;
};

export const detachListeners = (
  ctx: CesiumContextType,
  data: MarkerPrimitiveData
) => {
  detachPreUpdate(ctx, data);
  detachCameraChanged(ctx, data);
};

export const attachListeners = (
  ctx: CesiumContextType,
  data: MarkerPrimitiveData
) => {
  const config = data.modelConfig;

  if (!config) {
    return;
  }

  // ensure stale listeners are removed before registering new ones
  detachListeners(ctx, data);

  if (config.rotation) {
    const onPreUpdate = () => updateRotating(ctx, data);

    ctx.withScene((scene) => {
      scene.preUpdate.addEventListener(onPreUpdate);
    });

    data.onPreUpdate = onPreUpdate;
    ctx.requestRender();
    return;
  }

  const onCameraChanged = () => updateViewerFacing(ctx, data);

  ctx.withCamera((camera) => {
    camera.changed.addEventListener(onCameraChanged);
  });

  data.onCameraChanged = onCameraChanged;
  updateViewerFacing(ctx, data);
  ctx.requestRender();
};
