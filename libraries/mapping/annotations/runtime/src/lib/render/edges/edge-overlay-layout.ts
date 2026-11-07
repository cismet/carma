import { Vector3 } from "three";
import type { AnnotationEngine } from "@carma-mapping/annotations/core";
import type { Rect } from "@carma-providers/label-overlay";

import { resolveAnnotationOverlayContainer } from "../../interaction/annotation-overlay-mount";
import { resolveRuntimeOverlayDistanceZIndex } from "../annotation-render-models";
import { annotationEdgeDefaults } from "./edge-defaults";

const cameraPositionScratch = new Vector3();

export const resolveOverlayZIndexAtWorldPosition = (
  engine: AnnotationEngine,
  worldPosition: Vector3
) => {
  const cameraPositionECEF = engine.getCameraPositionECEF(
    cameraPositionScratch
  );
  return resolveRuntimeOverlayDistanceZIndex(
    cameraPositionECEF
      ? cameraPositionECEF.distanceTo(worldPosition)
      : Number.NaN
  );
};

export const resolveOverlayZIndexBetweenWorldPositions = (
  engine: AnnotationEngine,
  start: Vector3,
  end: Vector3
) =>
  Math.round(
    (resolveOverlayZIndexAtWorldPosition(engine, start) +
      resolveOverlayZIndexAtWorldPosition(engine, end)) /
      2
  );

const toLayoutRect = (domRect: DOMRect): Rect => ({
  left: domRect.left,
  top: domRect.top,
  right: domRect.right,
  bottom: domRect.bottom,
});

export const resolveVisiblePointLabelRects = (
  engine: AnnotationEngine
): Rect[] => {
  const container = resolveAnnotationOverlayContainer(engine);
  if (!container) {
    return [];
  }

  return Array.from(
    container.querySelectorAll<HTMLElement>(
      annotationEdgeDefaults.pointLabelCollisionSelector
    )
  )
    .map((element) => toLayoutRect(element.getBoundingClientRect()))
    .filter((rect) => rect.right > rect.left && rect.bottom > rect.top);
};
