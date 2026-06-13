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
  type PointElevationTextLabels,
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
  getLabel: (annotationIndex: number) => string;
  nodes: readonly AnnotationNode[];
  annotations: readonly StoredAnnotation[];
  draft?: AnnotationToolDraftState;
  elevationReferenceAnnotationId: string | null;
  selectedAnnotationIds: readonly string[];
  isSelectionAdditiveModifierPressed: boolean;
  onSelect: (annotationId: string) => void;
  onLabelClick: (
    annotationId: string,
    elevationDisplayMode: AnnotationElevationDisplayMode
  ) => void;
  onLabelDoubleClick: (annotationId: string) => void;
  onNodeLongPress?: (nodeId: string, annotationId: string) => void;
  elevationLabels?: PointElevationTextLabels;
};

export const buildPointToolRenderModels = ({
  toolType,
  visuals,
  labelTheme,
  formatOptions,
  getLabel,
  nodes,
  annotations,
  draft,
  elevationReferenceAnnotationId,
  selectedAnnotationIds,
  isSelectionAdditiveModifierPressed,
  onSelect,
  onLabelClick,
  onLabelDoubleClick,
  onNodeLongPress,
  elevationLabels,
}: BuildPointToolRenderModelsArgs): {
  points: readonly RuntimePointMarkerRenderModel[];
  pointLabels: readonly RuntimePointLabelRenderModel[];
} => {
  const nodeCoordinatesById = buildRuntimeNodeCoordinateMap(nodes);
  const pointAnnotations = annotations.filter(
    (annotation) => annotation.toolType === toolType
  );
  const visiblePointAnnotations = pointAnnotations.filter(
    (annotation) => !annotation.hidden
  );
  const draftCoordinates = draft?.coordinates ?? [];
  const totalPointAnnotationCount =
    pointAnnotations.length + draftCoordinates.length;
  const defaultElevationDisplayMode =
    totalPointAnnotationCount > 1
      ? ANNOTATION_ELEVATION_DISPLAY_MODES.RELATIVE
      : ANNOTATION_ELEVATION_DISPLAY_MODES.ABSOLUTE;
  const selectedAnnotationIdSet = new Set(selectedAnnotationIds);
  const referenceCoordinate = resolvePointElevationReferenceCoordinate({
    annotationEntries: pointAnnotations,
    nodes,
    configuredReferenceAnnotationId: elevationReferenceAnnotationId,
  });

  return {
    pointLabels: [
      ...visiblePointAnnotations.flatMap((annotation, pointIndex) => {
        const coordinate =
          resolveMeasurementCoordinates(annotation, nodeCoordinatesById)[0] ??
          null;

        if (!coordinate) {
          return [];
        }
        const pointNodeId = annotation.nodeIds[0] ?? null;
        const isSelected = selectedAnnotationIdSet.has(annotation.id);
        const pointVisuals = isSelected
          ? applySelectedPointMarkerVisualStyle(visuals.point)
          : visuals.point;
        const selectedHighlight = labelTheme.selection;
        const labelColorScheme = labelTheme.scheme;

        const badgeText =
          annotation.shortLabel?.trim() || getLabel(pointIndex + 1);
        const elevationDisplayMode =
          annotation.elevationDisplayMode ?? defaultElevationDisplayMode;
        const elevationText = formatPointElevationLabelText({
          coordinate,
          referenceCoordinate,
          elevationDisplayMode,
          formatOptions,
          labels: elevationLabels,
        });

        return [
          {
            id: `${annotation.id}-label`,
            annotationId: annotation.id,
            nodeId: pointNodeId ?? undefined,
            pointMarkerId: annotation.id,
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
                onLabelClick(annotation.id, elevationDisplayMode);
              }
              onSelect(annotation.id);
            },
            onDoubleClick: () => {
              onLabelDoubleClick(annotation.id);
              onSelect(annotation.id);
            },
            onLongPress:
              onNodeLongPress && pointNodeId && !annotation.locked
                ? () => onNodeLongPress(pointNodeId, annotation.id)
                : undefined,
          },
        ];
      }),
      ...draftCoordinates.flatMap((coordinate, pointIndex) => {
        const badgeText = getLabel(
          visiblePointAnnotations.length + pointIndex + 1
        );
        const elevationText = formatPointElevationLabelText({
          coordinate,
          referenceCoordinate,
          elevationDisplayMode: defaultElevationDisplayMode,
          formatOptions,
          labels: elevationLabels,
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
      ...visiblePointAnnotations.flatMap((annotation) => {
        const coordinate =
          resolveMeasurementCoordinates(annotation, nodeCoordinatesById)[0] ??
          null;

        if (!coordinate) {
          return [];
        }

        return [
          {
            id: annotation.id,
            annotationId: annotation.id,
            nodeId: annotation.nodeIds[0],
            coordinate,
            ...(selectedAnnotationIdSet.has(annotation.id)
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
