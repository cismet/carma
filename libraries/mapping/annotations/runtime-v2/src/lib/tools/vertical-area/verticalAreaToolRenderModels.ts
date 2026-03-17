import {
  Cartesian3,
  getDegreesFromCartesian,
  getEllipsoidalAltitudeOrZero,
} from "@carma/cesium";
import { formatAreaAdaptive } from "@carma-mapping/annotations/core";

import type {
  RuntimeCoordinate,
  RuntimeMeasurement,
  RuntimeNode,
} from "../../context/AnnotationsProvider";
import type {
  RuntimeEdgeRenderModel,
  RuntimePointLabelRenderModel,
  RuntimePointMarkerRenderModel,
} from "../../render/measurementRenderModels";
import {
  buildRuntimeNodeCoordinateMap,
  resolveMeasurementCoordinates,
} from "../../render/resolveMeasurementCoordinates";
import type { VerticalAreaToolVisualSettings } from "./verticalAreaToolSettings";

type BuildVerticalAreaToolRenderModelsArgs = {
  toolType: RuntimeMeasurement["toolType"];
  visuals: VerticalAreaToolVisualSettings;
  badgeStyle: {
    backgroundColor: string;
    textColor: string;
  };
  getMeasurementLabel: (measurementIndex: number) => string;
  nodes: readonly RuntimeNode[];
  measurements: readonly RuntimeMeasurement[];
  previewCoordinates: readonly RuntimeCoordinate[];
  selectedMeasurementId: string | null;
  onMeasurementSelect?: (measurementId: string) => void;
  onNodeLongPress?: (nodeId: string, measurementId: string) => void;
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

export const buildVerticalAreaToolRenderModels = ({
  toolType,
  visuals,
  badgeStyle,
  getMeasurementLabel,
  nodes,
  measurements,
  previewCoordinates,
  selectedMeasurementId,
  onMeasurementSelect,
  onNodeLongPress,
}: BuildVerticalAreaToolRenderModelsArgs): {
  points: readonly RuntimePointMarkerRenderModel[];
  edges: readonly RuntimeEdgeRenderModel[];
  pointLabels: readonly RuntimePointLabelRenderModel[];
} => {
  const nodeCoordinatesById = buildRuntimeNodeCoordinateMap(nodes);
  const verticalAreaMeasurements = measurements.filter(
    (measurement) => measurement.toolType === toolType
  );

  const committedEdges = verticalAreaMeasurements.flatMap((measurement) => {
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
        coordinates: measurement.closed
          ? [...coordinates, coordinates[0]!]
          : coordinates,
        ...(measurement.id === selectedMeasurementId
          ? visuals.selectedEdge
          : visuals.edge),
      },
    ];
  });

  const committedPoints = verticalAreaMeasurements.flatMap((measurement) =>
    measurement.nodeIds.flatMap((nodeId, index) => {
      const coordinate = nodeCoordinatesById.get(nodeId);
      if (!coordinate) {
        return [];
      }

      return [
        {
          id: `${measurement.id}-node-${index}`,
          coordinate,
          ...(measurement.id === selectedMeasurementId
            ? visuals.selectedPoint
            : visuals.point),
        },
      ];
    })
  );

  const previewPoints = previewCoordinates.map((coordinate, index) => ({
    id: `vertical-area-preview-node-${index}`,
    coordinate,
    ...visuals.previewPoint,
  }));

  const committedNodeLabels = verticalAreaMeasurements.flatMap(
    (measurement, measurementIndex) => {
      const badgeText = getMeasurementLabel(measurementIndex + 1);

      return measurement.nodeIds.flatMap((nodeId, index) => {
        const coordinate = nodeCoordinatesById.get(nodeId);
        if (!coordinate) {
          return [];
        }

        return [
          {
            id: `${measurement.id}-label-${index}`,
            measurementId: measurement.id,
            nodeId,
            coordinate,
            content: badgeText,
            markerContent: badgeText,
            markerBackgroundColor: badgeStyle.backgroundColor,
            markerTextColor: badgeStyle.textColor,
            selected: measurement.id === selectedMeasurementId,
            hideLabelAndStem: true,
            onClick: onMeasurementSelect
              ? () => onMeasurementSelect(measurement.id)
              : undefined,
            onLongPress: onNodeLongPress
              ? () => onNodeLongPress(nodeId, measurement.id)
              : undefined,
          },
        ];
      });
    }
  );

  const committedAreaLabels = verticalAreaMeasurements.flatMap((measurement) => {
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
        content: formatAreaAdaptive(Math.max(0, measurement.areaSquareMeters ?? 0)),
        markerContent: undefined,
        selected: measurement.id === selectedMeasurementId,
        hideLabelAndStem: false,
        onClick: onMeasurementSelect
          ? () => onMeasurementSelect(measurement.id)
          : undefined,
      },
    ];
  });

  return {
    points: [...committedPoints, ...previewPoints],
    edges: committedEdges,
    pointLabels: [...committedNodeLabels, ...committedAreaLabels],
  };
};
