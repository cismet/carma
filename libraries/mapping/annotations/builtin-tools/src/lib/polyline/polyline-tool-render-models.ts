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
import {
  ANNOTATION_COMPONENT_DISPLAY_MODES,
  ANNOTATION_METER_MARKER_MODES,
  showsAnnotationComponents,
  showsAnnotationMeterMarkers,
  type AnnotationComponentDisplayMode,
  type AnnotationMeterMarkerMode,
} from "@carma-mapping/annotations/runtime";
import { formatLengthMeters } from "@carma-units";
import { computePolylineTotalLengthMeters } from "@carma-mapping/annotations/core";

type PolylineToolVisuals = {
  edge: EdgeVisualStyle;
  point: PointMarkerVisualStyle;
  /** When the line carries its meter markers; default always. */
  meterMarkers?: AnnotationMeterMarkerMode;
  /** When the line carries its segment length labels; default always. */
  components?: AnnotationComponentDisplayMode;
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
  /** Long press on the label of the last node; the end badge has none, the runtime adds it to every node marker. */
  onNodeLongPress?: (nodeId: string, annotationId: string) => void;
  /** The end badge instead of the label at the last node. */
  endBadge?: boolean;
};

/**
 * The polyline's total length. By default one label at the last node, the
 * badge token and the length in one text. With `endBadge` it draws like the
 * distance line: one badge with the total length at the screen-left end of
 * the chain (badge and value like the point label, stem and selection glow
 * like every other measurement badge). The meter markers and segment lengths
 * follow the line style options.
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
  onNodeLongPress,
  endBadge = false,
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
        // The segment length labels; the total length stays on the badge
        ...(showsAnnotationComponents(
          visuals.components ?? ANNOTATION_COMPONENT_DISPLAY_MODES.ALWAYS,
          isSelected
        )
          ? { showSegmentLengthLabels: true as const }
          : {}),
        // The meter markers of the distance line, counted on along the chain
        ...(showsAnnotationMeterMarkers(
          visuals.meterMarkers ?? ANNOTATION_METER_MARKER_MODES.ALWAYS,
          isSelected
        )
          ? { ruler: true as const }
          : {}),
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
      const onClick = onSelect ? () => onSelect(annotation.id) : undefined;

      if (!endBadge) {
        const lastNodeIndex = annotation.nodeIds.length - 1;
        const lastNodeId = annotation.nodeIds[lastNodeIndex];
        const lastCoordinate = lastNodeId
          ? nodeCoordinatesById.get(lastNodeId)
          : undefined;
        if (!lastCoordinate || !lastNodeId) {
          return [];
        }

        return [
          {
            id: `${annotation.id}-label`,
            annotationId: annotation.id,
            nodeId: lastNodeId,
            pointMarkerId: `${annotation.id}-node-${lastNodeIndex}`,
            coordinate: lastCoordinate,
            markerPixelSize: pointVisuals.pixelSize,
            markerOutlineWidth: pointVisuals.outlineWidth,
            content: `${badgeText} ${totalLengthText}`,
            badgeContent: badgeText,
            markerBackgroundColor: labelTheme.scheme.colorPrimary,
            markerTextColor: labelTheme.scheme.textColor,
            selected: isSelected,
            onClick,
            onLongPress:
              onNodeLongPress && !annotation.locked
                ? () => onNodeLongPress(lastNodeId, annotation.id)
                : undefined,
          },
        ];
      }

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
          onClick,
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
