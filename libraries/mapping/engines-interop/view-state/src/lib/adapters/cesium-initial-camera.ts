import {
  Cartesian3,
  Cartographic,
  Ellipsoid,
} from "@carma/cesium";
import {
  readLongerEdgeFovFromIntrinsics,
} from "@carma-commons/camera/model";
import { readCesiumCameraStateFromViewState } from "./cesium";
import { deriveView } from "../core/derivations";
import type { ViewState } from "../core/types";

export type InitialCameraViewLike = {
  position?: Cartographic;
  anchor?: Cartographic;
  zoom?: number;
  direction?: Cartesian3;
  up?: Cartesian3;
  right?: Cartesian3;
  fov?: number | null;
  fovLongerEdge?: number | null;
};

export const readInitialCameraViewFromViewState = (
  state: ViewState | null | undefined
): InitialCameraViewLike | undefined => {
  if (!state) {
    return undefined;
  }

  const view = deriveView(state);
  const fovLongerEdge = readLongerEdgeFovFromIntrinsics(state.intrinsics);
  const cameraState = readCesiumCameraStateFromViewState(state);

  const anchorCartographic = Cartographic.fromRadians(
    state.anchorCartographic.longitude,
    state.anchorCartographic.latitude,
    state.anchorCartographic.altitude
  );
  const position = Ellipsoid.WGS84.cartesianToCartographic(
    new Cartesian3(
      state.cameraPosition.x,
      state.cameraPosition.y,
      state.cameraPosition.z
    )
  );
  if (!position) {
    return undefined;
  }

  return {
    position,
    anchor: anchorCartographic,
    ...(Number.isFinite(view.zoom) ? { zoom: view.zoom } : {}),
    direction: cameraState.direction,
    up: cameraState.up,
    ...(cameraState.right ? { right: cameraState.right } : {}),
    fov: Number.isFinite(state.intrinsics.fov) ? state.intrinsics.fov : null,
    fovLongerEdge: Number.isFinite(fovLongerEdge) ? fovLongerEdge : null,
  };
};
