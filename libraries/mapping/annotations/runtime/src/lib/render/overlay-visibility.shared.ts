import { isPointInViewport } from "@carma-mapping/annotations/core";
import { Cartesian2, SceneTransforms, defined } from "@carma-cesium";
import {
  areCameraSnapshotsEqual,
  cartesian3FromGeographicCoordinate,
  getCameraSnapshot,
  isPointOccluded,
  type CameraSnapshot,
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
  cameraSnapshot: CameraSnapshot;
};

export const overlayVisibilityDefaults = Object.freeze({
  viewportPaddingHorizontal: 12,
  viewportPaddingVertical: 8,
  occlusionToleranceMeters: 1.0,
});

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

  return {
    viewportWidth: Math.max(1, scene.canvas.clientWidth),
    viewportHeight: Math.max(1, scene.canvas.clientHeight),
    cameraSnapshot: getCameraSnapshot(scene),
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
    areCameraSnapshotsEqual(left.cameraSnapshot, right.cameraSnapshot)
  );
};

export const computeOverlayVisibilityState = ({
  scene,
  coordinate,
  shouldTestVisibility = true,
  shouldTestOcclusion = true,
  viewportPaddingHorizontal = overlayVisibilityDefaults.viewportPaddingHorizontal,
  viewportPaddingVertical = overlayVisibilityDefaults.viewportPaddingVertical,
  occlusionToleranceMeters = overlayVisibilityDefaults.occlusionToleranceMeters,
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
