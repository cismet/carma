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

import type { CesiumGeographicCoordinate } from "../store";
import type { Scene } from "@carma-cesium";

export type OverlayVisibilityState = {
  canvasPosition: Cartesian2 | null;
  screenPosition: CssPixelPosition | null;
  isHidden: boolean;
  isOccluded: boolean;
};

export type OverlayVisibilitySceneSnapshot = {
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

export const overlayVisibilityDefaults = Object.freeze({
  viewportPaddingHorizontal: 12,
  viewportPaddingVertical: 8,
  occlusionToleranceMeters: 1.0,
});

const overlayVisibilitySnapshotEpsilons = Object.freeze({
  cameraPositionMeters: 1e-4,
  cameraDirection: 1e-6,
  cameraFrustum: 1e-6,
});

const toFiniteNumber = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

export const getSceneFrameKey = (scene: Scene | null): number | null => {
  if (!scene || scene.isDestroyed()) {
    return null;
  }

  const frameNumber = (
    scene as Scene & {
      frameState?: {
        frameNumber?: number;
      };
    }
  ).frameState?.frameNumber;

  return typeof frameNumber === "number" ? frameNumber : 0;
};

export const captureOverlayVisibilitySceneSnapshot = (
  scene: Scene | null
): OverlayVisibilitySceneSnapshot | null => {
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

export const areOverlayVisibilitySceneSnapshotsEqual = (
  left: OverlayVisibilitySceneSnapshot | null,
  right: OverlayVisibilitySceneSnapshot | null
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
      overlayVisibilitySnapshotEpsilons.cameraPositionMeters &&
    Cartesian3.distance(left.direction, right.direction) <=
      overlayVisibilitySnapshotEpsilons.cameraDirection &&
    Cartesian3.distance(left.up, right.up) <=
      overlayVisibilitySnapshotEpsilons.cameraDirection &&
    Cartesian3.distance(left.right, right.right) <=
      overlayVisibilitySnapshotEpsilons.cameraDirection &&
    Math.abs(left.frustumNear - right.frustumNear) <=
      overlayVisibilitySnapshotEpsilons.cameraFrustum &&
    Math.abs(left.frustumFar - right.frustumFar) <=
      overlayVisibilitySnapshotEpsilons.cameraFrustum &&
    Math.abs(left.frustumFovY - right.frustumFovY) <=
      overlayVisibilitySnapshotEpsilons.cameraFrustum &&
    Math.abs(left.frustumLeft - right.frustumLeft) <=
      overlayVisibilitySnapshotEpsilons.cameraFrustum &&
    Math.abs(left.frustumRight - right.frustumRight) <=
      overlayVisibilitySnapshotEpsilons.cameraFrustum &&
    Math.abs(left.frustumTop - right.frustumTop) <=
      overlayVisibilitySnapshotEpsilons.cameraFrustum &&
    Math.abs(left.frustumBottom - right.frustumBottom) <=
      overlayVisibilitySnapshotEpsilons.cameraFrustum
  );
};

export const computeOverlayVisibilityState = ({
  scene,
  coordinate,
  shouldTestVisibility = true,
  shouldTestOcclusion = true,
  viewportPaddingHorizontal =
    overlayVisibilityDefaults.viewportPaddingHorizontal,
  viewportPaddingVertical =
    overlayVisibilityDefaults.viewportPaddingVertical,
  occlusionToleranceMeters =
    overlayVisibilityDefaults.occlusionToleranceMeters,
}: {
  scene: Scene | null;
  coordinate: CesiumGeographicCoordinate;
  shouldTestVisibility?: boolean;
  shouldTestOcclusion?: boolean;
  viewportPaddingHorizontal?: number;
  viewportPaddingVertical?: number;
  occlusionToleranceMeters?: number;
}): OverlayVisibilityState => {
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
