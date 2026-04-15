import { Cartesian3 } from "@carma-cesium";
import { POINT_LABEL_STYLE } from "@carma-providers/label-overlay";
import { formatAreaSquareMetersAdaptive } from "@carma-units";
import {
  getDegreesFromCartesian,
  getEllipsoidalAltitudeOrZero,
} from "@carma-mapping/engines/cesium/core";

import type {
  RuntimeMeasurement,
  RuntimeNode,
} from "../../store/annotations-store.types";
import type {
  RuntimePolygonFillPlacement,
  RuntimeEdgeRenderModel,
  RuntimePointLabelRenderModel,
  RuntimePointMarkerRenderModel,
  RuntimePolygonFillRenderModel,
} from "../../render/measurement-render-models";
import {
  buildRuntimeNodeCoordinateMap,
  resolveMeasurementCoordinates,
} from "../../render/resolve-measurement-coordinates";
import type { AnnotationsRuntimeFormatOptions } from "../../config/annotations-runtime-format-options";
import type { NodeChainAreaToolVisualSettings } from "./node-chain-area-tool-settings";

const getPolygonLabelCoordinate = (
  coordinates: readonly {
    longitude: number;
    latitude: number;
    altitude: number;
  }[]
) => {
  if (coordinates.length === 0) {
    return null;
  }

  const centroidECEF = coordinates
    .map((coordinate) =>
      Cartesian3.fromDegrees(
        coordinate.longitude,
        coordinate.latitude,
        coordinate.altitude
      )
    )
    .reduce(
      (result, coordinate) => Cartesian3.add(result, coordinate, result),
      new Cartesian3()
    );

  Cartesian3.multiplyByScalar(
    centroidECEF,
    1 / coordinates.length,
    centroidECEF
  );
  const coordinateWgs84 = getDegreesFromCartesian(centroidECEF);

  return {
    longitude: coordinateWgs84.longitude,
    latitude: coordinateWgs84.latitude,
    altitude: getEllipsoidalAltitudeOrZero(coordinateWgs84.altitude),
  };
};

export const buildNodeChainAreaToolRenderModels = ({
  toolType,
  visuals,
  nodes,
  measurements,
  selectedMeasurementIds,
  fillPlacement,
  formatOptions,
  onMeasurementSelect,
}: {
  toolType: RuntimeMeasurement["toolType"];
  visuals: NodeChainAreaToolVisualSettings;
  nodes: readonly RuntimeNode[];
  measurements: readonly RuntimeMeasurement[];
  selectedMeasurementIds: readonly string[];
  fillPlacement: RuntimePolygonFillPlacement;
  formatOptions: AnnotationsRuntimeFormatOptions;
  onMeasurementSelect?: (measurementId: string) => void;
}): {
  points: readonly RuntimePointMarkerRenderModel[];
  edges: readonly RuntimeEdgeRenderModel[];
  polygonFills: readonly RuntimePolygonFillRenderModel[];
  pointLabels: readonly RuntimePointLabelRenderModel[];
} => {
  const nodeCoordinatesById = buildRuntimeNodeCoordinateMap(nodes);
  const areaMeasurements = measurements.filter(
    (measurement) => measurement.toolType === toolType
  );
  const visibleAreaMeasurements = areaMeasurements.filter(
    (measurement) => !measurement.hidden
  );
  const selectedMeasurementIdSet = new Set(selectedMeasurementIds);

  const committedEdges = visibleAreaMeasurements.flatMap((measurement) => {
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
        coordinates: [...coordinates, coordinates[0]!],
        ...(selectedMeasurementIdSet.has(measurement.id)
          ? visuals.selectedEdge
          : visuals.edge),
      },
    ];
  });

  const polygonFills = visibleAreaMeasurements.flatMap((measurement) => {
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
          ? visuals.selectedFill
          : visuals.fill,
        placement: fillPlacement,
        selected: selectedMeasurementIdSet.has(measurement.id),
      },
    ];
  });

  const points = visibleAreaMeasurements.flatMap((measurement) =>
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

  const areaLabels = visibleAreaMeasurements.flatMap((measurement) => {
    const coordinates = resolveMeasurementCoordinates(
      measurement,
      nodeCoordinatesById
    );
    const coordinate = getPolygonLabelCoordinate(coordinates);
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
        hideMarker: true,
        collapse: false,
        labelStyle: POINT_LABEL_STYLE.AUTO,
        onClick: onMeasurementSelect
          ? () => onMeasurementSelect(measurement.id)
          : undefined,
      },
    ];
  });

  return {
    points,
    edges: committedEdges,
    polygonFills,
    pointLabels: areaLabels,
  };
};
