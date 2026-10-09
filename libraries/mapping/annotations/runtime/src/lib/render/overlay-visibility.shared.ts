import { ecefFromGeographicCoordinate } from "@carma-mapping/annotations/core";

import {
  areAnnotationProjectionSnapshotsEqual,
  isValidAnnotationEngine,
  type AnnotationEngine,
  type AnnotationProjectionSnapshot,
  type AnnotationProjectionState,
} from "../engine";
import type { AnnotationGeographicCoordinate } from "../store";

export type OverlayVisibilityState = AnnotationProjectionState;
export type OverlayVisibilitySceneSnapshot = AnnotationProjectionSnapshot;

export const overlayVisibilityDefaults = Object.freeze({
  viewportPaddingHorizontal: 12,
  viewportPaddingVertical: 8,
  occlusionToleranceMeters: 1.0,
});

const createHiddenOverlayVisibilityState = (): OverlayVisibilityState => ({
  screenPosition: null,
  isInViewport: false,
  isHidden: true,
  isOccluded: false,
});

export const getSceneFrameKey = (
  engine: AnnotationEngine | null
): number | null => engine?.getFrameKey() ?? null;

export const captureOverlayVisibilitySceneSnapshot = (
  engine: AnnotationEngine | null
): OverlayVisibilitySceneSnapshot | null =>
  engine?.captureProjectionSnapshot() ?? null;

export const areOverlayVisibilitySceneSnapshotsEqual =
  areAnnotationProjectionSnapshotsEqual;

export const computeOverlayVisibilityState = ({
  engine,
  coordinate,
  shouldTestVisibility = true,
  shouldTestOcclusion = true,
  viewportPaddingHorizontal = overlayVisibilityDefaults.viewportPaddingHorizontal,
  viewportPaddingVertical = overlayVisibilityDefaults.viewportPaddingVertical,
  occlusionToleranceMeters = overlayVisibilityDefaults.occlusionToleranceMeters,
}: {
  engine: AnnotationEngine | null;
  coordinate: AnnotationGeographicCoordinate;
  shouldTestVisibility?: boolean;
  shouldTestOcclusion?: boolean;
  viewportPaddingHorizontal?: number;
  viewportPaddingVertical?: number;
  occlusionToleranceMeters?: number;
}): OverlayVisibilityState => {
  if (!isValidAnnotationEngine(engine)) {
    return createHiddenOverlayVisibilityState();
  }

  return engine.projectPoint(ecefFromGeographicCoordinate(coordinate), {
    shouldTestVisibility,
    shouldTestOcclusion,
    viewportPaddingHorizontal,
    viewportPaddingVertical,
    occlusionToleranceMeters,
  });
};
