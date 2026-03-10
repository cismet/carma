import { Cartesian3 } from "@carma/cesium";

import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_TYPE_POLYLINE,
} from "../types/annotationTypes";
import type {
  PlanarMeasurementGroup,
  PlanarPolygonGroup,
} from "../types/planarTypes";
import { buildVerticalRectangleCornerFromDiagonal } from "./verticalRectangleGeometry";
import type {
  VerticalPreviewCornerMarker,
  VerticalPreviewEdgeSegment,
  PolygonPreviewBuildParams,
  PolygonPreviewGroup,
  PolygonPreviewGroupsBySurface,
} from "./previewGeometry.types";

export const buildPolygonPreviewGroups = ({
  planarPolygonGroups,
  pointsById,
  verticalRectanglePreviewOppositeByGroupId,
  activePlanarMeasurementId,
  candidateConnection,
}: PolygonPreviewBuildParams): PolygonPreviewGroup[] =>
  planarPolygonGroups
    .map((group) => {
      const type = group.type;
      if (type === ANNOTATION_TYPE_POLYLINE) {
        return null;
      }

      if (group.closed && group.vertexPointIds.length >= 3) {
        const vertexPoints = group.vertexPointIds
          .map((pointId) => pointsById.get(pointId)?.geometryECEF)
          .filter((point): point is Cartesian3 => Boolean(point));
        return {
          group,
          vertexPoints,
        };
      }

      if (
        !group.closed &&
        group.type === ANNOTATION_TYPE_AREA_VERTICAL &&
        group.vertexPointIds.length === 1
      ) {
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
          group,
          vertexPoints: [
            firstVertex,
            verticalCorners.adjacentHorizontalCorner,
            previewOppositeCorner,
            verticalCorners.adjacentVerticalCorner,
          ],
        };
      }

      if (
        !group.closed &&
        group.id === activePlanarMeasurementId &&
        (group.type === ANNOTATION_TYPE_AREA_GROUND ||
          group.type === ANNOTATION_TYPE_AREA_PLANAR) &&
        group.vertexPointIds.length >= 2
      ) {
        const baseVertexPoints = group.vertexPointIds
          .map((pointId) => pointsById.get(pointId)?.geometryECEF)
          .filter((point): point is Cartesian3 => Boolean(point));
        if (baseVertexPoints.length < 2) {
          return null;
        }

        const previewTargetPoint = candidateConnection?.showDirectLine
          ? candidateConnection.targetPointECEF
          : null;
        const lastBaseVertex = baseVertexPoints[baseVertexPoints.length - 1];
        const previewIncludesHoveredPoint = Boolean(
          previewTargetPoint &&
            lastBaseVertex &&
            Cartesian3.distanceSquared(lastBaseVertex, previewTargetPoint) >
              1e-6
        );
        const vertexPoints = previewIncludesHoveredPoint
          ? [...baseVertexPoints, Cartesian3.clone(previewTargetPoint)]
          : baseVertexPoints;

        return vertexPoints.length >= 3
          ? {
              group,
              vertexPoints,
            }
          : null;
      }

      return null;
    })
    .filter(
      (
        previewGroup
      ): previewGroup is {
        group: PlanarPolygonGroup;
        vertexPoints: Cartesian3[];
      } => Boolean(previewGroup && previewGroup.vertexPoints.length >= 3)
    );

export const buildGroundPolygonPreviewGroups = (
  params: PolygonPreviewBuildParams
): PolygonPreviewGroup[] =>
  buildPolygonPreviewGroups(params).filter(
    (previewGroup) => previewGroup.group.type === ANNOTATION_TYPE_AREA_GROUND
  );

export const buildVerticalPolygonPreviewGroups = (
  params: PolygonPreviewBuildParams
): PolygonPreviewGroup[] =>
  buildPolygonPreviewGroups(params).filter(
    (previewGroup) => previewGroup.group.type === ANNOTATION_TYPE_AREA_VERTICAL
  );

export const buildPlanarPolygonPreviewGroups = (
  params: PolygonPreviewBuildParams
): PolygonPreviewGroup[] =>
  buildPolygonPreviewGroups(params).filter(
    (previewGroup) => previewGroup.group.type === ANNOTATION_TYPE_AREA_PLANAR
  );

export const buildPolygonPreviewGroupsBySurface = (
  params: PolygonPreviewBuildParams
): PolygonPreviewGroupsBySurface => ({
  groundPolygonPreviewGroups: buildGroundPolygonPreviewGroups(params),
  verticalPolygonPreviewGroups: buildVerticalPolygonPreviewGroups(params),
  planarPolygonPreviewGroups: buildPlanarPolygonPreviewGroups(params),
});

export const buildVerticalPreviewEdgeSegments = (
  polygonPreviewGroups: PolygonPreviewGroup[]
): VerticalPreviewEdgeSegment[] =>
  polygonPreviewGroups
    .filter(
      ({ group, vertexPoints }) =>
        !group.closed &&
        group.type === ANNOTATION_TYPE_AREA_VERTICAL &&
        vertexPoints.length === 4
    )
    .flatMap(({ group, vertexPoints }) => {
      const segments: VerticalPreviewEdgeSegment[] = [];
      for (let index = 0; index < vertexPoints.length; index += 1) {
        const start = vertexPoints[index];
        const end = vertexPoints[(index + 1) % vertexPoints.length];
        if (!start || !end) continue;
        segments.push({
          id: `${group.id}:${index}`,
          start,
          end,
        });
      }
      return segments;
    });

export const buildVerticalPreviewCornerMarkers = (
  polygonPreviewGroups: PolygonPreviewGroup[]
): VerticalPreviewCornerMarker[] =>
  polygonPreviewGroups
    .filter(
      ({ group, vertexPoints }) =>
        !group.closed &&
        group.type === ANNOTATION_TYPE_AREA_VERTICAL &&
        vertexPoints.length === 4
    )
    .flatMap(({ group, vertexPoints }) => {
      const horizontalCorner = vertexPoints[1];
      const verticalCorner = vertexPoints[3];
      if (!horizontalCorner || !verticalCorner) return [];
      return [
        {
          id: `${group.id}:horizontal`,
          position: horizontalCorner,
        },
        {
          id: `${group.id}:vertical`,
          position: verticalCorner,
        },
      ];
    });
