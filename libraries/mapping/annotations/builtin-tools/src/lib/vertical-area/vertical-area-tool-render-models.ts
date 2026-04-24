import { Cartesian3 } from "@carma-cesium";
import {
  POINT_LABEL_ANCHOR_KIND,
  POINT_LABEL_STYLE,
} from "@carma-providers/label-overlay";
import {
  ANNOTATION_TYPES,
  getAnnotationAreaFillCssColor,
} from "@carma-mapping/annotations/core";
import {
  getDegreesFromCartesian,
  getEllipsoidalAltitudeOrZero,
} from "@carma-mapping/engines/cesium/core";
import { formatAreaSquareMetersAdaptive } from "@carma-units";

import type {
  CesiumGeographicCoordinate,
  EdgeVisualStyle,
  PointMarkerVisualStyle,
  StoredAnnotation,
  AnnotationNode,
} from "@carma-mapping/annotations/runtime";
import {
  RUNTIME_POLYGON_FILL_PLACEMENT,
  isCoplanarPolygonFillPlacement,
  resolveAreaOcclusionLineRenderOptions,
  resolveAreaOcclusionStyleOptions,
  resolveAreaOverlayFillColor,
  type AreaOcclusionStyleOptions,
  type RuntimeEdgeRenderModel,
  type RuntimePointLabelRenderModel,
  type RuntimePointMarkerRenderModel,
  type RuntimePolygonFillRenderModel,
} from "@carma-mapping/annotations/runtime";
import {
  buildRuntimeNodeCoordinateMap,
  resolveMeasurementCoordinates,
} from "@carma-mapping/annotations/runtime";
import type { AnnotationsRuntimeFormatOptions } from "@carma-mapping/annotations/runtime";
import { resolveAreaMeasurementSummary } from "../utils/measurement-summaries";
import {
  applySelectedEdgeVisualStyle,
  applySelectedPointMarkerVisualStyle,
} from "@carma-mapping/annotations/runtime";

type VerticalAreaToolVisuals = {
  edge: EdgeVisualStyle;
  point: PointMarkerVisualStyle;
};

type BuildVerticalAreaToolRenderModelsArgs = {
  visuals: VerticalAreaToolVisuals;
  formatOptions: AnnotationsRuntimeFormatOptions;
  selectedMeasurementIds: readonly string[];
  onMeasurementSelect?: (measurementId: string) => void;
  onNodeLongPress?: (nodeId: string, measurementId: string) => void;
  occlusionStyleOptions?: AreaOcclusionStyleOptions;
};

const { AREA_VERTICAL: ANNOTATION_TYPE_AREA_VERTICAL } = ANNOTATION_TYPES;

const cartesianFromRuntimeCoordinate = ({
  longitude,
  latitude,
  altitude,
}: CesiumGeographicCoordinate): Cartesian3 =>
  Cartesian3.fromDegrees(longitude, latitude, altitude);

const runtimeCoordinateFromCartesian = (
  coordinateECEF: Cartesian3
): CesiumGeographicCoordinate => {
  const coordinateWgs84 = getDegreesFromCartesian(coordinateECEF);

  return {
    longitude: coordinateWgs84.longitude,
    latitude: coordinateWgs84.latitude,
    altitude: getEllipsoidalAltitudeOrZero(coordinateWgs84.altitude),
  };
};

const getVerticalAreaLabelCoordinate = (
  coordinates: readonly CesiumGeographicCoordinate[]
): CesiumGeographicCoordinate | null => {
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
  toolType: StoredAnnotation["toolType"],
  nodes: readonly AnnotationNode[],
  measurements: readonly StoredAnnotation[],
  {
    visuals,
    formatOptions,
    selectedMeasurementIds,
    onMeasurementSelect,
    onNodeLongPress,
    occlusionStyleOptions,
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
  const resolvedOcclusionStyleOptions = resolveAreaOcclusionStyleOptions(
    occlusionStyleOptions
  );
  const fillPlacement = RUNTIME_POLYGON_FILL_PLACEMENT.COPLANAR;
  const isCoplanarFill = isCoplanarPolygonFillPlacement(fillPlacement);
  const lineRenderOptions = resolveAreaOcclusionLineRenderOptions(
    resolvedOcclusionStyleOptions
  );

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
          ...(lineRenderOptions ?? {}),
          ...(selectedMeasurementIdSet.has(measurement.id)
            ? applySelectedEdgeVisualStyle(visuals.edge)
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
      const fill = getAnnotationAreaFillCssColor(
        ANNOTATION_TYPE_AREA_VERTICAL,
        selectedMeasurementIdSet.has(measurement.id)
      );

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

  const committedAreaLabels = visibleVerticalAreaMeasurements.flatMap(
    (measurement) => {
      const coordinates = resolveMeasurementCoordinates(
        measurement,
        nodeCoordinatesById
      );
      const coordinate = getVerticalAreaLabelCoordinate(coordinates);
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
              toolType: ANNOTATION_TYPE_AREA_VERTICAL,
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
    }
  );

  return {
    points: committedPoints,
    edges: committedEdges,
    polygonFills: committedPolygonFills,
    pointLabels: committedAreaLabels,
  };
};
