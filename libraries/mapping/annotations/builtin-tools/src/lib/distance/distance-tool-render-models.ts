import { typographyDefaults } from "@carma-mapping/annotations/runtime";
import {
  applySelectedEdgeVisualStyle,
  applySelectedPointMarkerVisualStyle,
} from "@carma-mapping/annotations/runtime";
import type {
  EdgeVisualStyle,
  PointMarkerVisualStyle,
  RuntimeEdgeRenderModel,
  RuntimePointLabelRenderModel,
  RuntimePointMarkerRenderModel,
  RuntimePointLabelCoordinateCandidate,
} from "@carma-mapping/annotations/runtime";
import { RUNTIME_POINT_LABEL_COORDINATE_SELECTION } from "@carma-mapping/annotations/runtime";
import type {
  AnnotationEdge,
  AnnotationNodeLink,
  StoredAnnotation,
  AnnotationNode,
} from "@carma-mapping/annotations/runtime";
import { buildNodeLinkIdByNodeId } from "@carma-mapping/annotations/runtime";
import {
  resolveDistanceTriangleAnchorCoordinateRole,
  resolveDistanceTriangleAnchorCoordinateSelection,
  resolveOppositePointLabelCoordinateSelection,
} from "@carma-mapping/annotations/runtime";
import {
  buildRuntimeNodeCoordinateMap,
  resolveMeasurementCoordinates,
} from "@carma-mapping/annotations/runtime";
import type { StoredAnnotationLabelTheme } from "@carma-mapping/annotations/runtime";

type DistanceToolVisuals = {
  edge: EdgeVisualStyle;
  point: PointMarkerVisualStyle;
};

type PointLabelCoordinateSelection = NonNullable<
  RuntimePointLabelRenderModel["coordinateSelection"]
>;

const resolveDistanceBadgePreferredAttach = (
  coordinateSelection: PointLabelCoordinateSelection
): RuntimePointLabelRenderModel["preferredAttach"] =>
  coordinateSelection ===
  RUNTIME_POINT_LABEL_COORDINATE_SELECTION.LEFTMOST_SCREEN_SPACE
    ? "right"
    : "left";

const resolveDistanceBadgeLabelCoordinateSelection = (
  anchorCoordinateSelection: PointLabelCoordinateSelection
): PointLabelCoordinateSelection =>
  resolveOppositePointLabelCoordinateSelection(anchorCoordinateSelection);

const resolveDistanceBadgeNodeId = ({
  coordinateCandidates,
  coordinateSelection,
}: {
  coordinateCandidates: readonly RuntimePointLabelCoordinateCandidate[];
  coordinateSelection: PointLabelCoordinateSelection;
}): string | undefined => {
  if (coordinateCandidates.length === 0) {
    return undefined;
  }

  if (
    coordinateSelection ===
    RUNTIME_POINT_LABEL_COORDINATE_SELECTION.LEFTMOST_SCREEN_SPACE
  ) {
    return coordinateCandidates[0]?.nodeId;
  }

  return coordinateCandidates[coordinateCandidates.length - 1]?.nodeId;
};

const buildNodeLinkSizeByNodeId = (nodeLinks: readonly AnnotationNodeLink[]) =>
  new Map(
    nodeLinks.flatMap((nodeLink) =>
      nodeLink.nodeIds.map((nodeId) => [nodeId, nodeLink.nodeIds.length])
    )
  );

const buildNodeLinkIncidentEdgeCountByNodeId = ({
  nodeLinks,
  edges,
}: {
  nodeLinks: readonly AnnotationNodeLink[];
  edges: readonly AnnotationEdge[];
}) => {
  const nodeLinkIdByNodeId = buildNodeLinkIdByNodeId(nodeLinks);
  const incidentEdgeCountByGroupId = new Map<string, number>();

  nodeLinks.forEach((nodeLink) => {
    incidentEdgeCountByGroupId.set(nodeLink.id, 0);
  });

  edges.forEach((edge) => {
    const startGroupId =
      nodeLinkIdByNodeId.get(edge.startNodeId) ?? edge.startNodeId;
    const endGroupId = nodeLinkIdByNodeId.get(edge.endNodeId) ?? edge.endNodeId;

    incidentEdgeCountByGroupId.set(
      startGroupId,
      (incidentEdgeCountByGroupId.get(startGroupId) ?? 0) + 1
    );

    if (endGroupId === startGroupId) {
      return;
    }

    incidentEdgeCountByGroupId.set(
      endGroupId,
      (incidentEdgeCountByGroupId.get(endGroupId) ?? 0) + 1
    );
  });

  return new Map(
    [...nodeLinkIdByNodeId.entries()].map(([nodeId, nodeLinkId]) => [
      nodeId,
      incidentEdgeCountByGroupId.get(nodeLinkId) ?? 0,
    ])
  );
};

