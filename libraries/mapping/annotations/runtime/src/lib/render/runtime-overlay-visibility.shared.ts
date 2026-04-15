import { isPointInViewport } from "@carma-mapping/annotations/core";
import {
  Cartesian2,
  Cartesian3,
  SceneTransforms,
  defined,
} from "@carma-cesium";
import {
  cartesian3FromGeographicCoordinate,
  isPointOccluded,
} from "@carma-mapping/engines/cesium/core";
import type { CssPixelPosition } from "@carma-units";

import type { RuntimeCoordinate } from "../store";
import type { RuntimeScene } from "../types/runtime-scene.types";

export type RuntimeOverlayVisibilityState = {
  canvasPosition: Cartesian2 | null;
  screenPosition: CssPixelPosition | null;
  isHidden: boolean;
  isOccluded: boolean;
};

export type RuntimeOverlayVisibilitySceneSnapshot = {
  viewportWidth: number;
  viewportHeight: number;
  position: Cartesian3;
  direction: Cartesian3;
  up: Cartesian3;
  right: Cartesian3;
  frustumNear: number;
  frustumFar: number;
  frustumFovY: number;
  frustumLeft: number;
  frustumRight: number;
  frustumTop: number;
  frustumBottom: number;
};

export const RUNTIME_OVERLAY_VIEWPORT_PADDING_HORIZONTAL = 12;
export const RUNTIME_OVERLAY_VIEWPORT_PADDING_VERTICAL = 8;
export const RUNTIME_OVERLAY_OCCLUSION_TOLERANCE_METERS = 1.0;
const OVERLAY_CAMERA_POSITION_EPSILON_METERS = 1e-4;
const OVERLAY_CAMERA_DIRECTION_EPSILON = 1e-6;
const OVERLAY_CAMERA_FRUSTUM_EPSILON = 1e-6;

const toFiniteNumber = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

export const getSceneFrameKey = (scene: RuntimeScene | null): number | null => {
  if (!scene || scene.isDestroyed()) {
    return null;
  }

  const frameNumber = (
    scene as RuntimeScene & {
      frameState?: {
        frameNumber?: number;
      };
    }
  ).frameState?.frameNumber;

  return typeof frameNumber === "number" ? frameNumber : 0;
};

export const captureRuntimeOverlayVisibilitySceneSnapshot = (
  scene: RuntimeScene | null
): RuntimeOverlayVisibilitySceneSnapshot | null => {
  if (!scene || scene.isDestroyed()) {
    return null;
  }

  const frustum = scene.camera.frustum as unknown as {
    near?: number;
    far?: number;
    fovy?: number;
    left?: number;
    right?: number;
    top?: number;
    bottom?: number;
  };

  return {
    viewportWidth: Math.max(1, scene.canvas.clientWidth),
    viewportHeight: Math.max(1, scene.canvas.clientHeight),
    position: Cartesian3.clone(scene.camera.positionWC),
    direction: Cartesian3.clone(scene.camera.directionWC),
    up: Cartesian3.clone(scene.camera.upWC),
    right: Cartesian3.clone(scene.camera.rightWC),
    frustumNear: toFiniteNumber(frustum.near),
    frustumFar: toFiniteNumber(frustum.far),
    frustumFovY: toFiniteNumber(frustum.fovy),
    frustumLeft: toFiniteNumber(frustum.left),
    frustumRight: toFiniteNumber(frustum.right),
    frustumTop: toFiniteNumber(frustum.top),
    frustumBottom: toFiniteNumber(frustum.bottom),
  };
};

export const areRuntimeOverlayVisibilitySceneSnapshotsEqual = (
  left: RuntimeOverlayVisibilitySceneSnapshot | null,
  right: RuntimeOverlayVisibilitySceneSnapshot | null
) => {
  if (!left && !right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return (
    left.viewportWidth === right.viewportWidth &&
    left.viewportHeight === right.viewportHeight &&
    Cartesian3.distance(left.position, right.position) <=
      OVERLAY_CAMERA_POSITION_EPSILON_METERS &&
    Cartesian3.distance(left.direction, right.direction) <=
      OVERLAY_CAMERA_DIRECTION_EPSILON &&
    Cartesian3.distance(left.up, right.up) <=
      OVERLAY_CAMERA_DIRECTION_EPSILON &&
    Cartesian3.distance(left.right, right.right) <=
      OVERLAY_CAMERA_DIRECTION_EPSILON &&
    Math.abs(left.frustumNear - right.frustumNear) <=
      OVERLAY_CAMERA_FRUSTUM_EPSILON &&
    Math.abs(left.frustumFar - right.frustumFar) <=
      OVERLAY_CAMERA_FRUSTUM_EPSILON &&
    Math.abs(left.frustumFovY - right.frustumFovY) <=
      OVERLAY_CAMERA_FRUSTUM_EPSILON &&
    Math.abs(left.frustumLeft - right.frustumLeft) <=
      OVERLAY_CAMERA_FRUSTUM_EPSILON &&
    Math.abs(left.frustumRight - right.frustumRight) <=
      OVERLAY_CAMERA_FRUSTUM_EPSILON &&
    Math.abs(left.frustumTop - right.frustumTop) <=
      OVERLAY_CAMERA_FRUSTUM_EPSILON &&
    Math.abs(left.frustumBottom - right.frustumBottom) <=
      OVERLAY_CAMERA_FRUSTUM_EPSILON
  );
};

export const computeRuntimeOverlayVisibilityState = ({
  scene,
  coordinate,
  shouldTestVisibility = true,
  shouldTestOcclusion = true,
  viewportPaddingHorizontal = RUNTIME_OVERLAY_VIEWPORT_PADDING_HORIZONTAL,
  viewportPaddingVertical = RUNTIME_OVERLAY_VIEWPORT_PADDING_VERTICAL,
  occlusionToleranceMeters = RUNTIME_OVERLAY_OCCLUSION_TOLERANCE_METERS,
}: {
  scene: RuntimeScene | null;
  coordinate: RuntimeCoordinate;
  shouldTestVisibility?: boolean;
  shouldTestOcclusion?: boolean;
  viewportPaddingHorizontal?: number;
  viewportPaddingVertical?: number;
  occlusionToleranceMeters?: number;
}): RuntimeOverlayVisibilityState => {
  if (!scene || scene.isDestroyed()) {
    return {
      canvasPosition: null,
      screenPosition: null,
      isHidden: true,
      isOccluded: false,
    };
  }

  const pointECEF = cartesian3FromGeographicCoordinate(coordinate);
  const canvasPosition = SceneTransforms.worldToWindowCoordinates(
    scene,
    pointECEF
  );
  if (!defined(canvasPosition)) {
    return {
      canvasPosition: null,
      screenPosition: null,
      isHidden: shouldTestVisibility,
      isOccluded: false,
    };
  }

  const screenPosition = {
    x: canvasPosition.x,
    y: canvasPosition.y,
  } as CssPixelPosition;
  const isInViewport = isPointInViewport(
    screenPosition,
    scene.canvas.clientWidth,
    scene.canvas.clientHeight,
    viewportPaddingHorizontal,
    viewportPaddingVertical
  );
  const isHidden = shouldTestVisibility ? !isInViewport : false;

  return {
    canvasPosition,
    screenPosition,
    isHidden,
    isOccluded:
      shouldTestOcclusion && isInViewport
        ? isPointOccluded(
            scene,
            pointECEF,
            canvasPosition,
            occlusionToleranceMeters
          )
        : false,
  };
};
