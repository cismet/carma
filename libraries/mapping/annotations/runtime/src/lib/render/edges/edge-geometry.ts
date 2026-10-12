import { ecefFromGeographicCoordinate } from "@carma-geo/proj";
import { Vector3 } from "three";

import {
  buildDistanceTriangleLineLabelReferences,
  type AnnotationGeographicCoordinate,
  type DistanceTriangleLineLabelOutsideSigns,
} from "@carma-mapping/annotations/core";
import { formatLengthMeters, type CssPixelPosition } from "@carma-units";
import type { Rect } from "@carma-providers/label-overlay";

import type { AnnotationsRuntimeFormatOptions } from "../../config/annotations-runtime-format-options";
import type { AnnotationEngine } from "../../engine";
import {
  annotationOverlayDefaults,
  buildAuxiliaryPoint,
  resolveAnnotationOverlayContainer,
  resolveDistanceTriangleComponentLabelVisibility,
  type AnnotationGeometryScratch,
} from "../../interaction/authoring-visual-runtime";
import type { LiveAnnotationAnchors } from "../../interaction/live-annotation-anchors";
import {
  RUNTIME_DISTANCE_TRIANGLE_ANCHOR_COORDINATE_ROLE,
  resolveRuntimeOverlayDistanceZIndex,
  type RuntimeDistanceTriangleOverlayRenderModel,
} from "../annotation-render-models";
import { annotationEdgeDefaults } from "./edge-defaults";
import type { EdgeSegment } from "./edge-models";

export const cameraPositionScratch = new Vector3();

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

export type DistanceTriangleOverlayScreenData = {
  anchorPointECEF: Vector3;
  targetPointECEF: Vector3;
  auxiliaryPointECEF: Vector3;
  anchorScreenPosition: CssPixelPosition;
  targetScreenPosition: CssPixelPosition;
  auxiliaryScreenPosition: CssPixelPosition;
  directLabelText: string;
  verticalLabelText: string | null;
  horizontalLabelText: string | null;
  showVerticalLabel: boolean;
  showHorizontalLabel: boolean;
  directOutsideReferencePoint: CssPixelPosition | null;
  verticalOutsideReferencePoint: CssPixelPosition | null;
  horizontalOutsideReferencePoint: CssPixelPosition | null;
  nextOutsideSigns: DistanceTriangleLineLabelOutsideSigns | undefined;
};

/** The edge endpoint as a fresh ECEF vector; a live drag anchor wins over the stored coordinate. */
export const resolveEdgePointECEF = (
  liveAnchors: LiveAnnotationAnchors,
  nodeId: string | undefined,
  coordinate: AnnotationGeographicCoordinate
): Vector3 => {
  const liveAnchor = nodeId ? liveAnchors.get(nodeId) : undefined;
  return liveAnchor
    ? liveAnchor.clone()
    : ecefFromGeographicCoordinate(coordinate);
};

export const toCssPixelPosition = (x: number, y: number): CssPixelPosition =>
  ({
    x: x as CssPixelPosition["x"],
    y: y as CssPixelPosition["y"],
  } as CssPixelPosition);

const resolveDistanceTriangleAnchorSelection = ({
  overlay,
}: {
  overlay: RuntimeDistanceTriangleOverlayRenderModel;
}) =>
  overlay.anchorCoordinateRole !==
  RUNTIME_DISTANCE_TRIANGLE_ANCHOR_COORDINATE_ROLE.END_COORDINATE;

export const edgeSegmentHasLiveAnchor = (
  edge: EdgeSegment,
  liveAnchors: LiveAnnotationAnchors
): boolean =>
  (edge.startNodeId !== undefined &&
    liveAnchors.get(edge.startNodeId) !== undefined) ||
  (edge.endNodeId !== undefined &&
    liveAnchors.get(edge.endNodeId) !== undefined);

/** Anchor, auxiliary and target points of a distance triangle from the live drag anchors, as fresh vectors. */
export const resolveDistanceTriangleComponentEndpointsECEF = (
  engine: AnnotationEngine,
  edge: EdgeSegment,
  liveAnchors: LiveAnnotationAnchors,
  scratch: AnnotationGeometryScratch
): {
  anchorECEF: Vector3;
  auxiliaryECEF: Vector3;
  targetECEF: Vector3;
} | null => {
  const overlay = edge.distanceTriangleOverlay;
  if (!overlay || !edge.startCoordinate || !edge.endCoordinate) {
    return null;
  }
  const startECEF = resolveEdgePointECEF(
    liveAnchors,
    edge.startNodeId,
    edge.startCoordinate
  );
  const endECEF = resolveEdgePointECEF(
    liveAnchors,
    edge.endNodeId,
    edge.endCoordinate
  );
  const anchorIsStart = resolveDistanceTriangleAnchorSelection({ overlay });
  const anchorECEF = anchorIsStart ? startECEF : endECEF;
  const targetECEF = anchorIsStart ? endECEF : startECEF;
  const auxiliaryECEF = buildAuxiliaryPoint({
    engine,
    anchorPointECEF: anchorECEF,
    targetPointECEF: targetECEF,
    scratch,
  });
  if (!auxiliaryECEF) {
    return null;
  }
  return {
    anchorECEF,
    auxiliaryECEF: auxiliaryECEF.clone(),
    targetECEF,
  };
};

