import { Cartesian3 } from "@carma/cesium";

import {
  type PlanarPolygonGroup,
  type PointMeasurementEntry,
} from "../types/MeasurementTypes";

export const POLYGON_PREVIEW_STROKE = "rgba(255, 255, 255, 0.65)";
export const POLYGON_PREVIEW_STROKE_WIDTH_PX = 1;

const FACADE_RECTANGLE_COMPONENT_EPSILON_METERS = 0.05;

export type PolygonPreviewGroup = {
  group: PlanarPolygonGroup;
  vertexPoints: Cartesian3[];
};

export type GroundPolygonPreviewGroup = PolygonPreviewGroup & {
  group: PlanarPolygonGroup & {
    surfaceType?: "terrain" | "footprint";
  };
};

export type VerticalPolygonPreviewGroup = PolygonPreviewGroup & {
  group: PlanarPolygonGroup & {
    surfaceType: "facade";
  };
};

export type PlanarPolygonPreviewGroup = PolygonPreviewGroup & {
  group: PlanarPolygonGroup & {
    surfaceType?: "roof";
  };
};

export type FacadePreviewEdgeSegment = {
  id: string;
  start: Cartesian3;
  end: Cartesian3;
};

export type FacadePreviewCornerMarker = {
  id: string;
  position: Cartesian3;
};

export type PolylinePreviewMeasurement = {
  id: string;
  vertexPoints: Cartesian3[];
};

export type PolygonPreviewGroupsBySurface = {
  groundPolygonPreviewGroups: GroundPolygonPreviewGroup[];
  verticalPolygonPreviewGroups: VerticalPolygonPreviewGroup[];
  planarPolygonPreviewGroups: PlanarPolygonPreviewGroup[];
};

const isGroundPolygonPreviewGroup = (
  previewGroup: PolygonPreviewGroup
): previewGroup is GroundPolygonPreviewGroup => {
  const surfaceType = previewGroup.group.surfaceType ?? "roof";
  return surfaceType === "footprint" || surfaceType === "terrain";
};

const isVerticalPolygonPreviewGroup = (
  previewGroup: PolygonPreviewGroup
): previewGroup is VerticalPolygonPreviewGroup =>
  (previewGroup.group.surfaceType ?? "roof") === "facade";

const isPlanarPolygonPreviewGroup = (
  previewGroup: PolygonPreviewGroup
): previewGroup is PlanarPolygonPreviewGroup =>
  (previewGroup.group.surfaceType ?? "roof") === "roof";

export const buildFacadeRectangleCornerFromDiagonal = (
  firstCorner: Cartesian3,
  oppositeCorner: Cartesian3
) => {
  const up = Cartesian3.normalize(firstCorner, new Cartesian3());
  const diagonal = Cartesian3.subtract(
    oppositeCorner,
    firstCorner,
    new Cartesian3()
  );

  const verticalMeters = Cartesian3.dot(diagonal, up);
  const verticalComponent = Cartesian3.multiplyByScalar(
    up,
    verticalMeters,
    new Cartesian3()
  );
  const horizontalComponent = Cartesian3.subtract(
    diagonal,
    verticalComponent,
    new Cartesian3()
  );
  const horizontalMeters = Cartesian3.magnitude(horizontalComponent);
  const verticalAbsoluteMeters = Math.abs(verticalMeters);

  if (
    horizontalMeters < FACADE_RECTANGLE_COMPONENT_EPSILON_METERS ||
    verticalAbsoluteMeters < FACADE_RECTANGLE_COMPONENT_EPSILON_METERS
  ) {
    return null;
  }

  const adjacentHorizontalCorner = Cartesian3.add(
    firstCorner,
    horizontalComponent,
    new Cartesian3()
  );
  const adjacentVerticalCorner = Cartesian3.add(
    firstCorner,
    verticalComponent,
    new Cartesian3()
  );

  return {
    adjacentHorizontalCorner,
    adjacentVerticalCorner,
  };
};

