import type { RuntimeCoordinate } from "../store";
import type {
  RuntimeEdgeRenderModel,
  RuntimePointLabelRenderModel,
  RuntimePointMarkerRenderModel,
} from "./measurementRenderModels";

export type RuntimeRenderLayer = {
  points?: readonly RuntimePointMarkerRenderModel[];
  edges?: readonly RuntimeEdgeRenderModel[];
  pointLabels?: readonly RuntimePointLabelRenderModel[];
};

export type RuntimeCursorScreenPosition = {
  x: number;
  y: number;
} | null;

const areCoordinatesEqual = (
  left: RuntimeCoordinate,
  right: RuntimeCoordinate
) =>
  left.latitude === right.latitude &&
  left.longitude === right.longitude &&
  left.altitude === right.altitude;

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
      edge.dashed === otherEdge.dashed &&
      edge.coordinates.length === otherEdge.coordinates.length &&
      edge.coordinates.every((coordinate, coordinateIndex) => {
        const otherCoordinate = otherEdge.coordinates[coordinateIndex];

        return (
          otherCoordinate !== undefined &&
          areCoordinatesEqual(coordinate, otherCoordinate)
        );
      })
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
      areCoordinatesEqual(label.coordinate, otherLabel.coordinate) &&
      label.content === otherLabel.content &&
      label.markerContent === otherLabel.markerContent &&
      label.markerBackgroundColor === otherLabel.markerBackgroundColor &&
      label.markerTextColor === otherLabel.markerTextColor &&
      label.selected === otherLabel.selected &&
      label.hideLabelAndStem === otherLabel.hideLabelAndStem
    );
  });

export const areRuntimeRenderLayersEqual = (
  left: RuntimeRenderLayer | undefined,
  right: RuntimeRenderLayer
) =>
  left !== undefined &&
  arePointMarkersEqual(left.points, right.points) &&
  areEdgesEqual(left.edges, right.edges) &&
  arePointLabelsEqual(left.pointLabels, right.pointLabels);

export const areRuntimeCursorScreenPositionsEqual = (
  left: RuntimeCursorScreenPosition,
  right: RuntimeCursorScreenPosition
) =>
  left === right ||
  (left !== null && right !== null && left.x === right.x && left.y === right.y);
