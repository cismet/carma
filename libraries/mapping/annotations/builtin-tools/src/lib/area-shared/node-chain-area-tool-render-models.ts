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
  annotationVisualStyles,
  isCoplanarPolygonFillPlacement,
  resolveAreaOcclusionLineRenderOptions,
  resolveAreaOcclusionStyleOptions,
  resolveAreaOverlayFillColor,
  resolveAnnotationLineStyleOptions,
  type EdgeVisualStyle,
  type AnnotationLineStyleOptions,
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
  RUNTIME_POINT_LABEL_RENDER_STYLE,
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

const defaults = annotationVisualStyles;

export const createNodeChainAreaToolVisuals = ({
  fillType,
  annotationLineStyleOptions,
}: {
  fillType: PolygonType;
  annotationLineStyleOptions?: AnnotationLineStyleOptions;
}): NodeChainAreaToolVisualSettings => {
  const resolvedLineStyleOptions = resolveAnnotationLineStyleOptions(
    annotationLineStyleOptions
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
  annotations,
  selectedAnnotationIds,
  fillPlacement,
  formatOptions,
  onSelect,
  onNodeLongPress,
  occlusionStyleOptions,
}: {
  toolType: PolygonType;
  visuals: NodeChainAreaToolVisualSettings;
  nodes: readonly AnnotationNode[];
  annotations: readonly StoredAnnotation[];
  selectedAnnotationIds: readonly string[];
  fillPlacement: RuntimePolygonFillPlacement;
  formatOptions: AnnotationsRuntimeFormatOptions;
  onSelect?: (annotationId: string) => void;
  onNodeLongPress?: (nodeId: string, annotationId: string) => void;
  occlusionStyleOptions?: AreaOcclusionStyleOptions;
}): {
  points: readonly RuntimePointMarkerRenderModel[];
  edges: readonly RuntimeEdgeRenderModel[];
  polygonFills: readonly RuntimePolygonFillRenderModel[];
  pointLabels: readonly RuntimePointLabelRenderModel[];
} => {
  const nodeCoordinatesById = buildRuntimeNodeCoordinateMap(nodes);
  const areaAnnotations = annotations.filter(
    (annotation) => annotation.toolType === toolType
  );
  const visibleAreaAnnotations = areaAnnotations.filter(
    (annotation) => !annotation.hidden
  );
  const selectedAnnotationIdSet = new Set(selectedAnnotationIds);
  const resolvedOcclusionStyleOptions = resolveAreaOcclusionStyleOptions(
    occlusionStyleOptions
  );
  const isCoplanarFill = isCoplanarPolygonFillPlacement(fillPlacement);
  const lineRenderOptions = resolveAreaOcclusionLineRenderOptions(
    resolvedOcclusionStyleOptions
  );

  const committedEdges = visibleAreaAnnotations.flatMap((annotation) => {
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
        coordinates: [...coordinates, coordinates[0]!],
        ...(lineRenderOptions ?? {}),
        ...(selectedAnnotationIdSet.has(annotation.id)
          ? applySelectedEdgeVisualStyle(visuals.edge)
          : visuals.edge),
      },
    ];
  });

  const polygonFills = visibleAreaAnnotations.flatMap((annotation) => {
    const coordinates = resolveMeasurementCoordinates(
      annotation,
      nodeCoordinatesById
    );
    if (coordinates.length < 3) {
      return [];
    }
    const fill = selectedAnnotationIdSet.has(annotation.id)
      ? visuals.selectedFill
      : visuals.fill;

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
  });

  const points = visibleAreaAnnotations.flatMap((annotation) =>
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
          onClick: onSelect ? () => onSelect(annotation.id) : undefined,
          ...(selectedAnnotationIdSet.has(annotation.id)
            ? applySelectedPointMarkerVisualStyle(visuals.point)
            : visuals.point),
        },
      ];
    })
  );

  const areaLabels = visibleAreaAnnotations.flatMap((annotation) => {
    const coordinates = resolveMeasurementCoordinates(
      annotation,
      nodeCoordinatesById
    );
    const coordinate = getPolygonLabelCoordinate(coordinates);
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
            toolType,
            coordinates,
          }).areaSquareMeters,
          formatOptions.areaSquareMeters
        ),
        selected: selectedAnnotationIdSet.has(annotation.id),
        hideMarker: true,
        collapse: false,
        renderStyle: RUNTIME_POINT_LABEL_RENDER_STYLE.LINE_BLEND,
        labelStyle: POINT_LABEL_STYLE.AUTO,
        onClick: onSelect ? () => onSelect(annotation.id) : undefined,
        allowLongPressWhenBlocked: true,
        onLongPress:
          onNodeLongPress && !annotation.locked
            ? () => onNodeLongPress(lastNodeId, annotation.id)
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
