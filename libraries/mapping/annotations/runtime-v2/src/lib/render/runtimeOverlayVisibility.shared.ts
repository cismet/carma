import { isPointInViewport } from "@carma-mapping/annotations/core";
import { Cartesian2, SceneTransforms, defined } from "@carma-cesium";
import {
  cartesian3FromGeographicCoordinate,
  isPointOccluded,
} from "@carma-mapping/engines/cesium/core";
import type { CssPixelPosition } from "@carma-units";

import type { RuntimeCoordinate } from "../store";
import type { RuntimeScene } from "../types/runtimeScene.types";

export type RuntimeOverlayVisibilityState = {
  canvasPosition: Cartesian2 | null;
  screenPosition: CssPixelPosition | null;
  isHidden: boolean;
  isOccluded: boolean;
};

export const RUNTIME_OVERLAY_VIEWPORT_PADDING_HORIZONTAL = 12;
export const RUNTIME_OVERLAY_VIEWPORT_PADDING_VERTICAL = 8;
export const RUNTIME_OVERLAY_OCCLUSION_TOLERANCE_METERS = 1.0;

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
