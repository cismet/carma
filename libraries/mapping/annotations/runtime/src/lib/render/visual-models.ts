import {
  areCoordinateListsEqual,
  areCoordinatesEqual,
} from "../utils/coordinate-equality";
import type {
  RuntimeEdgeRenderModel,
  RuntimePointLabelRenderModel,
  RuntimePointMarkerRenderModel,
  RuntimePolygonFillRenderModel,
} from "./annotation-render-models";
export type RuntimeVisualModels = {
  points?: readonly RuntimePointMarkerRenderModel[];
  edges?: readonly RuntimeEdgeRenderModel[];
  polygonFills?: readonly RuntimePolygonFillRenderModel[];
  pointLabels?: readonly RuntimePointLabelRenderModel[];
};

export type RuntimeCursorScreenPosition = {
  x: number;
  y: number;
} | null;

const arePointMarkersEqual = (
  left: readonly RuntimePointMarkerRenderModel[] = [],
  right: readonly RuntimePointMarkerRenderModel[] = []
) =>
  left.length === right.length &&
  left.every((point, index) => {
    const otherPoint = right[index];

    return (
      otherPoint !== undefined &&
      point.id === otherPoint.id &&
      areCoordinatesEqual(point.coordinate, otherPoint.coordinate) &&
      point.pixelSize === otherPoint.pixelSize &&
      point.fill === otherPoint.fill &&
      point.outline === otherPoint.outline &&
      point.outlineWidth === otherPoint.outlineWidth
    );
  });

const areEdgesEqual = (
  left: readonly RuntimeEdgeRenderModel[] = [],
  right: readonly RuntimeEdgeRenderModel[] = []
) =>
  left.length === right.length &&
  left.every((edge, index) => {
    const otherEdge = right[index];

    return (
      otherEdge !== undefined &&
      edge.id === otherEdge.id &&
      edge.stroke === otherEdge.stroke &&
      edge.strokeWidth === otherEdge.strokeWidth &&
      edge.overlayDashPattern === otherEdge.overlayDashPattern &&
      edge.overlayDashed === otherEdge.overlayDashed &&
      edge.showSegmentLengthLabels === otherEdge.showSegmentLengthLabels &&
      areCoordinateListsEqual(edge.coordinates, otherEdge.coordinates)
    );
  });

const arePointLabelsEqual = (
  left: readonly RuntimePointLabelRenderModel[] = [],
  right: readonly RuntimePointLabelRenderModel[] = []
) =>
  left.length === right.length &&
  left.every((label, index) => {
    const otherLabel = right[index];

    return (
      otherLabel !== undefined &&
      label.id === otherLabel.id &&
      label.annotationId === otherLabel.annotationId &&
      label.nodeId === otherLabel.nodeId &&
      label.pointMarkerId === otherLabel.pointMarkerId &&
      areCoordinatesEqual(label.coordinate, otherLabel.coordinate) &&
      label.markerPixelSize === otherLabel.markerPixelSize &&
      label.anchorKind === otherLabel.anchorKind &&
      label.occlusionMode === otherLabel.occlusionMode &&
      label.content === otherLabel.content &&
      label.badgeContent === otherLabel.badgeContent &&
      label.markerBackgroundColor === otherLabel.markerBackgroundColor &&
      label.markerTextColor === otherLabel.markerTextColor &&
      label.lineColor === otherLabel.lineColor &&
      label.textBackgroundColor === otherLabel.textBackgroundColor &&
      label.textColor === otherLabel.textColor &&
      label.selectedBackgroundColor === otherLabel.selectedBackgroundColor &&
      label.selectedTextColor === otherLabel.selectedTextColor &&
      label.selectedGlowColor === otherLabel.selectedGlowColor &&
      label.selectedGlowRadiusPx === otherLabel.selectedGlowRadiusPx &&
      label.preserveFillOnSelection === otherLabel.preserveFillOnSelection &&
      label.hoverBackgroundColor === otherLabel.hoverBackgroundColor &&
      label.renderStyle === otherLabel.renderStyle &&
      label.labelStyle === otherLabel.labelStyle &&
      label.hideMarker === otherLabel.hideMarker &&
      label.collapse === otherLabel.collapse &&
      label.selected === otherLabel.selected &&
      label.hideLabelAndStem === otherLabel.hideLabelAndStem &&
      label.longPressDurationMs === otherLabel.longPressDurationMs
    );
  });

const arePolygonFillsEqual = (
  left: readonly RuntimePolygonFillRenderModel[] = [],
  right: readonly RuntimePolygonFillRenderModel[] = []
) =>
  left.length === right.length &&
  left.every((fill, index) => {
    const otherFill = right[index];

    return (
      otherFill !== undefined &&
      fill.id === otherFill.id &&
      fill.annotationId === otherFill.annotationId &&
      (fill.nodeIds?.length ?? 0) === (otherFill.nodeIds?.length ?? 0) &&
      (fill.nodeIds?.every(
        (nodeId, nodeIndex) => nodeId === otherFill.nodeIds?.[nodeIndex]
      ) ??
        true) &&
      fill.fill === otherFill.fill &&
      fill.overlayFill === otherFill.overlayFill &&
      fill.placement === otherFill.placement &&
      fill.selected === otherFill.selected &&
      areCoordinateListsEqual(fill.coordinates, otherFill.coordinates)
    );
  });

export const areRuntimeVisualModelsEqual = (
  left: RuntimeVisualModels | undefined,
  right: RuntimeVisualModels
) =>
  left !== undefined &&
  arePointMarkersEqual(left.points, right.points) &&
  areEdgesEqual(left.edges, right.edges) &&
  arePolygonFillsEqual(left.polygonFills, right.polygonFills) &&
  arePointLabelsEqual(left.pointLabels, right.pointLabels);

export const areRuntimeCursorScreenPositionsEqual = (
  left: RuntimeCursorScreenPosition,
  right: RuntimeCursorScreenPosition
) =>
  left === right ||
  (left !== null && right !== null && left.x === right.x && left.y === right.y);
