import type {
  RuntimeCoordinate,
  RuntimeMeasurement,
  RuntimeNode,
} from "../../context/AnnotationsProvider";
import type {
  RuntimeEdgeRenderModel,
  RuntimePointLabelRenderModel,
  RuntimePointMarkerRenderModel,
} from "../../render/measurementRenderModels";
import {
  buildRuntimeNodeCoordinateMap,
  resolveMeasurementCoordinates,
} from "../../render/resolveMeasurementCoordinates";
import type { DistanceToolVisualSettings } from "./distanceToolSettings";

type BuildDistanceToolRenderModelsArgs = {
  toolType: RuntimeMeasurement["toolType"];
  visuals: DistanceToolVisualSettings;
  badgeStyle: {
    backgroundColor: string;
    textColor: string;
  };
  getMeasurementLabel: (measurementIndex: number) => string;
  nodes: readonly RuntimeNode[];
  measurements: readonly RuntimeMeasurement[];
  previewCoordinates: readonly RuntimeCoordinate[];
  selectedMeasurementId: string | null;
  onMeasurementSelect?: (measurementId: string) => void;
  onNodeLongPress?: (nodeId: string, measurementId: string) => void;
};

export const buildDistanceToolRenderModels = ({
  toolType,
  visuals,
  badgeStyle,
  getMeasurementLabel,
  nodes,
  measurements,
  previewCoordinates,
  selectedMeasurementId,
  onMeasurementSelect,
  onNodeLongPress,
}: BuildDistanceToolRenderModelsArgs): {
  points: readonly RuntimePointMarkerRenderModel[];
  edges: readonly RuntimeEdgeRenderModel[];
  pointLabels: readonly RuntimePointLabelRenderModel[];
} => {
  const nodeCoordinatesById = buildRuntimeNodeCoordinateMap(nodes);
  const distanceMeasurements = measurements.filter(
    (measurement) => measurement.toolType === toolType
  );

  const committedEdges = distanceMeasurements.flatMap((measurement) => {
    const coordinates = resolveMeasurementCoordinates(
      measurement,
      nodeCoordinatesById
    );

    if (coordinates.length < 2) {
      return [];
    }

    return [
      {
        id: measurement.id,
        coordinates,
        ...(measurement.id === selectedMeasurementId
          ? visuals.selectedEdge
          : visuals.edge),
      },
    ];
  });

  const committedPoints = distanceMeasurements.flatMap((measurement) =>
    resolveMeasurementCoordinates(measurement, nodeCoordinatesById).map(
      (coordinate, index) => ({
        id: `${measurement.id}-node-${index}`,
        coordinate,
        ...(measurement.id === selectedMeasurementId
          ? visuals.selectedPoint
          : visuals.point),
      })
    )
  );

  const previewEdges =
    previewCoordinates.length >= 2
      ? [
          {
            id: "distance-preview-edge",
            coordinates: previewCoordinates,
            ...visuals.previewEdge,
            dashed: true,
          },
        ]
      : [];

  const previewPoints = previewCoordinates.map((coordinate, index) => ({
    id: `distance-preview-node-${index}`,
    coordinate,
    ...visuals.previewPoint,
  }));

  const committedPointLabels = distanceMeasurements.flatMap(
    (measurement, measurementIndex) => {
      const badgeText = getMeasurementLabel(measurementIndex + 1);

      return measurement.nodeIds.flatMap((nodeId, index) => {
        const coordinate = nodeCoordinatesById.get(nodeId);
        if (!coordinate) {
          return [];
        }

        return [
          {
            id: `${measurement.id}-label-${index}`,
            measurementId: measurement.id,
            nodeId,
            coordinate,
            content: badgeText,
            markerContent: badgeText,
            markerBackgroundColor: badgeStyle.backgroundColor,
            markerTextColor: badgeStyle.textColor,
            selected: measurement.id === selectedMeasurementId,
            onClick: onMeasurementSelect
              ? () => onMeasurementSelect(measurement.id)
              : undefined,
            onLongPress: onNodeLongPress
              ? () => onNodeLongPress(nodeId, measurement.id)
              : undefined,
          },
        ];
      });
    }
  );

  return {
    points: [...committedPoints, ...previewPoints],
    edges: [...committedEdges, ...previewEdges],
    pointLabels: committedPointLabels,
  };
};
