import { Cartesian3 } from "@carma-cesium";
import {
  POINT_LABEL_ANCHOR_KIND,
  POINT_LABEL_STYLE,
} from "@carma-providers/label-overlay";
import { formatAreaSquareMetersAdaptive } from "@carma-units";
import {
  getAnnotationAreaFillCssColor,
  type PolygonType,
} from "@carma-mapping/annotations/core";
import {
  getDegreesFromCartesian,
  getEllipsoidalAltitudeOrZero,
} from "@carma-mapping/engines/cesium/core";
import {
  applySelectedEdgeVisualStyle,
  applySelectedPointMarkerVisualStyle,
  measurementVisualStyles,
  isCoplanarPolygonFillPlacement,
  resolveAreaOcclusionLineRenderOptions,
  resolveAreaOcclusionStyleOptions,
  resolveAreaOverlayFillColor,
  resolveMeasurementLineStyleOptions,
  type EdgeVisualStyle,
  type MeasurementLineStyleOptions,
  type PointMarkerVisualStyle,
  type AreaOcclusionStyleOptions,
  withEdgeVisualStyle,
  withPointMarkerVisualStyle,
} from "@carma-mapping/annotations/runtime";

import type {
  StoredAnnotation,
  AnnotationNode,
} from "@carma-mapping/annotations/runtime";
import type {
  RuntimePolygonFillPlacement,
  RuntimeEdgeRenderModel,
  RuntimePointLabelRenderModel,
  RuntimePointMarkerRenderModel,
  RuntimePolygonFillRenderModel,
} from "@carma-mapping/annotations/runtime";
import {
  buildRuntimeNodeCoordinateMap,
  resolveMeasurementCoordinates,
} from "@carma-mapping/annotations/runtime";
import type { AnnotationsRuntimeFormatOptions } from "@carma-mapping/annotations/runtime";
import { resolveAreaMeasurementSummary } from "../utils/measurement-summaries";

export type NodeChainAreaToolVisualSettings = {
  edge: EdgeVisualStyle;
  point: PointMarkerVisualStyle;
  fill: string;
  selectedFill: string;
};

const defaults = measurementVisualStyles;

export const createNodeChainAreaToolVisuals = ({
  fillType,
  measurementLineStyleOptions,
}: {
  fillType: PolygonType;
  measurementLineStyleOptions?: MeasurementLineStyleOptions;
}): NodeChainAreaToolVisualSettings => {
  const resolvedLineStyleOptions = resolveMeasurementLineStyleOptions(
    measurementLineStyleOptions
  );

  return {
    edge: withEdgeVisualStyle(defaults.edge, {
      strokeWidth: resolvedLineStyleOptions.strokeWidthPx,
      overlayDashPattern: resolvedLineStyleOptions.overlayDashPattern,
    }),
    point: withPointMarkerVisualStyle(defaults.point),
    fill: getAnnotationAreaFillCssColor(fillType, false),
    selectedFill: getAnnotationAreaFillCssColor(fillType, true),
  };
};

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
  onNodeLongPress,
  occlusionStyleOptions,
}: {
  toolType: PolygonType;
  visuals: NodeChainAreaToolVisualSettings;
  nodes: readonly AnnotationNode[];
  measurements: readonly StoredAnnotation[];
  selectedMeasurementIds: readonly string[];
  fillPlacement: RuntimePolygonFillPlacement;
  formatOptions: AnnotationsRuntimeFormatOptions;
  onMeasurementSelect?: (measurementId: string) => void;
  onNodeLongPress?: (nodeId: string, measurementId: string) => void;
  occlusionStyleOptions?: AreaOcclusionStyleOptions;
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
  const resolvedOcclusionStyleOptions = resolveAreaOcclusionStyleOptions(
    occlusionStyleOptions
  );
  const isCoplanarFill = isCoplanarPolygonFillPlacement(fillPlacement);
  const lineRenderOptions = resolveAreaOcclusionLineRenderOptions(
    resolvedOcclusionStyleOptions
  );

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
        ...(lineRenderOptions ?? {}),
        ...(selectedMeasurementIdSet.has(measurement.id)
          ? applySelectedEdgeVisualStyle(visuals.edge)
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
    const fill = selectedMeasurementIdSet.has(measurement.id)
      ? visuals.selectedFill
      : visuals.fill;

    return [
      {
        id: `${measurement.id}-fill`,
        measurementId: measurement.id,
        nodeIds: measurement.nodeIds,
        coordinates,
        fill,
        ...(isCoplanarFill && resolvedOcclusionStyleOptions.fill.overlay
          ? {
              overlayFill: resolveAreaOverlayFillColor(
                fill,
                resolvedOcclusionStyleOptions
              ),
            }
          : {}),
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
          onClick: onMeasurementSelect
            ? () => onMeasurementSelect(measurement.id)
            : undefined,
          ...(selectedMeasurementIdSet.has(measurement.id)
            ? applySelectedPointMarkerVisualStyle(visuals.point)
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
    const lastNodeIndex = measurement.nodeIds.length - 1;
    const lastNodeId =
      lastNodeIndex >= 0 ? measurement.nodeIds[lastNodeIndex] : undefined;
    if (!coordinate || !lastNodeId) {
      return [];
    }

    return [
      {
        id: `${measurement.id}-area-label`,
        measurementId: measurement.id,
        nodeId: lastNodeId,
        coordinate,
        anchorKind: POINT_LABEL_ANCHOR_KIND.AREA_CENTROID,
        content: formatAreaSquareMetersAdaptive(
          resolveAreaMeasurementSummary({
            measurement,
            toolType,
            coordinates,
          }).areaSquareMeters,
          formatOptions.areaSquareMeters
        ),
        selected: selectedMeasurementIdSet.has(measurement.id),
        hideMarker: true,
        collapse: false,
        labelStyle: POINT_LABEL_STYLE.AUTO,
        onClick: onMeasurementSelect
          ? () => onMeasurementSelect(measurement.id)
          : undefined,
        allowLongPressWhenBlocked: true,
        onLongPress:
          onNodeLongPress && !measurement.locked
            ? () => onNodeLongPress(lastNodeId, measurement.id)
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
