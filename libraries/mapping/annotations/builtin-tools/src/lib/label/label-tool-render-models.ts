import { POINT_LABEL_STYLE } from "@carma-providers/label-overlay";

import type {
  StoredAnnotation,
  AnnotationNode,
} from "@carma-mapping/annotations/runtime";
import type {
  RuntimePointLabelRenderModel,
  RuntimePointMarkerRenderModel,
} from "@carma-mapping/annotations/runtime";
import {
  buildRuntimeNodeCoordinateMap,
  resolveMeasurementCoordinates,
} from "@carma-mapping/annotations/runtime";
import { getDefaultLabelDisplayName } from "./label-tool-actions";

const resolveLabelAppearanceFontSize = (
  fontSizePx: number | undefined
): string | undefined => {
  const resolvedFontSizePx = Number(fontSizePx);
  return Number.isFinite(resolvedFontSizePx) && resolvedFontSizePx > 0
    ? `${Math.round(resolvedFontSizePx)}px`
    : undefined;
};

export const buildLabelToolRenderModels = ({
  toolType,
  nodes,
  measurements,
  selectedMeasurementIds,
  onMeasurementSelect,
  onNodeLongPress,
  defaultDisplayNamePrefix,
}: {
  toolType: StoredAnnotation["toolType"];
  nodes: readonly AnnotationNode[];
  measurements: readonly StoredAnnotation[];
  selectedMeasurementIds: readonly string[];
  onMeasurementSelect: (measurementId: string) => void;
  onNodeLongPress?: (nodeId: string, measurementId: string) => void;
  defaultDisplayNamePrefix?: string;
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
    points: [],
    pointLabels: visibleLabelMeasurements.flatMap((measurement, labelIndex) => {
      const coordinate =
        resolveMeasurementCoordinates(measurement, nodeCoordinatesById)[0] ??
        null;
      if (!coordinate) {
        return [];
      }

      const displayName =
        measurement.displayName?.trim() ||
        getDefaultLabelDisplayName(labelIndex + 1, defaultDisplayNamePrefix);
      const pointNodeId = measurement.nodeIds[0] ?? null;
      const labelAppearance = measurement.labelAppearance;
      const customBackgroundColor =
        labelAppearance?.backgroundColor ?? undefined;
      const customTextColor = labelAppearance?.textColor ?? undefined;
      const hasCustomBackgroundColor = Boolean(customBackgroundColor);

      return [
        {
          id: `${measurement.id}-label`,
          measurementId: measurement.id,
          nodeId: pointNodeId ?? undefined,
          coordinate,
          content: displayName,
          badgeContent: displayName,
          fontSize: resolveLabelAppearanceFontSize(labelAppearance?.fontSizePx),
          textBackgroundColor: customBackgroundColor,
          textColor: customTextColor,
          markerBackgroundColor: customBackgroundColor,
          markerTextColor: customTextColor,
          selectedBackgroundColor: customBackgroundColor,
          selectedTextColor: customTextColor,
          preserveFillOnSelection: hasCustomBackgroundColor,
          hoverBackgroundColor: customBackgroundColor,
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
