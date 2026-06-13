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
  RUNTIME_POINT_LABEL_RENDER_STYLE,
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
  selectedAnnotationIds: readonly string[];
  onSelect?: (annotationId: string) => void;
  onNodeLongPress?: (nodeId: string, annotationId: string) => void;
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
  annotations: readonly StoredAnnotation[],
  {
    visuals,
    formatOptions,
    selectedAnnotationIds,
    onSelect,
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
  const verticalAreaAnnotations = annotations.filter(
    (annotation) => annotation.toolType === toolType
  );
  const visibleVerticalAreaMeasurements = verticalAreaAnnotations.filter(
    (annotation) => !annotation.hidden
  );
  const selectedAnnotationIdSet = new Set(selectedAnnotationIds);
  const resolvedOcclusionStyleOptions = resolveAreaOcclusionStyleOptions(
    occlusionStyleOptions
  );
  const fillPlacement = RUNTIME_POLYGON_FILL_PLACEMENT.COPLANAR;
  const isCoplanarFill = isCoplanarPolygonFillPlacement(fillPlacement);
  const lineRenderOptions = resolveAreaOcclusionLineRenderOptions(
    resolvedOcclusionStyleOptions
  );

  const committedEdges = visibleVerticalAreaMeasurements.flatMap(
    (annotation) => {
      const coordinates = resolveMeasurementCoordinates(
        annotation,
        nodeCoordinatesById
      );

      if (coordinates.length < 3) {
        return [];
      }

      return [
        {
          id: annotation.id,
          annotationId: annotation.id,
          nodeIds: annotation.nodeIds,
          coordinates: annotation.closed
            ? [...coordinates, coordinates[0]!]
            : coordinates,
          ...(lineRenderOptions ?? {}),
          ...(selectedAnnotationIdSet.has(annotation.id)
            ? applySelectedEdgeVisualStyle(visuals.edge)
            : visuals.edge),
        },
      ];
    }
  );

  const committedPolygonFills = visibleVerticalAreaMeasurements.flatMap(
    (annotation) => {
      const coordinates = resolveMeasurementCoordinates(
        annotation,
        nodeCoordinatesById
      );
      if (coordinates.length < 3) {
        return [];
      }
      const fill = getAnnotationAreaFillCssColor(
        ANNOTATION_TYPE_AREA_VERTICAL,
        selectedAnnotationIdSet.has(annotation.id)
      );

      return [
        {
          id: `${annotation.id}-fill`,
          annotationId: annotation.id,
          nodeIds: annotation.nodeIds,
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
          selected: selectedAnnotationIdSet.has(annotation.id),
        },
      ];
    }
  );

  const committedPoints = visibleVerticalAreaMeasurements.flatMap(
    (annotation) =>
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
            onClick: onSelect
              ? () => onSelect(annotation.id)
              : undefined,
            ...(selectedAnnotationIdSet.has(annotation.id)
              ? applySelectedPointMarkerVisualStyle(visuals.point)
              : visuals.point),
          },
        ];
      })
  );

  const committedAreaLabels = visibleVerticalAreaMeasurements.flatMap(
    (annotation) => {
      const coordinates = resolveMeasurementCoordinates(
        annotation,
        nodeCoordinatesById
      );
      const coordinate = getVerticalAreaLabelCoordinate(coordinates);
      const lastNodeIndex = annotation.nodeIds.length - 1;
      const lastNodeId =
        lastNodeIndex >= 0 ? annotation.nodeIds[lastNodeIndex] : undefined;

      if (!coordinate || !lastNodeId) {
        return [];
      }

      return [
        {
          id: `${annotation.id}-area-label`,
          annotationId: annotation.id,
          nodeId: lastNodeId,
          coordinate,
          anchorKind: POINT_LABEL_ANCHOR_KIND.AREA_CENTROID,
          content: formatAreaSquareMetersAdaptive(
            resolveAreaMeasurementSummary({
              annotation,
              toolType: ANNOTATION_TYPE_AREA_VERTICAL,
              coordinates,
            }).areaSquareMeters,
            formatOptions.areaSquareMeters
          ),
          selected: selectedAnnotationIdSet.has(annotation.id),
          hideMarker: true,
          collapse: false,
          renderStyle: RUNTIME_POINT_LABEL_RENDER_STYLE.LINE_BLEND,
          labelStyle: POINT_LABEL_STYLE.AUTO,
          onClick: onSelect
            ? () => onSelect(annotation.id)
            : undefined,
          allowLongPressWhenBlocked: true,
          onLongPress:
            onNodeLongPress && !annotation.locked
              ? () => onNodeLongPress(lastNodeId, annotation.id)
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
