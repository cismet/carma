import { POINT_LABEL_STYLE } from "@carma-providers/label-overlay";

import type {
  RuntimeMeasurement,
  RuntimeNode,
} from "../../store/annotations-store.types";
import type {
  RuntimePointLabelRenderModel,
  RuntimePointMarkerRenderModel,
} from "../../render/measurement-render-models";
import {
  buildRuntimeNodeCoordinateMap,
  resolveMeasurementCoordinates,
} from "../../render/resolve-measurement-coordinates";
import type { LabelToolVisualSettings } from "./label-tool-settings";
import { getDefaultLabelDisplayName } from "./label-tool-actions";

export const buildLabelToolRenderModels = ({
  toolType,
  visuals,
  nodes,
  measurements,
  selectedMeasurementIds,
  onMeasurementSelect,
  onNodeLongPress,
}: {
  toolType: RuntimeMeasurement["toolType"];
  visuals: LabelToolVisualSettings;
  nodes: readonly RuntimeNode[];
  measurements: readonly RuntimeMeasurement[];
  selectedMeasurementIds: readonly string[];
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
  const visibleLabelMeasurements = labelMeasurements.filter(
    (measurement) => !measurement.hidden
  );
  const selectedMeasurementIdSet = new Set(selectedMeasurementIds);

  return {
    points: visibleLabelMeasurements.flatMap((measurement) => {
      const coordinate =
        resolveMeasurementCoordinates(measurement, nodeCoordinatesById)[0] ??
        null;
      if (!coordinate) {
        return [];
      }

      return [
        {
          id: `${measurement.id}-anchor`,
          measurementId: measurement.id,
          nodeId: measurement.nodeIds[0],
          coordinate,
          ...(selectedMeasurementIdSet.has(measurement.id)
            ? visuals.selectedPoint
            : visuals.point),
        },
      ];
    }),
    pointLabels: visibleLabelMeasurements.flatMap((measurement, labelIndex) => {
      const coordinate =
        resolveMeasurementCoordinates(measurement, nodeCoordinatesById)[0] ??
        null;
      if (!coordinate) {
        return [];
      }

      const displayName =
        measurement.displayName?.trim() ||
        getDefaultLabelDisplayName(labelIndex + 1);
      const pointNodeId = measurement.nodeIds[0] ?? null;

      return [
        {
          id: `${measurement.id}-label`,
          measurementId: measurement.id,
          nodeId: pointNodeId ?? undefined,
          coordinate,
          markerPixelSize: selectedMeasurementIdSet.has(measurement.id)
            ? visuals.selectedPoint.pixelSize
            : visuals.point.pixelSize,
          markerOutlineWidth: selectedMeasurementIdSet.has(measurement.id)
            ? visuals.selectedPoint.outlineWidth
            : visuals.point.outlineWidth,
          content: displayName,
          badgeContent: displayName,
          textBackgroundColor:
            measurement.labelAppearance?.backgroundColor ?? undefined,
          textColor: measurement.labelAppearance?.textColor ?? undefined,
          labelStyle: POINT_LABEL_STYLE.AUTO,
          hideMarker: true,
          collapse: false,
          selected: selectedMeasurementIdSet.has(measurement.id),
          onClick: () => onMeasurementSelect(measurement.id),
          onLongPress:
            onNodeLongPress && pointNodeId && !measurement.locked
              ? () => onNodeLongPress(pointNodeId, measurement.id)
              : undefined,
        },
      ];
    }),
  };
};
