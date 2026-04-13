import type {
  RuntimeMeasurement,
  RuntimeNode,
} from "../../context/AnnotationsProvider";
import { annotationTypographyDefaults } from "../../config/annotationTypographyDefaults";
import type {
  RuntimeEdgeRenderModel,
  RuntimePointLabelRenderModel,
  RuntimePointMarkerRenderModel,
  RuntimePointLabelCoordinateCandidate,
} from "../../render/measurementRenderModels";
import { RUNTIME_POINT_LABEL_COORDINATE_SELECTION } from "../../render/measurementRenderModels";
import {
  resolveDistanceTriangleAnchorCoordinateRole,
  resolveDistanceTriangleAnchorCoordinateSelection,
  resolveOppositePointLabelCoordinateSelection,
} from "../../render/runtimeDistanceTriangleOverlay";
import {
  buildRuntimeNodeCoordinateMap,
  resolveMeasurementCoordinates,
} from "../../render/resolveMeasurementCoordinates";
import type { AnnotationMeasurementLabelTheme } from "../../config/annotationMeasurementLabelThemes";
import type { DistanceToolVisualSettings } from "./distanceToolSettings";

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

type BuildDistanceToolRenderModelsArgs = {
  toolType: RuntimeMeasurement["toolType"];
  visuals: DistanceToolVisualSettings;
  labelTheme: AnnotationMeasurementLabelTheme;
  getMeasurementLabel: (measurementIndex: number) => string;
  nodes: readonly RuntimeNode[];
  measurements: readonly RuntimeMeasurement[];
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
          ? visuals.selectedEdge
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
        ...(selectedMeasurementIdSet.has(measurement.id)
          ? visuals.selectedPoint
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

      const isSelected = selectedMeasurementIdSet.has(measurement.id);
      const pointVisuals = isSelected ? visuals.selectedPoint : visuals.point;
      const preferredAttach =
        resolveDistanceBadgePreferredAttach(coordinateSelection);
      const labelColorScheme = labelTheme.scheme;
      const selectedHighlight = labelTheme.selection;
      const badgeNodeId = resolveDistanceBadgeNodeId({
        coordinateCandidates,
        coordinateSelection,
      });
      const nodeInteractionLabels = measurement.nodeIds.flatMap(
        (nodeId, index) => {
          const nodeCoordinate = nodeCoordinatesById.get(nodeId);
          if (!nodeCoordinate) {
            return [];
          }

          return [
            {
              id: `${measurement.id}-node-label-${index}`,
              measurementId: measurement.id,
              nodeId,
              coordinate: nodeCoordinate,
              markerPixelSize: pointVisuals.pixelSize,
              markerOutlineWidth: pointVisuals.outlineWidth,
              content: badgeText,
              badgeContent: badgeText,
              selected: isSelected,
              hideLabelAndStem: true,
              hideMarker: true,
              allowLongPressWhenBlocked: true,
              onClick: onMeasurementSelect
                ? () => onMeasurementSelect(measurement.id)
                : undefined,
              onLongPress:
                onNodeLongPress && !measurement.locked
                  ? () => onNodeLongPress(nodeId, measurement.id)
                  : undefined,
            },
          ];
        }
      );

      return [
        ...nodeInteractionLabels,
        {
          id: `${measurement.id}-label`,
          measurementId: measurement.id,
          nodeId: badgeNodeId,
          coordinate,
          coordinateCandidates,
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
