import type {
  RuntimeMeasurement,
  RuntimeNode,
} from "../../context/AnnotationsProvider";
import type {
  RuntimePointLabelRenderModel,
  RuntimePointMarkerRenderModel,
} from "../../render/measurementRenderModels";
import {
  buildRuntimeNodeCoordinateMap,
  resolveMeasurementCoordinates,
} from "../../render/resolveMeasurementCoordinates";
import type { PointToolVisualSettings } from "./pointToolSettings";
type BuildPointToolRenderModelsArgs = {
  toolType: RuntimeMeasurement["toolType"];
  visuals: PointToolVisualSettings;
  badgeStyle: {
    backgroundColor: string;
    textColor: string;
  };
  getMeasurementLabel: (measurementIndex: number) => string;
  nodes: readonly RuntimeNode[];
  measurements: readonly RuntimeMeasurement[];
  selectedMeasurementId: string | null;
  onMeasurementSelect: (measurementId: string) => void;
  onNodeLongPress?: (nodeId: string, measurementId: string) => void;
};

export const buildPointToolRenderModels = ({
  toolType,
  visuals,
  badgeStyle,
  getMeasurementLabel,
  nodes,
  measurements,
  selectedMeasurementId,
  onMeasurementSelect,
  onNodeLongPress,
}: BuildPointToolRenderModelsArgs): {
  points: readonly RuntimePointMarkerRenderModel[];
  pointLabels: readonly RuntimePointLabelRenderModel[];
} => {
  const nodeCoordinatesById = buildRuntimeNodeCoordinateMap(nodes);
  const pointMeasurements = measurements.filter(
    (measurement) => measurement.toolType === toolType
  );

  return {
    points: pointMeasurements.flatMap((measurement) => {
      const coordinate =
        resolveMeasurementCoordinates(measurement, nodeCoordinatesById)[0] ??
        null;

      if (!coordinate) {
        return [];
      }

      return [
        {
          id: measurement.id,
          coordinate,
          ...(measurement.id === selectedMeasurementId
            ? visuals.selectedPoint
            : visuals.point),
        },
      ];
    }),
    pointLabels: pointMeasurements.flatMap((measurement, pointIndex) => {
      const coordinate =
        resolveMeasurementCoordinates(measurement, nodeCoordinatesById)[0] ??
        null;

      if (!coordinate) {
        return [];
      }
      const pointNodeId = measurement.nodeIds[0] ?? null;

      const badgeText = getMeasurementLabel(pointIndex + 1);

      return [
        {
          id: `${measurement.id}-label`,
          measurementId: measurement.id,
          nodeId: pointNodeId ?? undefined,
          coordinate,
          content: badgeText,
          markerBackgroundColor: badgeStyle.backgroundColor,
          markerTextColor: badgeStyle.textColor,
          selected: measurement.id === selectedMeasurementId,
          onClick: () => onMeasurementSelect(measurement.id),
          onLongPress:
            onNodeLongPress && pointNodeId
              ? () => onNodeLongPress(pointNodeId, measurement.id)
              : undefined,
        },
      ];
    }),
  };
};
