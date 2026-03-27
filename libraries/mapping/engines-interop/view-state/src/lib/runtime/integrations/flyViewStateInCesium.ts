import { isFiniteNumber } from "@carma/math";
import {
  readLongerEdgeFovFromIntrinsics,
  readViewOffsetFromElement,
  type CameraIntrinsics,
} from "@carma-commons/camera/model";
import type { Radians } from "@carma/units/types";
import {
  flyToCameraState,
  readPerspectiveFrustumVerticalFov,
  type Scene,
} from "@carma-mapping/engines/cesium/api";
import { readCesiumCameraStateFromViewState } from "../../adapters/cesium";
import { resolveViewStateForViewport } from "../../core/viewport";
import type { ViewState } from "../../core/types";

const readSceneLongerEdgeFov = (scene: Scene): Radians | undefined => {
  const camera = scene.camera;
  if (!camera) {
    return undefined;
  }

  const viewOffset = readViewOffsetFromElement(scene.canvas);
  const fov = readPerspectiveFrustumVerticalFov(
    camera.frustum as Parameters<typeof readPerspectiveFrustumVerticalFov>[0]
  );
  const intrinsics: CameraIntrinsics = {};
  if (isFiniteNumber(fov)) {
    intrinsics.fov = fov as CameraIntrinsics["fov"];
  }
  if (viewOffset) {
    intrinsics.viewOffset = viewOffset;
  }

  return readLongerEdgeFovFromIntrinsics(intrinsics, {
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
