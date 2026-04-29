import type { AnnotationsRuntimeFormatOptions } from "@carma-mapping/annotations/runtime";
import type {
  StoredAnnotation,
  AnnotationNode,
  AnnotationElevationDisplayMode,
} from "@carma-mapping/annotations/runtime";
import type {
  PointMarkerVisualStyle,
  RuntimePointLabelRenderModel,
  RuntimePointMarkerRenderModel,
} from "@carma-mapping/annotations/runtime";
import {
  ANNOTATION_ELEVATION_DISPLAY_MODES,
  buildRuntimeNodeCoordinateMap,
  resolveMeasurementCoordinates,
} from "@carma-mapping/annotations/runtime";
import {
  formatPointElevationLabelText,
  resolvePointElevationReferenceCoordinate,
} from "./point-tool-elevation-display";
import { typographyDefaults } from "@carma-mapping/annotations/runtime";
import { applySelectedPointMarkerVisualStyle } from "@carma-mapping/annotations/runtime";
import type { StoredAnnotationLabelTheme } from "@carma-mapping/annotations/runtime";
import type { AnnotationToolDraftState } from "@carma-mapping/annotations/runtime";

type PointToolVisuals = {
  point: PointMarkerVisualStyle;
};

type BuildPointToolRenderModelsArgs = {
  toolType: StoredAnnotation["toolType"];
  visuals: PointToolVisuals;
  labelTheme: StoredAnnotationLabelTheme;
  formatOptions: AnnotationsRuntimeFormatOptions;
  getMeasurementLabel: (measurementIndex: number) => string;
  nodes: readonly AnnotationNode[];
  measurements: readonly StoredAnnotation[];
  draft?: AnnotationToolDraftState;
  elevationReferenceAnnotationId: string | null;
  selectedMeasurementIds: readonly string[];
  isSelectionAdditiveModifierPressed: boolean;
  onMeasurementSelect: (measurementId: string) => void;
  onMeasurementLabelClick: (
    measurementId: string,
    elevationDisplayMode: AnnotationElevationDisplayMode
  ) => void;
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
  draft,
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
  const draftCoordinates = draft?.coordinates ?? [];
  const totalPointMeasurementCount =
    pointMeasurements.length + draftCoordinates.length;
  const defaultElevationDisplayMode =
    totalPointMeasurementCount > 1
      ? ANNOTATION_ELEVATION_DISPLAY_MODES.RELATIVE
      : ANNOTATION_ELEVATION_DISPLAY_MODES.ABSOLUTE;
  const selectedMeasurementIdSet = new Set(selectedMeasurementIds);
  const referenceCoordinate = resolvePointElevationReferenceCoordinate({
    annotationEntries: pointMeasurements,
    nodes,
    configuredReferenceAnnotationId: elevationReferenceAnnotationId,
  });

  return {
    pointLabels: [
      ...visiblePointMeasurements.flatMap((measurement, pointIndex) => {
        const coordinate =
          resolveMeasurementCoordinates(measurement, nodeCoordinatesById)[0] ??
          null;

        if (!coordinate) {
          return [];
        }
        const pointNodeId = measurement.nodeIds[0] ?? null;
        const isSelected = selectedMeasurementIdSet.has(measurement.id);
        const pointVisuals = isSelected
          ? applySelectedPointMarkerVisualStyle(visuals.point)
          : visuals.point;
        const selectedHighlight = labelTheme.selection;
        const labelColorScheme = labelTheme.scheme;

        const badgeText =
          measurement.shortLabel?.trim() || getMeasurementLabel(pointIndex + 1);
        const elevationDisplayMode =
          measurement.elevationDisplayMode ?? defaultElevationDisplayMode;
        const elevationText = formatPointElevationLabelText({
          coordinate,
          referenceCoordinate,
          elevationDisplayMode,
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
            fontSize: typographyDefaults.rootFontSizeRem,
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
                onMeasurementLabelClick(measurement.id, elevationDisplayMode);
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
      ...draftCoordinates.flatMap((coordinate, pointIndex) => {
        const badgeText = getMeasurementLabel(
          visiblePointMeasurements.length + pointIndex + 1
        );
        const elevationText = formatPointElevationLabelText({
          coordinate,
          referenceCoordinate,
          elevationDisplayMode: defaultElevationDisplayMode,
          formatOptions,
        });
        const labelColorScheme = labelTheme.scheme;
        const selectedHighlight = labelTheme.selection;

        return [
          {
            id: `${toolType}-draft-label-${pointIndex}`,
            coordinate,
            pointMarkerId: `${toolType}-draft-point-${pointIndex}`,
            markerPixelSize: visuals.point.pixelSize,
            markerOutlineWidth: visuals.point.outlineWidth,
            content: elevationText,
            badgeContent: badgeText,
            fontSize: typographyDefaults.rootFontSizeRem,
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
          },
        ] satisfies RuntimePointLabelRenderModel[];
      }),
    ],
    points: [
      ...visiblePointMeasurements.flatMap((measurement) => {
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
              ? applySelectedPointMarkerVisualStyle(visuals.point)
              : visuals.point),
          },
        ];
      }),
      ...draftCoordinates.flatMap((coordinate, pointIndex) => [
        {
          id: `${toolType}-draft-point-${pointIndex}`,
          coordinate,
          ...visuals.point,
        },
      ]),
    ],
  };
};
