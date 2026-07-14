import {
  areCesiumSceneProjectionSnapshotsEqual,
  cartesian3FromGeographicCoordinate,
  captureCesiumSceneProjectionSnapshot,
  getCesiumSceneFrameKey,
  projectCesiumScenePoint,
  type CesiumSceneProjectionSnapshot,
  type CesiumSceneProjectionState,
} from "@carma-mapping/engines/cesium/core";

import type { CesiumGeographicCoordinate } from "../store";
import type { Scene } from "@carma-cesium";

export type OverlayVisibilityState = CesiumSceneProjectionState;
export type OverlayVisibilitySceneSnapshot = CesiumSceneProjectionSnapshot;

export const overlayVisibilityDefaults = Object.freeze({
  viewportPaddingHorizontal: 12,
  viewportPaddingVertical: 8,
  occlusionToleranceMeters: 1.0,
});

export const getSceneFrameKey = getCesiumSceneFrameKey;
export const captureOverlayVisibilitySceneSnapshot =
  captureCesiumSceneProjectionSnapshot;
export const areOverlayVisibilitySceneSnapshotsEqual =
  areCesiumSceneProjectionSnapshotsEqual;

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
  return projectCesiumScenePoint(
    scene,
    cartesian3FromGeographicCoordinate(coordinate),
    {
      shouldTestVisibility,
      shouldTestOcclusion,
      viewportPaddingHorizontal,
      viewportPaddingVertical,
      occlusionToleranceMeters,
    }
  );
};
