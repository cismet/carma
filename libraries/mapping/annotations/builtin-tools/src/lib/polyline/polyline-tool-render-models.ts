import type {
  AnnotationNode,
  EdgeVisualStyle,
  PointMarkerVisualStyle,
  StoredAnnotation,
} from "@carma-mapping/annotations/runtime";
import type {
  RuntimeEdgeRenderModel,
  RuntimePointLabelRenderModel,
  RuntimePointMarkerRenderModel,
} from "@carma-mapping/annotations/runtime";
import type { AnnotationsRuntimeFormatOptions } from "@carma-mapping/annotations/runtime";
import {
  buildRuntimeNodeCoordinateMap,
  resolveMeasurementCoordinates,
} from "@carma-mapping/annotations/runtime";
import { formatLengthMeters } from "@carma-units";
import {
  applySelectedEdgeVisualStyle,
  applySelectedPointMarkerVisualStyle,
} from "@carma-mapping/annotations/runtime";
import { computePolylineTotalLengthMeters } from "../utils/measurement-summaries";

type PolylineToolVisuals = {
  edge: EdgeVisualStyle;
  point: PointMarkerVisualStyle;
};

type BuildPolylineToolRenderModelsArgs = {
  toolType: StoredAnnotation["toolType"];
  visuals: PolylineToolVisuals;
  formatOptions: AnnotationsRuntimeFormatOptions;
  badgeStyle: {
    backgroundColor: string;
    textColor: string;
  };
  getLabel: (annotationIndex: number) => string;
  nodes: readonly AnnotationNode[];
  annotations: readonly StoredAnnotation[];
  selectedAnnotationIds: readonly string[];
  onSelect?: (annotationId: string) => void;
  onNodeLongPress?: (nodeId: string, annotationId: string) => void;
};

export const buildPolylineToolRenderModels = ({
  toolType,
  visuals,
  formatOptions,
  badgeStyle,
  getLabel,
  nodes,
  annotations,
  selectedAnnotationIds,
  onSelect,
  onNodeLongPress,
}: BuildPolylineToolRenderModelsArgs): {
  points: readonly RuntimePointMarkerRenderModel[];
  edges: readonly RuntimeEdgeRenderModel[];
  pointLabels: readonly RuntimePointLabelRenderModel[];
} => {
  const nodeCoordinatesById = buildRuntimeNodeCoordinateMap(nodes);
  const committedPolylineAnnotations = annotations.filter(
    (annotation) => annotation.toolType === toolType
  );
  const visiblePolylines = committedPolylineAnnotations.filter(
    (annotation) => !annotation.hidden
  );
  const selectedAnnotationIdSet = new Set(selectedAnnotationIds);

  const committedEdges = visiblePolylines.flatMap((annotation) => {
    const coordinates = resolveMeasurementCoordinates(
      annotation,
      nodeCoordinatesById
    );

    if (coordinates.length < 2) {
      return [];
    }

    return [
      {
        id: annotation.id,
        annotationId: annotation.id,
        nodeIds: annotation.nodeIds,
        coordinates,
        overlayDashed: true as const,
        showSegmentLengthLabels: true as const,
        ...(selectedAnnotationIdSet.has(annotation.id)
          ? applySelectedEdgeVisualStyle(visuals.edge)
          : visuals.edge),
      },
    ];
  });

  const committedPoints = visiblePolylines.flatMap((annotation) =>
    annotation.nodeIds.flatMap((nodeId, index) => {
      const coordinate = nodeCoordinatesById.get(nodeId);
      if (!coordinate) {
        return [];
      }

      return [
        {
          id: `${annotation.id}-node-${index}`,
          annotationId: annotation.id,
          nodeId,
          coordinate,
          onClick: onSelect
            ? () => onSelect(annotation.id)
            : undefined,
          ...(selectedAnnotationIdSet.has(annotation.id)
            ? applySelectedPointMarkerVisualStyle(visuals.point)
            : visuals.point),
        },
      ];
    })
  );

  const committedPointLabels = visiblePolylines.flatMap(
    (annotation, annotationIndex) => {
      const badgeText =
        annotation.shortLabel?.trim() ||
        getLabel(annotationIndex + 1);
      const lastNodeIndex = annotation.nodeIds.length - 1;
      const lastNodeId =
        lastNodeIndex >= 0 ? annotation.nodeIds[lastNodeIndex] : undefined;
      const coordinate = lastNodeId
        ? nodeCoordinatesById.get(lastNodeId)
        : undefined;
      if (!coordinate || !lastNodeId) {
        return [];
      }

      const pointVisuals = selectedAnnotationIdSet.has(annotation.id)
        ? applySelectedPointMarkerVisualStyle(visuals.point)
        : visuals.point;
      const totalLengthText = formatLengthMeters(
        computePolylineTotalLengthMeters(
          resolveMeasurementCoordinates(annotation, nodeCoordinatesById)
        ),
        formatOptions.lengthMeters
      );

      return [
        {
          id: `${annotation.id}-label`,
          annotationId: annotation.id,
          nodeId: lastNodeId,
          pointMarkerId: `${annotation.id}-node-${lastNodeIndex}`,
          coordinate,
          markerPixelSize: pointVisuals.pixelSize,
          markerOutlineWidth: pointVisuals.outlineWidth,
          content: `${badgeText} ${totalLengthText}`,
          badgeContent: badgeText,
          markerBackgroundColor: badgeStyle.backgroundColor,
          markerTextColor: badgeStyle.textColor,
          selected: selectedAnnotationIdSet.has(annotation.id),
          onClick: onSelect
            ? () => onSelect(annotation.id)
            : undefined,
          onLongPress:
            onNodeLongPress && !annotation.locked
              ? () => onNodeLongPress(lastNodeId, annotation.id)
              : undefined,
        },
      ];
    }
  );

  return {
    points: committedPoints,
    edges: committedEdges,
    pointLabels: committedPointLabels,
  };
};
