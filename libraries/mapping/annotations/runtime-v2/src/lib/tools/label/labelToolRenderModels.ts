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
import type { LabelToolVisualSettings } from "./labelToolSettings";
import { getDefaultLabelDisplayName } from "./labelToolActions";

export const buildLabelToolRenderModels = ({
  toolType,
  visuals,
  nodes,
  measurements,
  selectedMeasurementId,
  onMeasurementSelect,
  onNodeLongPress,
}: {
  toolType: RuntimeMeasurement["toolType"];
  visuals: LabelToolVisualSettings;
  nodes: readonly RuntimeNode[];
  measurements: readonly RuntimeMeasurement[];
  selectedMeasurementId: string | null;
  onMeasurementSelect: (measurementId: string) => void;
  onNodeLongPress?: (nodeId: string, measurementId: string) => void;
}): {
  points: readonly RuntimePointMarkerRenderModel[];
  pointLabels: readonly RuntimePointLabelRenderModel[];
} => {
  const nodeCoordinatesById = buildRuntimeNodeCoordinateMap(nodes);
  const labelMeasurements = measurements.filter(
    (measurement) => measurement.toolType === toolType
  );

  return {
    points: labelMeasurements.flatMap((measurement) => {
      const coordinate =
        resolveMeasurementCoordinates(measurement, nodeCoordinatesById)[0] ??
        null;
      if (!coordinate) {
        return [];
      }

      return [
        {
          id: `${measurement.id}-anchor`,
          coordinate,
          ...(measurement.id === selectedMeasurementId
            ? visuals.selectedPoint
            : visuals.point),
        },
      ];
    }),
    pointLabels: labelMeasurements.flatMap((measurement, labelIndex) => {
      const coordinate =
        resolveMeasurementCoordinates(measurement, nodeCoordinatesById)[0] ??
        null;
      if (!coordinate) {
        return [];
      }

      const displayName =
        measurement.displayName?.trim() || getDefaultLabelDisplayName(labelIndex + 1);
      const pointNodeId = measurement.nodeIds[0] ?? null;

      return [
        {
          id: `${measurement.id}-label`,
          measurementId: measurement.id,
          nodeId: pointNodeId ?? undefined,
          coordinate,
          markerPixelSize:
            measurement.id === selectedMeasurementId
              ? visuals.selectedPoint.pixelSize
              : visuals.point.pixelSize,
          content: displayName,
          compactContent: displayName,
          textBackgroundColor:
            measurement.labelAppearance?.backgroundColor ?? undefined,
          textColor: measurement.labelAppearance?.textColor ?? undefined,
          fontSize: Number.isFinite(measurement.labelAppearance?.fontSizePx)
            ? `${measurement.labelAppearance?.fontSizePx}px`
            : undefined,
          labelStyle: "auto",
          hideMarker: true,
          collapse: false,
          forceCollapse: false,
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