export const buildPolygonPreviewGroups = ({
  planarPolygonGroups,
  pointsById,
  facadeRectanglePreviewOppositeByGroupId,
  activePlanarPolygonGroupId,
  livePreviewDistanceLine,
}: {
  planarPolygonGroups: PlanarPolygonGroup[];
  pointsById: ReadonlyMap<string, PointMeasurementEntry>;
  facadeRectanglePreviewOppositeByGroupId?: Readonly<
    Record<string, Cartesian3>
  >;
  activePlanarPolygonGroupId?: string | null;
  livePreviewDistanceLine?: {
    anchorPointECEF: Cartesian3;
    targetPointECEF: Cartesian3;
    showDirectLine: boolean;
    showVerticalLine: boolean;
    showHorizontalLine: boolean;
  } | null;
}): PolygonPreviewGroup[] =>
  planarPolygonGroups
    .map((group) => {
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
        (group.surfaceType ?? "roof") === "facade" &&
        group.vertexPointIds.length === 1
      ) {
        const firstVertexId = group.vertexPointIds[0] ?? null;
        const firstVertex = firstVertexId
          ? pointsById.get(firstVertexId)?.geometryECEF
          : null;
        const previewOppositeCorner =
          facadeRectanglePreviewOppositeByGroupId?.[group.id];
        if (!firstVertex || !previewOppositeCorner) {
          return null;
        }

        const facadeCorners = buildFacadeRectangleCornerFromDiagonal(
          firstVertex,
          previewOppositeCorner
        );
        if (!facadeCorners) {
          return null;
        }

        return {
          group,
          vertexPoints: [
            firstVertex,
            facadeCorners.adjacentHorizontalCorner,
            previewOppositeCorner,
            facadeCorners.adjacentVerticalCorner,
          ],
        };
      }

      if (
        !group.closed &&
        group.id === activePlanarPolygonGroupId &&
        ((group.surfaceType ?? "roof") === "footprint" ||
          (group.surfaceType ?? "roof") === "roof") &&
        livePreviewDistanceLine?.showDirectLine
      ) {
        const baseVertexPoints = group.vertexPointIds
          .map((pointId) => pointsById.get(pointId)?.geometryECEF)
          .filter((point): point is Cartesian3 => Boolean(point));
        if (baseVertexPoints.length < 2) {
          return null;
        }

        const previewTargetPoint = livePreviewDistanceLine.targetPointECEF;
        const lastBaseVertex = baseVertexPoints[baseVertexPoints.length - 1];
        if (
          !previewTargetPoint ||
          (lastBaseVertex &&
            Cartesian3.distanceSquared(lastBaseVertex, previewTargetPoint) <=
              1e-6)
        ) {
          return null;
        }

        return {
          group,
          vertexPoints: [
            ...baseVertexPoints,
            Cartesian3.clone(previewTargetPoint),
          ],
        };
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

export const buildPolygonPreviewGroupsBySurface = (params: {
  planarPolygonGroups: PlanarPolygonGroup[];
  pointsById: ReadonlyMap<string, PointMeasurementEntry>;
  facadeRectanglePreviewOppositeByGroupId?: Readonly<
    Record<string, Cartesian3>
  >;
  activePlanarPolygonGroupId?: string | null;
  livePreviewDistanceLine?: {
    anchorPointECEF: Cartesian3;
    targetPointECEF: Cartesian3;
    showDirectLine: boolean;
    showVerticalLine: boolean;
    showHorizontalLine: boolean;
  } | null;
}): PolygonPreviewGroupsBySurface => {
  const polygonPreviewGroups = buildPolygonPreviewGroups(params);
  return {
    groundPolygonPreviewGroups: polygonPreviewGroups.filter(
      isGroundPolygonPreviewGroup
    ),
    verticalPolygonPreviewGroups: polygonPreviewGroups.filter(
      isVerticalPolygonPreviewGroup
    ),
    planarPolygonPreviewGroups: polygonPreviewGroups.filter(
      isPlanarPolygonPreviewGroup
    ),
  };
};

export const buildFacadePreviewEdgeSegments = (
  polygonPreviewGroups: PolygonPreviewGroup[]
): FacadePreviewEdgeSegment[] =>
  polygonPreviewGroups
    .filter(
      ({ group, vertexPoints }) =>
        !group.closed &&
        (group.surfaceType ?? "roof") === "facade" &&
        vertexPoints.length === 4
    )
    .flatMap(({ group, vertexPoints }) => {
      const segments: FacadePreviewEdgeSegment[] = [];
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

export const buildFacadePreviewCornerMarkers = (
  polygonPreviewGroups: PolygonPreviewGroup[]
): FacadePreviewCornerMarker[] =>
  polygonPreviewGroups
    .filter(
      ({ group, vertexPoints }) =>
        !group.closed &&
        (group.surfaceType ?? "roof") === "facade" &&
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

export const buildPolylinePreviewMeasurements = ({
  planarPolygonGroups,
  pointsById,
  facadeRectanglePreviewOppositeByGroupId,
}: {
  planarPolygonGroups: PlanarPolygonGroup[];
  pointsById: ReadonlyMap<string, PointMeasurementEntry>;
  facadeRectanglePreviewOppositeByGroupId?: Readonly<
    Record<string, Cartesian3>
  >;
}): PolylinePreviewMeasurement[] =>
  planarPolygonGroups
    .map((group) => {
      if (group.closed) return null;
      if ((group.surfaceType ?? "roof") !== "facade") return null;
      if (group.vertexPointIds.length !== 1) return null;

      const firstVertexId = group.vertexPointIds[0] ?? null;
      const firstVertex = firstVertexId
        ? pointsById.get(firstVertexId)?.geometryECEF
        : null;
      const previewOppositeCorner =
        facadeRectanglePreviewOppositeByGroupId?.[group.id];
      if (!firstVertex || !previewOppositeCorner) {
        return null;
      }

      const facadeCorners = buildFacadeRectangleCornerFromDiagonal(
        firstVertex,
        previewOppositeCorner
      );
      if (!facadeCorners) {
        return null;
      }

      return {
        id: group.id,
        vertexPoints: [
          firstVertex,
          facadeCorners.adjacentHorizontalCorner,
          previewOppositeCorner,
          facadeCorners.adjacentVerticalCorner,
        ],
      };
    })
    .filter((measurement): measurement is PolylinePreviewMeasurement =>
      Boolean(measurement && measurement.vertexPoints.length === 4)
    );

export const buildPolylinePreviewEdgeSegments = (
  polylineMeasurements: PolylinePreviewMeasurement[]
): FacadePreviewEdgeSegment[] =>
  polylineMeasurements.flatMap(({ id, vertexPoints }) => {
    const segments: FacadePreviewEdgeSegment[] = [];
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
): FacadePreviewCornerMarker[] =>
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
