import {
  Cartesian3,
  cartesian3FromJson,
  cartesian3ToJson,
  getDegreesFromCartesian,
  getPositionWithVerticalOffsetFromAnchor,
} from "@carma/cesium";
import type { Feature, FeatureCollection, Geometry, Position } from "geojson";

import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_LABEL,
  ANNOTATION_TYPE_POINT,
  type AnnotationType,
  type NodeChainAnnotation,
} from "../types/annotationTypes";
import type { PointDistanceRelation } from "../types/distanceRelation";
import {
  isPointAnnotationEntry,
  type AnnotationCollection,
  type PointAnnotationEntry,
} from "../types/annotationCesiumTypes";

export type AnnotationGeoJsonFeatureCollection = FeatureCollection<
  Geometry,
  Record<string, unknown>
>;

type BuildAnnotationGeoJsonFeatureCollectionParams = {
  annotationId: string;
  annotations: AnnotationCollection;
  nodeChainAnnotations: readonly NodeChainAnnotation[];
  distanceRelations: readonly PointDistanceRelation[];
};

const EXPORT_VERSION = 1 as const;

type Cartesian3JsonLike = ReturnType<typeof cartesian3ToJson>;

const isPolygonAnnotationKind = (
  kind: AnnotationType
): kind is
  | typeof ANNOTATION_TYPE_AREA_GROUND
  | typeof ANNOTATION_TYPE_AREA_PLANAR
  | typeof ANNOTATION_TYPE_AREA_VERTICAL =>
  kind === ANNOTATION_TYPE_AREA_GROUND ||
  kind === ANNOTATION_TYPE_AREA_PLANAR ||
  kind === ANNOTATION_TYPE_AREA_VERTICAL;

const getPointSemanticKind = (
  annotation: PointAnnotationEntry
): AnnotationType => {
  if (annotation.auxiliaryLabelAnchor) {
    return ANNOTATION_TYPE_LABEL;
  }

  return annotation.type === ANNOTATION_TYPE_DISTANCE
    ? ANNOTATION_TYPE_DISTANCE
    : ANNOTATION_TYPE_POINT;
};

const normalizePropertyValue = (value: unknown): unknown => {
  if (value === undefined) {
    return undefined;
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Cartesian3) {
    return cartesian3ToJson(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizePropertyValue(entry))
      .filter((entry) => entry !== undefined);
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, entry]) => {
        const normalizedEntry = normalizePropertyValue(entry);
        return normalizedEntry === undefined ? [] : [[key, normalizedEntry]];
      })
    );
  }

  return String(value);
};

const normalizePropertyRecord = (
  value: Record<string, unknown>
): Record<string, unknown> =>
  (normalizePropertyValue(value) as Record<string, unknown>) ?? {};

const toGeoJsonPosition = (positionECEF: Cartesian3): Position => {
  const positionWGS84 = getDegreesFromCartesian(positionECEF);

  return [
    positionWGS84.longitude,
    positionWGS84.latitude,
    positionWGS84.altitude ?? 0,
  ];
};

const getPointBasePosition = (point: PointAnnotationEntry): Cartesian3 =>
  point.verticalOffsetAnchorECEF
    ? cartesian3FromJson(point.verticalOffsetAnchorECEF)
    : point.geometryECEF;

const getNodeChainPointPosition = (
  point: PointAnnotationEntry,
  verticalOffsetMeters: number
): Cartesian3 => {
  const basePosition = getPointBasePosition(point);

  return Math.abs(verticalOffsetMeters) > 1e-9
    ? getPositionWithVerticalOffsetFromAnchor(
        basePosition,
        verticalOffsetMeters
      )
    : basePosition;
};

const createFeatureCollection = (
  feature: Feature<Geometry, Record<string, unknown>>
): AnnotationGeoJsonFeatureCollection => ({
  type: "FeatureCollection",
  features: [feature],
});

const buildPointProperties = (
  annotation: PointAnnotationEntry
): Record<string, unknown> => {
  const {
    geometryECEF: _geometryECEF,
    geometryWGS84: _geometryWGS84,
    ...rest
  } = annotation;

  return {
    exportVersion: EXPORT_VERSION,
    annotationId: annotation.id,
    annotationKind: getPointSemanticKind(annotation),
    annotation: normalizePropertyRecord(rest as Record<string, unknown>),
    geometryECEF: cartesian3ToJson(annotation.geometryECEF),
  };
};

