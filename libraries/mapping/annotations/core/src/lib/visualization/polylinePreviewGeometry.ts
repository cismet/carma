import { Cartesian3 } from "@carma/cesium";

import { ANNOTATION_TYPE_AREA_VERTICAL } from "../types/annotationTypes";
import type { NodeChainAnnotation } from "../types/annotationTypes";
import type {
  VerticalPreviewCornerMarker,
  VerticalPreviewEdgeSegment,
  PointWithGeometryECEF,
  PolylinePreviewMeasurement,
} from "./previewGeometry.types";
import { buildVerticalRectangleCornerFromDiagonal } from "./verticalRectangleGeometry";
export const buildPolylinePreviewMeasurements = ({
  nodeChainAnnotations,
  pointsById,
  verticalRectanglePreviewOppositeByGroupId,
}: {
  nodeChainAnnotations: NodeChainAnnotation[];
  pointsById: ReadonlyMap<string, PointWithGeometryECEF>;
  verticalRectanglePreviewOppositeByGroupId?: Readonly<
    Record<string, Cartesian3>
  >;
}): PolylinePreviewMeasurement[] =>
  nodeChainAnnotations
    .map((group) => {
      if (group.closed) return null;
      if (group.type !== ANNOTATION_TYPE_AREA_VERTICAL) return null;
      if (group.nodeIds.length !== 1) return null;

      const firstNodeId = group.nodeIds[0] ?? null;
      const firstNodePosition = firstNodeId
        ? pointsById.get(firstNodeId)?.geometryECEF
        : null;
      const previewOppositeCorner =
        verticalRectanglePreviewOppositeByGroupId?.[group.id];
      if (!firstNodePosition || !previewOppositeCorner) {
        return null;
      }

      const verticalCorners = buildVerticalRectangleCornerFromDiagonal(
        firstNodePosition,
        previewOppositeCorner
      );
      if (!verticalCorners) {
        return null;
      }

      return {
        id: group.id,
        vertexPoints: [
          firstNodePosition,
          verticalCorners.adjacentHorizontalCorner,
          previewOppositeCorner,
          verticalCorners.adjacentVerticalCorner,
        ],
      };
    })
    .filter((measurement): measurement is PolylinePreviewMeasurement =>
      Boolean(measurement && measurement.vertexPoints.length === 4)
    );

export const buildPolylinePreviewEdgeSegments = (
  polylineMeasurements: PolylinePreviewMeasurement[]
): VerticalPreviewEdgeSegment[] =>
  polylineMeasurements.flatMap(({ id, vertexPoints }) => {
    const segments: VerticalPreviewEdgeSegment[] = [];
    for (let index = 0; index < vertexPoints.length; index += 1) {
      const start = vertexPoints[index];
      const end = vertexPoints[(index + 1) % vertexPoints.length];
      if (!start || !end) continue;
      segments.push({
        id: `${id}:${index}`,
        start,
        end,
      });
    }
    return segments;
  });

export const buildPolylinePreviewCornerMarkers = (
  polylineMeasurements: PolylinePreviewMeasurement[]
): VerticalPreviewCornerMarker[] =>
  polylineMeasurements.flatMap(({ id, vertexPoints }) => {
    const horizontalCorner = vertexPoints[1];
    const verticalCorner = vertexPoints[3];
    if (!horizontalCorner || !verticalCorner) return [];
    return [
      {
        id: `${id}:horizontal`,
        position: horizontalCorner,
      },
      {
        id: `${id}:vertical`,
        position: verticalCorner,
      },
    ];
  });