export const resolveDistanceTriangleOverlayScreenData = ({
  engine,
  edge,
  scratch,
  previousOutsideSigns,
  formatOptions,
  liveAnchors,
}: {
  engine: AnnotationEngine;
  edge: EdgeSegment;
  scratch: AnnotationGeometryScratch;
  previousOutsideSigns?: DistanceTriangleLineLabelOutsideSigns;
  formatOptions: AnnotationsRuntimeFormatOptions;
  liveAnchors: LiveAnnotationAnchors;
}): DistanceTriangleOverlayScreenData | null => {
  const overlay = edge.distanceTriangleOverlay;
  if (!overlay || !edge.startCoordinate || !edge.endCoordinate) {
    return null;
  }

  const startPointECEF = resolveEdgePointECEF(
    liveAnchors,
    edge.startNodeId,
    edge.startCoordinate
  );
  const endPointECEF = resolveEdgePointECEF(
    liveAnchors,
    edge.endNodeId,
    edge.endCoordinate
  );
  const startCanvasPosition = engine.worldToScreen(startPointECEF);
  const endCanvasPosition = engine.worldToScreen(endPointECEF);
  if (startCanvasPosition === null || endCanvasPosition === null) {
    return null;
  }

  const startScreenPosition = toCssPixelPosition(
    startCanvasPosition.x,
    startCanvasPosition.y
  );
  const endScreenPosition = toCssPixelPosition(
    endCanvasPosition.x,
    endCanvasPosition.y
  );
  const anchorIsStart = resolveDistanceTriangleAnchorSelection({
    overlay,
  });
  const anchorCoordinate = anchorIsStart
    ? edge.startCoordinate
    : edge.endCoordinate;
  const targetCoordinate = anchorIsStart
    ? edge.endCoordinate
    : edge.startCoordinate;
  const anchorPointECEF = anchorIsStart ? startPointECEF : endPointECEF;
  const targetPointECEF = anchorIsStart ? endPointECEF : startPointECEF;
  const anchorScreenPosition = anchorIsStart
    ? startScreenPosition
    : endScreenPosition;
  const targetScreenPosition = anchorIsStart
    ? endScreenPosition
    : startScreenPosition;
  const auxiliaryPointECEF = buildAuxiliaryPoint({
    engine,
    anchorPointECEF,
    targetPointECEF,
    scratch,
  });
  if (!auxiliaryPointECEF) {
    return null;
  }

  const auxiliaryCanvasPosition = engine.worldToScreen(
    auxiliaryPointECEF,
    scratch.auxiliaryScreen
  );
  if (auxiliaryCanvasPosition === null) {
    return null;
  }

  const auxiliaryScreenPosition = toCssPixelPosition(
    auxiliaryCanvasPosition.x,
    auxiliaryCanvasPosition.y
  );
  const labelReferences = buildDistanceTriangleLineLabelReferences({
    anchor: anchorScreenPosition,
    target: targetScreenPosition,
    aux: auxiliaryScreenPosition,
    anchorAltitudeMeters: anchorCoordinate.altitude,
    targetAltitudeMeters: targetCoordinate.altitude,
    previousOutsideSigns,
  });
  const directLabelText = formatLengthMeters(
    anchorPointECEF.distanceTo(targetPointECEF),
    formatOptions.lengthMeters
  );
  const verticalDistanceMeters = anchorPointECEF.distanceTo(auxiliaryPointECEF);
  const horizontalDistanceMeters =
    auxiliaryPointECEF.distanceTo(targetPointECEF);
  const verticalLabelText =
    verticalDistanceMeters > annotationOverlayDefaults.geometryEpsilonMeters
      ? formatLengthMeters(verticalDistanceMeters, formatOptions.lengthMeters)
      : null;
  const horizontalLabelText =
    horizontalDistanceMeters > annotationOverlayDefaults.geometryEpsilonMeters
      ? formatLengthMeters(horizontalDistanceMeters, formatOptions.lengthMeters)
      : null;
  const componentLabelVisibility =
    resolveDistanceTriangleComponentLabelVisibility({
      directLabelText,
      verticalLabelText,
      horizontalLabelText,
    });

  return {
    anchorPointECEF,
    targetPointECEF,
    auxiliaryPointECEF,
    anchorScreenPosition,
    targetScreenPosition,
    auxiliaryScreenPosition,
    directLabelText,
    verticalLabelText,
    horizontalLabelText,
    showVerticalLabel: componentLabelVisibility.showVerticalLabel,
    showHorizontalLabel: componentLabelVisibility.showHorizontalLabel,
    directOutsideReferencePoint: labelReferences.directOutsideReferencePoint,
    verticalOutsideReferencePoint:
      labelReferences.verticalOutsideReferencePoint,
    horizontalOutsideReferencePoint:
      labelReferences.horizontalOutsideReferencePoint,
    nextOutsideSigns: labelReferences.nextOutsideSigns,
  };
};