const buildPointFeatureCollection = (
  annotation: PointAnnotationEntry
): AnnotationGeoJsonFeatureCollection =>
  createFeatureCollection({
    type: "Feature",
    id: annotation.id,
    geometry: {
      type: "Point",
      coordinates: toGeoJsonPosition(annotation.geometryECEF),
    },
    properties: buildPointProperties(annotation),
  });

const buildDistanceFeatureCollection = (
  annotation: PointAnnotationEntry,
  annotations: AnnotationCollection,
  distanceRelations: readonly PointDistanceRelation[]
): AnnotationGeoJsonFeatureCollection => {
  const pointsById = new Map(
    annotations
      .filter(isPointAnnotationEntry)
      .map((point) => [point.id, point] as const)
  );
  const relatedDistanceRelations = distanceRelations.filter(
    (relation) =>
      relation.pointAId === annotation.id || relation.pointBId === annotation.id
  );
  const relatedPoints = relatedDistanceRelations
    .map((relation) =>
      pointsById.get(
        relation.pointAId === annotation.id
          ? relation.pointBId
          : relation.pointAId
      )
    )
    .filter((point): point is PointAnnotationEntry => Boolean(point));
  const uniqueRelatedPoints = Array.from(
    new Map(relatedPoints.map((point) => [point.id, point] as const)).values()
  );
  const relationLineGeometries = relatedDistanceRelations
    .map((relation) => {
      const relatedPoint = pointsById.get(
        relation.pointAId === annotation.id
          ? relation.pointBId
          : relation.pointAId
      );
      if (!relatedPoint) {
        return null;
      }

      return {
        type: "LineString" as const,
        coordinates: [
          toGeoJsonPosition(annotation.geometryECEF),
          toGeoJsonPosition(relatedPoint.geometryECEF),
        ],
      };
    })
    .filter((geometry): geometry is Extract<Geometry, { type: "LineString" }> =>
      Boolean(geometry)
    );

  const geometry: Geometry =
    relationLineGeometries.length > 0 || uniqueRelatedPoints.length > 0
      ? {
          type: "GeometryCollection",
          geometries: [
            {
              type: "Point",
              coordinates: toGeoJsonPosition(annotation.geometryECEF),
            },
            ...uniqueRelatedPoints.map(
              (point) =>
                ({
                  type: "Point",
                  coordinates: toGeoJsonPosition(point.geometryECEF),
                } satisfies Geometry)
            ),
            ...relationLineGeometries,
          ],
        }
      : {
          type: "Point",
          coordinates: toGeoJsonPosition(annotation.geometryECEF),
        };

  return createFeatureCollection({
    type: "Feature",
    id: annotation.id,
    geometry,
    properties: {
      ...buildPointProperties(annotation),
      relatedPoints: uniqueRelatedPoints.map((point) => ({
        annotationId: point.id,
        annotationKind: getPointSemanticKind(point),
        annotation: normalizePropertyRecord(
          (({
            geometryECEF: _geometryECEF,
            geometryWGS84: _geometryWGS84,
            ...rest
          }) => rest)(point) as Record<string, unknown>
        ),
        geometryECEF: cartesian3ToJson(point.geometryECEF),
      })),
      relations: relatedDistanceRelations.map((relation) => {
        const relatedPoint = pointsById.get(
          relation.pointAId === annotation.id
            ? relation.pointBId
            : relation.pointAId
        );

        return {
          relation: normalizePropertyRecord(
            relation as Record<string, unknown>
          ),
          geometryECEF: relatedPoint
            ? [
                cartesian3ToJson(annotation.geometryECEF),
                cartesian3ToJson(relatedPoint.geometryECEF),
              ]
            : [cartesian3ToJson(annotation.geometryECEF)],
        };
      }),
      geometryECEF: {
        point: cartesian3ToJson(annotation.geometryECEF),
        relationLines: relatedDistanceRelations
          .map((relation) => {
            const relatedPoint = pointsById.get(
              relation.pointAId === annotation.id
                ? relation.pointBId
                : relation.pointAId
            );

            if (!relatedPoint) {
              return null;
            }

            return {
              relationId: relation.id,
              coordinates: [
                cartesian3ToJson(annotation.geometryECEF),
                cartesian3ToJson(relatedPoint.geometryECEF),
              ],
            };
          })
          .filter(
            (
              entry
            ): entry is {
              relationId: string;
              coordinates: Cartesian3JsonLike[];
            } => Boolean(entry)
          ),
      },
    },
  });
};