const resolveLeastLinkedBadgeCandidate = ({
  coordinateCandidates,
  nodeLinkIncidentEdgeCountByNodeId,
  nodeLinkSizeByNodeId,
}: {
  coordinateCandidates: readonly RuntimePointLabelCoordinateCandidate[];
  nodeLinkIncidentEdgeCountByNodeId: ReadonlyMap<string, number>;
  nodeLinkSizeByNodeId: ReadonlyMap<string, number>;
}): RuntimePointLabelCoordinateCandidate | null => {
  const candidateCrowdingScores = coordinateCandidates
    .filter(
      (
        coordinateCandidate
      ): coordinateCandidate is RuntimePointLabelCoordinateCandidate & {
        nodeId: string;
      } => typeof coordinateCandidate.nodeId === "string"
    )
    .map((coordinateCandidate) => ({
      coordinateCandidate,
      incidentEdgeCount:
        nodeLinkIncidentEdgeCountByNodeId.get(coordinateCandidate.nodeId) ?? 0,
      nodeLinkSize: nodeLinkSizeByNodeId.get(coordinateCandidate.nodeId) ?? 1,
    }));

  if (candidateCrowdingScores.length < 2) {
    return null;
  }

  const minimumIncidentEdgeCount = Math.min(
    ...candidateCrowdingScores.map(({ incidentEdgeCount }) => incidentEdgeCount)
  );
  const maximumIncidentEdgeCount = Math.max(
    ...candidateCrowdingScores.map(({ incidentEdgeCount }) => incidentEdgeCount)
  );

  const leastCrowdedByEdgeCount = candidateCrowdingScores.filter(
    ({ incidentEdgeCount }) => incidentEdgeCount === minimumIncidentEdgeCount
  );

  if (minimumIncidentEdgeCount !== maximumIncidentEdgeCount) {
    return leastCrowdedByEdgeCount.length === 1
      ? leastCrowdedByEdgeCount[0]?.coordinateCandidate ?? null
      : null;
  }

  const minimumNodeLinkSize = Math.min(
    ...leastCrowdedByEdgeCount.map(({ nodeLinkSize }) => nodeLinkSize)
  );
  const maximumNodeLinkSize = Math.max(
    ...leastCrowdedByEdgeCount.map(({ nodeLinkSize }) => nodeLinkSize)
  );

  if (minimumNodeLinkSize === maximumNodeLinkSize) {
    return null;
  }

  const leastCrowdedByNodeLinkSize = leastCrowdedByEdgeCount.filter(
    ({ nodeLinkSize }) => nodeLinkSize === minimumNodeLinkSize
  );

  return leastCrowdedByNodeLinkSize.length === 1
    ? leastCrowdedByNodeLinkSize[0]?.coordinateCandidate ?? null
    : null;
};

type BuildDistanceToolRenderModelsArgs = {
  toolType: StoredAnnotation["toolType"];
  visuals: DistanceToolVisuals;
  labelTheme: StoredAnnotationLabelTheme;
  getLabel: (annotationIndex: number) => string;
  nodes: readonly AnnotationNode[];
  edges: readonly AnnotationEdge[];
  linkedNodeGroups: readonly AnnotationNodeLink[];
  annotations: readonly StoredAnnotation[];
  selectedAnnotationIds: readonly string[];
  onSelect?: (annotationId: string) => void;
  onNodeLongPress?: (nodeId: string, annotationId: string) => void;
};

