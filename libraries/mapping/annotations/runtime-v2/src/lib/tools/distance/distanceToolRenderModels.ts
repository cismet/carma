import type {
  RuntimeMeasurement,
  RuntimeNode,
} from "../../context/AnnotationsProvider";
import type {
  RuntimeEdgeRenderModel,
  RuntimePointLabelRenderModel,
  RuntimePointMarkerRenderModel,
  RuntimePointLabelCoordinateCandidate,
} from "../../render/measurementRenderModels";
import { RUNTIME_POINT_LABEL_COORDINATE_SELECTION } from "../../render/measurementRenderModels";
import {
  resolveDistanceTriangleAnchorCoordinateSelection,
  resolveOppositePointLabelCoordinateSelection,
} from "../../render/runtimeDistanceTriangleOverlay";
import {
  buildRuntimeNodeCoordinateMap,
  resolveMeasurementCoordinates,
} from "../../render/resolveMeasurementCoordinates";
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

type BuildDistanceToolRenderModelsArgs = {
  toolType: RuntimeMeasurement["toolType"];
  visuals: DistanceToolVisualSettings;
  badgeStyle: {
    backgroundColor: string;
    textColor: string;
  };
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
  badgeStyle,
  getMeasurementLabel,
  nodes,
  measurements,
  selectedMeasurementIds,
  onMeasurementSelect,
}: BuildDistanceToolRenderModelsArgs): {
  points: readonly RuntimePointMarkerRenderModel[];
  edges: readonly RuntimeEdgeRenderModel[];
  pointLabels: readonly RuntimePointLabelRenderModel[];
} => {
  const nodeCoordinatesById = buildRuntimeNodeCoordinateMap(nodes);
  const distanceMeasurements = measurements.filter(
    (measurement) => measurement.toolType === toolType
  );
  const selectedMeasurementIdSet = new Set(selectedMeasurementIds);

  const committedEdges = distanceMeasurements.flatMap((measurement) => {
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
        coordinates,
        distanceTriangleOverlay: {
          measurementId: measurement.id,
          anchorCoordinateSelection:
            measurement.distanceAnchorCoordinateSelection ??
            resolveDistanceTriangleAnchorCoordinateSelection(coordinates),
        },
        ...(selectedMeasurementIdSet.has(measurement.id)
          ? visuals.selectedEdge
          : visuals.edge),
      },
    ];
  });

  const committedPoints = distanceMeasurements.flatMap((measurement) =>
    resolveMeasurementCoordinates(measurement, nodeCoordinatesById).map(
      (coordinate, index) => ({
        id: `${measurement.id}-node-${index}`,
        coordinate,
        ...(selectedMeasurementIdSet.has(measurement.id)
          ? visuals.selectedPoint
          : visuals.point),
      })
    )
  );

  const committedPointLabels = distanceMeasurements.flatMap(
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

      const pointVisuals = selectedMeasurementIdSet.has(measurement.id)
        ? visuals.selectedPoint
        : visuals.point;
      const preferredAttach =
        resolveDistanceBadgePreferredAttach(coordinateSelection);

      return [
        {
          id: `${measurement.id}-label`,
          measurementId: measurement.id,
          coordinate,
          coordinateCandidates,
          coordinateSelection,
          preferredAttach,
          markerPixelSize: pointVisuals.pixelSize,
          content: badgeText,
          markerContent: badgeText,
          markerBackgroundColor: badgeStyle.backgroundColor,
          markerTextColor: badgeStyle.textColor,
          selected: selectedMeasurementIdSet.has(measurement.id),
          onClick: onMeasurementSelect
            ? () => onMeasurementSelect(measurement.id)
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