const buildNodeChainFeatureCollection = (
  annotation: NodeChainAnnotation,
  annotations: AnnotationCollection
): AnnotationGeoJsonFeatureCollection | null => {
  const pointsById = new Map(
    annotations
      .filter(isPointAnnotationEntry)
      .map((point) => [point.id, point] as const)
  );
  const verticalOffsetMeters = annotation.verticalOffsetMeters ?? 0;
  const nodeEntries = annotation.nodeIds
    .map((pointId, order) => {
      const point = pointsById.get(pointId);
      if (!point) {
        return null;
      }

      const effectivePositionECEF = getNodeChainPointPosition(
        point,
        verticalOffsetMeters
      );

      return {
        order,
        point,
        effectivePositionECEF,
      };
    })
    .filter(
      (
        entry
      ): entry is {
        order: number;
        point: PointAnnotationEntry;
        effectivePositionECEF: Cartesian3;
      } => Boolean(entry)
    );

  if (nodeEntries.length === 0) {
    return null;
  }

  const nodePositionsECEF = nodeEntries.map(
    (entry) => entry.effectivePositionECEF
  );
  const nodePositionsWGS84 = nodePositionsECEF.map(toGeoJsonPosition);

  let geometry: Geometry;
  let geometryECEF: unknown;

  if (
    isPolygonAnnotationKind(annotation.type) &&
    nodePositionsWGS84.length >= 3
  ) {
    const closedRingWGS84 = [...nodePositionsWGS84, nodePositionsWGS84[0]];
    const closedRingECEF = [
      ...nodePositionsECEF.map(cartesian3ToJson),
      cartesian3ToJson(nodePositionsECEF[0]),
    ];

    geometry = {
      type: "Polygon",
      coordinates: [closedRingWGS84],
    };
    geometryECEF = closedRingECEF;
  } else if (nodePositionsWGS84.length >= 2) {
    geometry = {
      type: "LineString",
      coordinates: nodePositionsWGS84,
    };
    geometryECEF = nodePositionsECEF.map(cartesian3ToJson);
  } else {
    geometry = {
      type: "Point",
      coordinates: nodePositionsWGS84[0],
    };
    geometryECEF = cartesian3ToJson(nodePositionsECEF[0]);
  }

  return createFeatureCollection({
    type: "Feature",
    id: annotation.id,
    geometry,
    properties: {
      exportVersion: EXPORT_VERSION,
      annotationId: annotation.id,
      annotationKind: annotation.type,
      annotation: normalizePropertyRecord(
        annotation as Record<string, unknown>
      ),
      geometryECEF,
      nodes: nodeEntries.map(({ order, point, effectivePositionECEF }) => ({
        order,
        annotationId: point.id,
        annotationKind: getPointSemanticKind(point),
        annotation: normalizePropertyRecord(
          (({
            geometryECEF: _geometryECEF,
            geometryWGS84: _geometryWGS84,
            ...rest
          }) => rest)(point) as Record<string, unknown>
        ),
        geometryECEF: cartesian3ToJson(effectivePositionECEF),
      })),
    },
  });
};

export const buildAnnotationGeoJsonFeatureCollection = ({
  annotationId,
  annotations,
  nodeChainAnnotations,
  distanceRelations,
}: BuildAnnotationGeoJsonFeatureCollectionParams): AnnotationGeoJsonFeatureCollection | null => {
  const nodeChainAnnotation =
    nodeChainAnnotations.find((entry) => entry.id === annotationId) ?? null;

  if (nodeChainAnnotation) {
    return buildNodeChainFeatureCollection(nodeChainAnnotation, annotations);
  }

  const pointAnnotation =
    annotations.find(
      (entry): entry is PointAnnotationEntry =>
        entry.id === annotationId && isPointAnnotationEntry(entry)
    ) ?? null;

  if (!pointAnnotation) {
    return null;
  }

  if (pointAnnotation.type === ANNOTATION_TYPE_DISTANCE) {
    return buildDistanceFeatureCollection(
      pointAnnotation,
      annotations,
      distanceRelations
    );
  }

  return buildPointFeatureCollection(pointAnnotation);
};
