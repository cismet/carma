import {
  RUNTIME_POINT_LABEL_COORDINATE_SELECTION,
  applySelectedEdgeVisualStyle,
  applySelectedPointMarkerVisualStyle,
  buildRuntimeNodeCoordinateMap,
  resolveMeasurementCoordinates,
  typographyDefaults,
  type AnnotationNode,
  type AnnotationsRuntimeFormatOptions,
  type EdgeVisualStyle,
  type PointMarkerVisualStyle,
  type RuntimeEdgeRenderModel,
  type RuntimePointLabelCoordinateCandidate,
  type RuntimePointLabelRenderModel,
  type RuntimePointMarkerRenderModel,
  type StoredAnnotation,
  type StoredAnnotationLabelTheme,
} from "@carma-mapping/annotations/runtime";
import { formatLengthMeters } from "@carma-units";
import { computePolylineTotalLengthMeters } from "../utils/measurement-summaries";

type PolylineToolVisuals = {
  edge: EdgeVisualStyle;
  point: PointMarkerVisualStyle;
};

type BuildPolylineToolRenderModelsArgs = {
  toolType: StoredAnnotation["toolType"];
  visuals: PolylineToolVisuals;
  formatOptions: AnnotationsRuntimeFormatOptions;
  labelTheme: StoredAnnotationLabelTheme;
  getLabel: (annotationIndex: number) => string;
  nodes: readonly AnnotationNode[];
  annotations: readonly StoredAnnotation[];
  selectedAnnotationIds: readonly string[];
  onSelect?: (annotationId: string) => void;
};

/**
 * The polyline draws like the distance line: plain nodes and segment
 * lengths, the ruler while selected, and one badge with the total length at
 * the screen-left end of the chain (badge and value like the point label,
 * stem and selection glow like every other measurement badge). Node long
 * presses come from the runtime for every node marker.
 */
export const buildPolylineToolRenderModels = ({
  toolType,
  visuals,
  formatOptions,
  labelTheme,
  getLabel,
  nodes,
  annotations,
  selectedAnnotationIds,
  onSelect,
}: BuildPolylineToolRenderModelsArgs): {
  points: readonly RuntimePointMarkerRenderModel[];
  edges: readonly RuntimeEdgeRenderModel[];
  pointLabels: readonly RuntimePointLabelRenderModel[];
} => {
  const nodeCoordinatesById = buildRuntimeNodeCoordinateMap(nodes);
  const visiblePolylines = annotations.filter(
    (annotation) => annotation.toolType === toolType && !annotation.hidden
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

    const isSelected = selectedAnnotationIdSet.has(annotation.id);
    return [
      {
        id: annotation.id,
        annotationId: annotation.id,
        nodeIds: annotation.nodeIds,
        coordinates,
        overlayDashed: true as const,
        showSegmentLengthLabels: true as const,
        // The ruler of the distance line, only while selected or drafted.
        ...(isSelected ? { ruler: true as const } : {}),
        ...(isSelected
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
          onClick: onSelect ? () => onSelect(annotation.id) : undefined,
          ...(selectedAnnotationIdSet.has(annotation.id)
            ? applySelectedPointMarkerVisualStyle(visuals.point)
            : visuals.point),
        },
      ];
    })
  );

  const committedPointLabels = visiblePolylines.flatMap(
    (annotation, annotationIndex): RuntimePointLabelRenderModel[] => {
      const badgeText =
        annotation.shortLabel?.trim() || getLabel(annotationIndex + 1);
      const firstNodeId = annotation.nodeIds[0];
      const lastNodeId = annotation.nodeIds[annotation.nodeIds.length - 1];
      const coordinateCandidates = [firstNodeId, lastNodeId]
        .filter(
          (nodeId, index, nodeIds): nodeId is string =>
            nodeId !== undefined && nodeIds.indexOf(nodeId) === index
        )
        .flatMap<RuntimePointLabelCoordinateCandidate>((nodeId) => {
          const coordinate = nodeCoordinatesById.get(nodeId);
          return coordinate ? [{ coordinate, nodeId }] : [];
        });
      const anchor = coordinateCandidates[0];
      if (!anchor) {
        return [];
      }

      const isSelected = selectedAnnotationIdSet.has(annotation.id);
      const pointVisuals = isSelected
        ? applySelectedPointMarkerVisualStyle(visuals.point)
        : visuals.point;
      const totalLengthText = formatLengthMeters(
        computePolylineTotalLengthMeters(
          resolveMeasurementCoordinates(annotation, nodeCoordinatesById)
        ),
        formatOptions.lengthMeters
      );
      const labelColorScheme = labelTheme.scheme;
      const selectedHighlight = labelTheme.selection;

      return [
        {
          id: `${annotation.id}-label`,
          annotationId: annotation.id,
          nodeId: anchor.nodeId,
          coordinate: anchor.coordinate,
          coordinateCandidates,
          // The end on the left of the screen, the label running outward.
          coordinateSelection:
            RUNTIME_POINT_LABEL_COORDINATE_SELECTION.LEFTMOST_SCREEN_SPACE,
          preferredAttach: "right",
          markerPixelSize: pointVisuals.pixelSize,
          markerOutlineWidth: pointVisuals.outlineWidth,
          stemStartDistance:
            pointVisuals.pixelSize / 2 + pointVisuals.outlineWidth / 2,
          content: totalLengthText,
          badgeContent: badgeText,
          hideMarker: true,
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
          onClick: onSelect ? () => onSelect(annotation.id) : undefined,
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
