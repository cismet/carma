import { readLongerEdgeFovFromIntrinsics } from "@carma-commons/camera/model";
import { type Scene } from "@carma-cesium";
import {
  flyToCameraState,
  readSceneCameraIntrinsics,
} from "@carma-mapping/engines/cesium/core";
import type { Radians } from "@carma-units";

import { readCesiumCameraStateFromViewState } from "../../adapters/cesium";
import type { ViewState } from "../../core/types";
import { resolveViewStateForViewport } from "../../core/viewport";
const readSceneLongerEdgeFov = (scene: Scene): Radians | undefined => {
  const camera = scene.camera;
  if (!camera) {
    return undefined;
  }

  return readLongerEdgeFovFromIntrinsics(readSceneCameraIntrinsics(scene), {
    viewportWidthPx: scene.canvas?.clientWidth,
    viewportHeightPx: scene.canvas?.clientHeight,
  });
};

export const flyViewStateInCesium = (
  scene: Scene,
  state: ViewState,
  options: {
    duration?: number;
    applyFov?: boolean;
  } = {}
): boolean => {
  const viewportWidthPx = scene.canvas?.clientWidth ?? 0;
  const viewportHeightPx = scene.canvas?.clientHeight ?? 0;
  const currentLongerEdgeFov =
    options.applyFov === false ? readSceneLongerEdgeFov(scene) : undefined;
  const resolvedState = resolveViewStateForViewport(state, {
    viewportWidthPx,
    viewportHeightPx,
    longerEdgeFovOverride: currentLongerEdgeFov,
    applyResolvedIntrinsics: options.applyFov !== false,
  });
  const cameraState = readCesiumCameraStateFromViewState(resolvedState);

  return flyToCameraState(scene, cameraState, options);
};
