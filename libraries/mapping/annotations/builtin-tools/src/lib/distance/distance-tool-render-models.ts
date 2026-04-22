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

const resolveDistanceBadgePreferredAttach = (
  coordinateSelection: RuntimePointLabelRenderModel["coordinateSelection"]
): RuntimePointLabelRenderModel["preferredAttach"] =>
  coordinateSelection ===
  RUNTIME_POINT_LABEL_COORDINATE_SELECTION.LEFTMOST_SCREEN_SPACE
    ? "right"
    : "left";

const resolveDistanceBadgeLabelCoordinateSelection = (
  anchorCoordinateSelection: RuntimePointLabelRenderModel["coordinateSelection"]
): RuntimePointLabelRenderModel["coordinateSelection"] =>
  resolveOppositePointLabelCoordinateSelection(anchorCoordinateSelection);

const resolveDistanceBadgeNodeId = ({
  coordinateCandidates,
  coordinateSelection,
}: {
  coordinateCandidates: readonly RuntimePointLabelCoordinateCandidate[];
  coordinateSelection: RuntimePointLabelRenderModel["coordinateSelection"];
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
  getMeasurementLabel: (measurementIndex: number) => string;
  nodes: readonly AnnotationNode[];
  edges: readonly AnnotationEdge[];
  linkedNodeGroups: readonly AnnotationNodeLink[];
  measurements: readonly StoredAnnotation[];
  selectedMeasurementIds: readonly string[];
  onMeasurementSelect?: (measurementId: string) => void;
  onNodeLongPress?: (nodeId: string, measurementId: string) => void;
};

export const buildDistanceToolRenderModels = ({
  toolType,
  visuals,
  labelTheme,
  getMeasurementLabel,
  nodes,
  edges,
  linkedNodeGroups,
  measurements,
  selectedMeasurementIds,
  onMeasurementSelect,
  onNodeLongPress,
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
  const distanceMeasurements = measurements.filter(
    (measurement) => measurement.toolType === toolType
  );
  const visibleDistanceMeasurements = distanceMeasurements.filter(
    (measurement) => !measurement.hidden
  );
  const selectedMeasurementIdSet = new Set(selectedMeasurementIds);

  const committedEdges = visibleDistanceMeasurements.flatMap((measurement) => {
    const coordinates = resolveMeasurementCoordinates(
      measurement,
      nodeCoordinatesById
    );

    if (coordinates.length < 2) {
      return [];
    }

    return [
      {
        id: measurement.id,
        measurementId: measurement.id,
        nodeIds: measurement.nodeIds,
        coordinates,
        distanceTriangleOverlay: {
          measurementId: measurement.id,
          anchorCoordinateRole:
            measurement.distanceTriangleAnchorCoordinateRole ??
            resolveDistanceTriangleAnchorCoordinateRole(coordinates),
        },
        ...(selectedMeasurementIdSet.has(measurement.id)
          ? applySelectedEdgeVisualStyle(visuals.edge)
          : visuals.edge),
      },
    ];
  });

  const committedPoints = visibleDistanceMeasurements.flatMap((measurement) =>
    resolveMeasurementCoordinates(measurement, nodeCoordinatesById).map(
      (coordinate, index) => ({
        id: `${measurement.id}-node-${index}`,
        measurementId: measurement.id,
        nodeId: measurement.nodeIds[index],
        coordinate,
        onClick: onMeasurementSelect
          ? () => onMeasurementSelect(measurement.id)
          : undefined,
        ...(selectedMeasurementIdSet.has(measurement.id)
          ? applySelectedPointMarkerVisualStyle(visuals.point)
          : visuals.point),
      })
    )
  );

  const committedPointLabels = visibleDistanceMeasurements.flatMap(
    (measurement, measurementIndex) => {
      const badgeText =
        measurement.shortLabel?.trim() ||
        getMeasurementLabel(measurementIndex + 1);
      const measurementCoordinates = resolveMeasurementCoordinates(
        measurement,
        nodeCoordinatesById
      );
      const coordinateCandidates = measurement.nodeIds.reduce<
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
        measurement.distanceAnchorCoordinateSelection ??
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

      const isSelected = selectedMeasurementIdSet.has(measurement.id);
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
          id: `${measurement.id}-label`,
          measurementId: measurement.id,
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
          allowLongPressWhenBlocked: true,
          onClick: onMeasurementSelect
            ? () => onMeasurementSelect(measurement.id)
            : undefined,
          onLongPress:
            onNodeLongPress && badgeNodeId && !measurement.locked
              ? () => onNodeLongPress(badgeNodeId, measurement.id)
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