export const buildDistanceToolRenderModels = ({
  toolType,
  visuals,
  labelTheme,
  getLabel,
  nodes,
  edges,
  linkedNodeGroups,
  annotations,
  selectedAnnotationIds,
  onSelect,
}: BuildDistanceToolRenderModelsArgs): {
  points: readonly RuntimePointMarkerRenderModel[];
  edges: readonly RuntimeEdgeRenderModel[];
  pointLabels: readonly RuntimePointLabelRenderModel[];
} => {
  const nodeCoordinatesById = buildRuntimeNodeCoordinateMap(nodes);
  const nodeLinkIncidentEdgeCountByNodeId =
    buildNodeLinkIncidentEdgeCountByNodeId({
      nodeLinks: linkedNodeGroups,
      edges,
    });
  const nodeLinkSizeByNodeId = buildNodeLinkSizeByNodeId(linkedNodeGroups);
  const distanceAnnotations = annotations.filter(
    (annotation) => annotation.toolType === toolType
  );
  const visibleDistanceMeasurements = distanceAnnotations.filter(
    (annotation) => !annotation.hidden
  );
  const selectedAnnotationIdSet = new Set(selectedAnnotationIds);

  const committedEdges = visibleDistanceMeasurements.flatMap((annotation) => {
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
        distanceTriangleOverlay: {
          annotationId: annotation.id,
          anchorCoordinateRole:
            annotation.distanceTriangleAnchorCoordinateRole ??
            resolveDistanceTriangleAnchorCoordinateRole(coordinates),
        },
        ...(selectedAnnotationIdSet.has(annotation.id)
          ? applySelectedEdgeVisualStyle(visuals.edge)
          : visuals.edge),
      },
    ];
  });

  const committedPoints = visibleDistanceMeasurements.flatMap((annotation) =>
    resolveMeasurementCoordinates(annotation, nodeCoordinatesById).map(
      (coordinate, index) => ({
        id: `${annotation.id}-node-${index}`,
        annotationId: annotation.id,
        nodeId: annotation.nodeIds[index],
        coordinate,
        onClick: onSelect
          ? () => onSelect(annotation.id)
          : undefined,
        ...(selectedAnnotationIdSet.has(annotation.id)
          ? applySelectedPointMarkerVisualStyle(visuals.point)
          : visuals.point),
      })
    )
  );

  const committedPointLabels = visibleDistanceMeasurements.flatMap(
    (annotation, annotationIndex) => {
      const badgeText =
        annotation.shortLabel?.trim() ||
        getLabel(annotationIndex + 1);
      const measurementCoordinates = resolveMeasurementCoordinates(
        annotation,
        nodeCoordinatesById
      );
      const coordinateCandidates = annotation.nodeIds.reduce<
        RuntimePointLabelCoordinateCandidate[]
      >((candidates, nodeId) => {
        const coordinate = nodeCoordinatesById.get(nodeId);
        if (!coordinate) {
          return candidates;
        }

        return [...candidates, { coordinate, nodeId }];
      }, []);
      const coordinate = coordinateCandidates[0]?.coordinate;
      if (!coordinate) {
        return [];
      }
      const anchorCoordinateSelection =
        annotation.distanceAnchorCoordinateSelection ??
        resolveDistanceTriangleAnchorCoordinateSelection(
          measurementCoordinates
        );
      const coordinateSelection = resolveDistanceBadgeLabelCoordinateSelection(
        anchorCoordinateSelection
      );
      const leastLinkedBadgeCandidate = resolveLeastLinkedBadgeCandidate({
        coordinateCandidates,
        nodeLinkIncidentEdgeCountByNodeId,
        nodeLinkSizeByNodeId,
      });
      const effectiveBadgeCoordinateCandidates = leastLinkedBadgeCandidate
        ? [leastLinkedBadgeCandidate]
        : coordinateCandidates;
      const effectiveBadgeCoordinate =
        leastLinkedBadgeCandidate?.coordinate ?? coordinate;

      const isSelected = selectedAnnotationIdSet.has(annotation.id);
      const pointVisuals = isSelected
        ? applySelectedPointMarkerVisualStyle(visuals.point)
        : visuals.point;
      const preferredAttach = leastLinkedBadgeCandidate
        ? undefined
        : resolveDistanceBadgePreferredAttach(coordinateSelection);
      const labelColorScheme = labelTheme.scheme;
      const selectedHighlight = labelTheme.selection;
      const badgeNodeId =
        leastLinkedBadgeCandidate?.nodeId ??
        resolveDistanceBadgeNodeId({
          coordinateCandidates,
          coordinateSelection,
        });
      return [
        {
          id: `${annotation.id}-label`,
          annotationId: annotation.id,
          nodeId: badgeNodeId,
          coordinate: effectiveBadgeCoordinate,
          coordinateCandidates: effectiveBadgeCoordinateCandidates,
          coordinateSelection,
          preferredAttach,
          markerPixelSize: pointVisuals.pixelSize,
          markerOutlineWidth: pointVisuals.outlineWidth,
          stemStartDistance:
            pointVisuals.pixelSize / 2 + pointVisuals.outlineWidth / 2,
          content: badgeText,
          badgeContent: badgeText,
          collapse: true,
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
          allowLongPressWhenBlocked: false,
          onClick: onSelect
            ? () => onSelect(annotation.id)
            : undefined,
          onLongPress: undefined,
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
