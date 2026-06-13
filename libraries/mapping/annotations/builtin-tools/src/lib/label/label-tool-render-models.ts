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
  annotations,
  selectedAnnotationIds,
  onSelect,
  onNodeLongPress,
  defaultDisplayNamePrefix,
}: {
  toolType: StoredAnnotation["toolType"];
  nodes: readonly AnnotationNode[];
  annotations: readonly StoredAnnotation[];
  selectedAnnotationIds: readonly string[];
  onSelect: (annotationId: string) => void;
  onNodeLongPress?: (nodeId: string, annotationId: string) => void;
  defaultDisplayNamePrefix?: string;
}): {
  points: readonly RuntimePointMarkerRenderModel[];
  pointLabels: readonly RuntimePointLabelRenderModel[];
} => {
  const nodeCoordinatesById = buildRuntimeNodeCoordinateMap(nodes);
  const labelAnnotations = annotations.filter(
    (annotation) => annotation.toolType === toolType
  );
  const visibleLabelMeasurements = labelAnnotations.filter(
    (annotation) => !annotation.hidden
  );
  const selectedAnnotationIdSet = new Set(selectedAnnotationIds);

  return {
    points: [],
    pointLabels: visibleLabelMeasurements.flatMap((annotation, labelIndex) => {
      const coordinate =
        resolveMeasurementCoordinates(annotation, nodeCoordinatesById)[0] ??
        null;
      if (!coordinate) {
        return [];
      }

      const displayName =
        annotation.displayName?.trim() ||
        getDefaultLabelDisplayName(labelIndex + 1, defaultDisplayNamePrefix);
      const pointNodeId = annotation.nodeIds[0] ?? null;
      const labelAppearance = annotation.labelAppearance;
      const customBackgroundColor =
        labelAppearance?.backgroundColor ?? undefined;
      const customTextColor = labelAppearance?.textColor ?? undefined;
      const hasCustomBackgroundColor = Boolean(customBackgroundColor);

      return [
        {
          id: `${annotation.id}-label`,
          annotationId: annotation.id,
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
          selected: selectedAnnotationIdSet.has(annotation.id),
          onClick: () => onSelect(annotation.id),
          onLongPress:
            onNodeLongPress && pointNodeId && !annotation.locked
              ? () => onNodeLongPress(pointNodeId, annotation.id)
              : undefined,
        },
      ];
    }),
  };
};
