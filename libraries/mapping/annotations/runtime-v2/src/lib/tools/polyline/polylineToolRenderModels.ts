import type {
  RuntimeCoordinate,
  RuntimeNode,
  RuntimeMeasurement,
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
import type { PolylineToolVisualSettings } from "./polylineToolSettings";

type BuildPolylineToolRenderModelsArgs = {
  toolType: RuntimeMeasurement["toolType"];
  visuals: PolylineToolVisualSettings;
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

export const buildPolylineToolRenderModels = ({
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
}: BuildPolylineToolRenderModelsArgs): {
  points: readonly RuntimePointMarkerRenderModel[];
  edges: readonly RuntimeEdgeRenderModel[];
  pointLabels: readonly RuntimePointLabelRenderModel[];
} => {
  const nodeCoordinatesById = buildRuntimeNodeCoordinateMap(nodes);
  const committedPolylines = measurements.filter(
    (measurement) => measurement.toolType === toolType
  );

  const committedEdges = committedPolylines.flatMap((measurement) => {
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

  const committedPoints = committedPolylines.flatMap((measurement) =>
    measurement.nodeIds.flatMap((nodeId, index) => {
      const coordinate = nodeCoordinatesById.get(nodeId);
      if (!coordinate) {
        return [];
      }

      return [
        {
          id: `${measurement.id}-node-${index}`,
          coordinate,
          ...(measurement.id === selectedMeasurementId
            ? visuals.selectedPoint
            : visuals.point),
        },
      ];
    })
  );

  const previewEdges =
    previewCoordinates.length >= 2
      ? [
          {
            id: "polyline-preview-edge",
            coordinates: previewCoordinates,
            ...visuals.previewEdge,
            dashed: true,
          },
        ]
      : [];

  const previewPoints = previewCoordinates.map((coordinate, index) => ({
    id: `polyline-preview-node-${index}`,
    coordinate,
    ...visuals.previewPoint,
  }));

  const committedPointLabels = committedPolylines.flatMap(
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
