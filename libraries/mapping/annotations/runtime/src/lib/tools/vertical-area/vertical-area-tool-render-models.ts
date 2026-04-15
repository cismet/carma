import { Cartesian3 } from "@carma-cesium";
import {
  getDegreesFromCartesian,
  getEllipsoidalAltitudeOrZero,
} from "@carma-mapping/engines/cesium/core";
import { formatAreaSquareMetersAdaptive } from "@carma-units";

import type {
  RuntimeCoordinate,
  RuntimeMeasurement,
  RuntimeNode,
} from "../../store/annotations-store.types";
import {
  RUNTIME_POLYGON_FILL_PLACEMENT,
  type RuntimeEdgeRenderModel,
  type RuntimePointLabelRenderModel,
  type RuntimePointMarkerRenderModel,
  type RuntimePolygonFillRenderModel,
} from "../../render/measurement-render-models";
import {
  buildRuntimeNodeCoordinateMap,
  resolveMeasurementCoordinates,
} from "../../render/resolve-measurement-coordinates";
import type { AnnotationsRuntimeFormatOptions } from "../../config/annotations-runtime-format-options";
import type { VerticalAreaToolVisualSettings } from "./vertical-area-tool-settings";
type BuildVerticalAreaToolRenderModelsArgs = {
  visuals: VerticalAreaToolVisualSettings;
  formatOptions: AnnotationsRuntimeFormatOptions;
  selectedMeasurementIds: readonly string[];
  onMeasurementSelect?: (measurementId: string) => void;
};

const cartesianFromRuntimeCoordinate = ({
  longitude,
  latitude,
  altitude,
}: RuntimeCoordinate): Cartesian3 =>
  Cartesian3.fromDegrees(longitude, latitude, altitude);

const runtimeCoordinateFromCartesian = (
  coordinateECEF: Cartesian3
): RuntimeCoordinate => {
  const coordinateWgs84 = getDegreesFromCartesian(coordinateECEF);

  return {
    longitude: coordinateWgs84.longitude,
    latitude: coordinateWgs84.latitude,
    altitude: getEllipsoidalAltitudeOrZero(coordinateWgs84.altitude),
  };
};

const getVerticalAreaLabelCoordinate = (
  coordinates: readonly RuntimeCoordinate[]
): RuntimeCoordinate | null => {
  if (coordinates.length < 4) {
    return coordinates[0] ?? null;
  }

  const firstCorner = cartesianFromRuntimeCoordinate(coordinates[0]!);
  const oppositeCorner = cartesianFromRuntimeCoordinate(coordinates[2]!);
  return runtimeCoordinateFromCartesian(
    Cartesian3.midpoint(firstCorner, oppositeCorner, new Cartesian3())
  );
};

export const buildVerticalAreaToolRenderModels = (
  toolType: RuntimeMeasurement["toolType"],
  nodes: readonly RuntimeNode[],
  measurements: readonly RuntimeMeasurement[],
  {
    visuals,
    formatOptions,
    selectedMeasurementIds,
    onMeasurementSelect,
  }: BuildVerticalAreaToolRenderModelsArgs
): {
  points: readonly RuntimePointMarkerRenderModel[];
  edges: readonly RuntimeEdgeRenderModel[];
  polygonFills: readonly RuntimePolygonFillRenderModel[];
  pointLabels: readonly RuntimePointLabelRenderModel[];
} => {
  const nodeCoordinatesById = buildRuntimeNodeCoordinateMap(nodes);
  const verticalAreaMeasurements = measurements.filter(
    (measurement) => measurement.toolType === toolType
  );
  const visibleVerticalAreaMeasurements = verticalAreaMeasurements.filter(
    (measurement) => !measurement.hidden
  );
  const selectedMeasurementIdSet = new Set(selectedMeasurementIds);

  const committedEdges = visibleVerticalAreaMeasurements.flatMap(
    (measurement) => {
      const coordinates = resolveMeasurementCoordinates(
        measurement,
        nodeCoordinatesById
      );

      if (coordinates.length < 3) {
        return [];
      }

      return [
        {
          id: measurement.id,
          measurementId: measurement.id,
          nodeIds: measurement.nodeIds,
          coordinates: measurement.closed
            ? [...coordinates, coordinates[0]!]
            : coordinates,
          ...(selectedMeasurementIdSet.has(measurement.id)
            ? visuals.selectedEdge
            : visuals.edge),
        },
      ];
    }
  );

  const committedPolygonFills = visibleVerticalAreaMeasurements.flatMap(
    (measurement) => {
      const coordinates = resolveMeasurementCoordinates(
        measurement,
        nodeCoordinatesById
      );
      if (coordinates.length < 3) {
        return [];
      }

      return [
        {
          id: `${measurement.id}-fill`,
          measurementId: measurement.id,
          nodeIds: measurement.nodeIds,
          coordinates,
          fill: selectedMeasurementIdSet.has(measurement.id)
            ? "rgba(112, 168, 255, 0.35)"
            : "rgba(112, 168, 255, 0.25)",
          placement: RUNTIME_POLYGON_FILL_PLACEMENT.COPLANAR,
          selected: selectedMeasurementIdSet.has(measurement.id),
        },
      ];
    }
  );

  const committedPoints = visibleVerticalAreaMeasurements.flatMap(
    (measurement) =>
      measurement.nodeIds.flatMap((nodeId, index) => {
        const coordinate = nodeCoordinatesById.get(nodeId);
        if (!coordinate) {
          return [];
        }

        return [
          {
            id: `${measurement.id}-node-${index}`,
            measurementId: measurement.id,
            nodeId,
            coordinate,
            ...(selectedMeasurementIdSet.has(measurement.id)
              ? visuals.selectedPoint
              : visuals.point),
          },
        ];
      })
  );

  const committedAreaLabels = visibleVerticalAreaMeasurements.flatMap(
    (measurement) => {
      const coordinates = resolveMeasurementCoordinates(
        measurement,
        nodeCoordinatesById
      );
      const coordinate = getVerticalAreaLabelCoordinate(coordinates);

      if (!coordinate) {
        return [];
      }

      return [
        {
          id: `${measurement.id}-area-label`,
          measurementId: measurement.id,
          coordinate,
          anchorKind: "area-centroid" as const,
          content: formatAreaSquareMetersAdaptive(
            Math.max(0, measurement.areaSquareMeters ?? 0),
            formatOptions.areaSquareMeters
          ),
          selected: selectedMeasurementIdSet.has(measurement.id),
          hideLabelAndStem: false,
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
    polygonFills: committedPolygonFills,
    pointLabels: committedAreaLabels,
  };
};
