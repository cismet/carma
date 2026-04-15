import type { AnnotationsRuntimeFormatOptions } from "../../config/annotations-runtime-format-options";
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
import {
  formatPointElevationLabelText,
  resolvePointElevationDisplayMode,
  resolvePointElevationReferenceCoordinate,
} from "./point-tool-elevation-display";
import type { PointToolVisualSettings } from "./point-tool-settings";
import { annotationTypographyDefaults } from "../../config/annotation-typography-defaults";
import type { AnnotationMeasurementLabelTheme } from "../../config/annotation-measurement-label-themes";

type BuildPointToolRenderModelsArgs = {
  toolType: RuntimeMeasurement["toolType"];
  visuals: PointToolVisualSettings;
  labelTheme: AnnotationMeasurementLabelTheme;
  formatOptions: AnnotationsRuntimeFormatOptions;
  getMeasurementLabel: (measurementIndex: number) => string;
  nodes: readonly RuntimeNode[];
  measurements: readonly RuntimeMeasurement[];
  elevationReferenceAnnotationId: string | null;
  selectedMeasurementIds: readonly string[];
  isSelectionAdditiveModifierPressed: boolean;
  onMeasurementSelect: (measurementId: string) => void;
  onMeasurementLabelClick: (measurementId: string) => void;
  onMeasurementLabelDoubleClick: (measurementId: string) => void;
  onNodeLongPress?: (nodeId: string, measurementId: string) => void;
};

export const buildPointToolRenderModels = ({
  toolType,
  visuals,
  labelTheme,
  formatOptions,
  getMeasurementLabel,
  nodes,
  measurements,
  elevationReferenceAnnotationId,
  selectedMeasurementIds,
  isSelectionAdditiveModifierPressed,
  onMeasurementSelect,
  onMeasurementLabelClick,
  onMeasurementLabelDoubleClick,
  onNodeLongPress,
}: BuildPointToolRenderModelsArgs): {
  points: readonly RuntimePointMarkerRenderModel[];
  pointLabels: readonly RuntimePointLabelRenderModel[];
} => {
  const nodeCoordinatesById = buildRuntimeNodeCoordinateMap(nodes);
  const pointMeasurements = measurements.filter(
    (measurement) => measurement.toolType === toolType
  );
  const visiblePointMeasurements = pointMeasurements.filter(
    (measurement) => !measurement.hidden
  );
  const selectedMeasurementIdSet = new Set(selectedMeasurementIds);
  const referenceCoordinate = resolvePointElevationReferenceCoordinate({
    annotationEntries: pointMeasurements,
    nodes,
    configuredReferenceAnnotationId: elevationReferenceAnnotationId,
  });

  return {
    points: visiblePointMeasurements.flatMap((measurement) => {
      const coordinate =
        resolveMeasurementCoordinates(measurement, nodeCoordinatesById)[0] ??
        null;

      if (!coordinate) {
        return [];
      }

      return [
        {
          id: measurement.id,
          measurementId: measurement.id,
          nodeId: measurement.nodeIds[0],
          coordinate,
          ...(selectedMeasurementIdSet.has(measurement.id)
            ? visuals.selectedPoint
            : visuals.point),
        },
      ];
    }),
    pointLabels: visiblePointMeasurements.flatMap((measurement, pointIndex) => {
      const coordinate =
        resolveMeasurementCoordinates(measurement, nodeCoordinatesById)[0] ??
        null;

      if (!coordinate) {
        return [];
      }
      const pointNodeId = measurement.nodeIds[0] ?? null;
      const isSelected = selectedMeasurementIdSet.has(measurement.id);
      const pointVisuals = isSelected ? visuals.selectedPoint : visuals.point;
      const selectedHighlight = labelTheme.selection;
      const labelColorScheme = labelTheme.scheme;

      const badgeText =
        measurement.shortLabel?.trim() || getMeasurementLabel(pointIndex + 1);
      const elevationText = formatPointElevationLabelText({
        coordinate,
        referenceCoordinate,
        elevationDisplayMode: resolvePointElevationDisplayMode(measurement),
        formatOptions,
      });

      return [
        {
          id: `${measurement.id}-label`,
          measurementId: measurement.id,
          nodeId: pointNodeId ?? undefined,
          pointMarkerId: measurement.id,
          coordinate,
          markerPixelSize: pointVisuals.pixelSize,
          markerOutlineWidth: pointVisuals.outlineWidth,
          content: elevationText,
          badgeContent: badgeText,
          fontSize: annotationTypographyDefaults.rootFontSizeRem,
          fontFamily: labelTheme.fontFamily,
          fontWeight: labelTheme.contentFontWeight,
          lineColor: labelColorScheme.lineColor,
          textBackgroundColor: labelColorScheme.colorPrimaryReduced,
          textColor: labelColorScheme.textColor,
          markerBackgroundColor: labelColorScheme.colorPrimary,
          markerTextColor: labelColorScheme.textColor,
          selectedBackgroundColor: selectedHighlight.backgroundColor,
          selectedTextColor: selectedHighlight.textColor,
          selectedGlowColor: selectedHighlight.glowColor,
          selectedGlowRadiusPx: selectedHighlight.glowRadiusPx,
          preserveFillOnSelection: selectedHighlight.preserveFillOnSelection,
          hoverBackgroundColor: selectedHighlight.hoverBackgroundColor,
          selected: isSelected,
          onClick: () => {
            if (isSelected && !isSelectionAdditiveModifierPressed) {
              onMeasurementLabelClick(measurement.id);
            }
            onMeasurementSelect(measurement.id);
          },
          onDoubleClick: () => {
            onMeasurementLabelDoubleClick(measurement.id);
            onMeasurementSelect(measurement.id);
          },
          onLongPress:
            onNodeLongPress && pointNodeId && !measurement.locked
              ? () => onNodeLongPress(pointNodeId, measurement.id)
              : undefined,
        },
      ];
    }),
  };
};
