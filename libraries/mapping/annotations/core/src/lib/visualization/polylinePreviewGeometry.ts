import { Cartesian3 } from "@carma/cesium";

import { ANNOTATION_TYPE_AREA_VERTICAL } from "../types/annotationTypes";
import type { PlanarMeasurementGroup } from "../types/planarTypes";
import { buildVerticalRectangleCornerFromDiagonal } from "./verticalRectangleGeometry";
import type {
  VerticalPreviewCornerMarker,
  VerticalPreviewEdgeSegment,
  PointWithGeometryECEF,
  PolylinePreviewMeasurement,
} from "./previewGeometry.types";

export const buildPolylinePreviewMeasurements = ({
  planarPolygonGroups,
  pointsById,
  verticalRectanglePreviewOppositeByGroupId,
}: {
  planarPolygonGroups: PlanarMeasurementGroup[];
  pointsById: ReadonlyMap<string, PointWithGeometryECEF>;
  verticalRectanglePreviewOppositeByGroupId?: Readonly<
    Record<string, Cartesian3>
  >;
}): PolylinePreviewMeasurement[] =>
  planarPolygonGroups
    .map((group) => {
      if (group.closed) return null;
      if (group.type !== ANNOTATION_TYPE_AREA_VERTICAL) return null;
      if (group.vertexPointIds.length !== 1) return null;

      const firstVertexId = group.vertexPointIds[0] ?? null;
      const firstVertex = firstVertexId
        ? pointsById.get(firstVertexId)?.geometryECEF
        : null;
      const previewOppositeCorner =
        verticalRectanglePreviewOppositeByGroupId?.[group.id];
      if (!firstVertex || !previewOppositeCorner) {
        return null;
      }

      const verticalCorners = buildVerticalRectangleCornerFromDiagonal(
        firstVertex,
        previewOppositeCorner
      );
      if (!verticalCorners) {
        return null;
      }

      return {
        id: group.id,
        vertexPoints: [
          firstVertex,
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
