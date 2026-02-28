import { Cartesian3 } from "@carma/cesium";
import type {
  AnnotationMode,
  PointDistanceRelation,
  PointAnnotationEntry,
} from "@carma-mapping/annotations/cesium";
import {
  getCustomPointAnnotationName,
  getENU,
  getEuclideanDistance,
} from "@carma-mapping/annotations/cesium";
import {
  SPATIAL_MARKUP_KIND_DISTANCE,
  type AnnotationListType,
} from "@carma-mapping/annotations/core";

import type {
  DistanceTableRow,
  DistanceAnnotationSlotsInput,
  AnnotationSlotActions,
} from "./getAnnotationInfoBoxSlots";
import {
  isReferenceMeasurement,
  resolveAnnotationDisplayPoint,
  resolveRelativeElevation,
} from "./annotationDisplayPoint";

const MODE_POINT_QUERY: AnnotationMode = "point_query";

type GetDistanceMeasurementSlotsInputParams = {
  measurementMode: AnnotationMode;
  measurement: PointAnnotationEntry | null;
  activeMeasurementId: string | null;
  pointMeasurements: ReadonlyArray<PointAnnotationEntry>;
  referencePoint: Cartesian3 | null;
  hasDistancePreviewAnchor: boolean;
  distanceRelations: ReadonlyArray<PointDistanceRelation>;
  pointMarkerBadgeByPointId: Readonly<Record<string, { text?: string }>>;
  getMeasurementOrderByType: (
    type: AnnotationListType<AnnotationMode>,
    id: string | null | undefined
  ) => number | null;
  getNextMeasurementOrderByType: (
    type: AnnotationListType<AnnotationMode>
  ) => number;
  actions: AnnotationSlotActions;
};

export type DistanceMeasurementSlotsInputResult = {
  slotsInput: DistanceAnnotationSlotsInput;
  isDistanceMeasurement: boolean;
  isDistanceLivePreview: boolean;
};

const isDistanceMeasurementEntry = ({
  measurement,
  distanceRelations,
}: {
  measurement: PointAnnotationEntry | null;
  distanceRelations: ReadonlyArray<PointDistanceRelation>;
}): boolean => {
  if (!measurement) return false;
  return distanceRelations.some(
    (relation) =>
      relation.pointAId === measurement.id ||
      relation.pointBId === measurement.id
  );
};

const REFERENCE_POINT_MATCH_EPSILON_METERS = 0.001;

const resolvePointLabel = ({
  point,
  getMeasurementOrderByType,
  fallbackPointOrderById,
  pointMarkerBadgeByPointId,
}: {
  point: PointAnnotationEntry;
  getMeasurementOrderByType: (
    type: AnnotationListType<AnnotationMode>,
    id: string | null | undefined
  ) => number | null;
  fallbackPointOrderById: ReadonlyMap<string, number>;
  pointMarkerBadgeByPointId: Readonly<Record<string, { text?: string }>>;
}): string => {
  const customName = getCustomPointAnnotationName(point.name);
  if (customName) {
    return customName;
  }
  const order = getMeasurementOrderByType("pointMeasure", point.id);
  if (order !== null) {
    return `${order}`;
  }
  const numericBadgeToken =
    pointMarkerBadgeByPointId[point.id]?.text?.trim() ?? "";
  if (/^\d+$/.test(numericBadgeToken)) {
    return numericBadgeToken;
  }
  const fallbackOrder = fallbackPointOrderById.get(point.id);
  if (fallbackOrder !== undefined) {
    return `${fallbackOrder}`;
  }
  if (numericBadgeToken.length > 0) {
    return numericBadgeToken;
  }
  return "";
};

const buildDistanceRow = ({
  id,
  relationId,
  label,
  fromPoint,
  toPoint,
  isImplicitReferenceRow = false,
}: {
  id: string;
  relationId?: string;
  label: string;
  fromPoint: PointAnnotationEntry;
  toPoint: PointAnnotationEntry;
  isImplicitReferenceRow?: boolean;
}): DistanceTableRow => {
  const enu = getENU(fromPoint.geometryECEF, toPoint.geometryECEF);
  return {
    id,
    relationId,
    label,
    vertical: enu.up,
    horizontalDistance: Math.hypot(enu.east, enu.north),
    distance: getEuclideanDistance(
      fromPoint.geometryECEF,
      toPoint.geometryECEF
    ),
    isImplicitReferenceRow,
  };
};

const resolveReferencePointMeasurement = ({
  pointMeasurements,
  referencePoint,
}: {
  pointMeasurements: ReadonlyArray<PointAnnotationEntry>;
  referencePoint: Cartesian3 | null;
}): PointAnnotationEntry | null => {
  if (!referencePoint) return null;
  return (
    pointMeasurements.find(
      (pointMeasurement) =>
        Cartesian3.distance(pointMeasurement.geometryECEF, referencePoint) <=
        REFERENCE_POINT_MATCH_EPSILON_METERS
    ) ?? null
  );
};

export const getDistanceAnnotationSlotsInput = ({
  measurementMode,
  measurement,
  activeMeasurementId,
  pointMeasurements,
  referencePoint,
  hasDistancePreviewAnchor,
  distanceRelations,
  pointMarkerBadgeByPointId,
  getMeasurementOrderByType,
  getNextMeasurementOrderByType,
  actions,
}: GetDistanceMeasurementSlotsInputParams): DistanceMeasurementSlotsInputResult => {
  const displayPoint = resolveAnnotationDisplayPoint({
    measurement,
  });
  const isDistanceMeasurement = isDistanceMeasurementEntry({
    measurement,
    distanceRelations,
  });
  const isDistanceLivePreview = measurementMode === MODE_POINT_QUERY;
  const currentOrderToken = measurement
    ? pointMarkerBadgeByPointId[measurement.id]?.text ?? null
    : null;
  const pointMeasurementById = new Map(
    pointMeasurements.map((pointMeasurement) => [
      pointMeasurement.id,
      pointMeasurement,
    ])
  );
  const fallbackPointOrderById = new Map(
    [...pointMeasurements]
      .sort((left, right) => {
        const indexDelta = (left.index ?? 0) - (right.index ?? 0);
        if (indexDelta !== 0) return indexDelta;
        const timeDelta = left.timestamp - right.timestamp;
        if (timeDelta !== 0) return timeDelta;
        return left.id.localeCompare(right.id);
      })
      .map((pointMeasurement, index) => [pointMeasurement.id, index + 1] as const)
  );

  const distanceTableRows = (() => {
    if (!measurement) {
      return [] as DistanceTableRow[];
    }

    if (isDistanceLivePreview) {
      if (!hasDistancePreviewAnchor) {
        return [] as DistanceTableRow[];
      }
      const activeAnchorPoint =
        activeMeasurementId !== null
          ? pointMeasurementById.get(activeMeasurementId) ?? null
          : null;
      if (!activeAnchorPoint || activeAnchorPoint.id === measurement.id) {
        return [] as DistanceTableRow[];
      }
      return [
        buildDistanceRow({
          id: `preview-${measurement.id}-${activeAnchorPoint.id}`,
          label: "Vorschau",
          fromPoint: measurement,
          toPoint: activeAnchorPoint,
        }),
      ];
    }

    const relationRows = distanceRelations
      .map((relation) => {
        if (
          relation.pointAId !== measurement.id &&
          relation.pointBId !== measurement.id
        ) {
          return null;
        }
        const relatedPointId =
          relation.pointAId === measurement.id
            ? relation.pointBId
            : relation.pointAId;
        const relatedPoint = pointMeasurementById.get(relatedPointId);
        if (!relatedPoint) {
          return null;
        }

        return buildDistanceRow({
          id: `${relation.id}-${relatedPointId}`,
          relationId: relation.id,
          label: resolvePointLabel({
            point: relatedPoint,
            getMeasurementOrderByType,
            fallbackPointOrderById,
            pointMarkerBadgeByPointId,
          }),
          fromPoint: measurement,
          toPoint: relatedPoint,
        });
      })
      .filter((row): row is DistanceTableRow => row !== null);

    const referencePointMeasurement = resolveReferencePointMeasurement({
      pointMeasurements,
      referencePoint,
    });
    if (
      referencePointMeasurement &&
      referencePointMeasurement.id !== measurement.id &&
      !relationRows.some((row) => row.id.endsWith(referencePointMeasurement.id))
    ) {
      relationRows.push(
        buildDistanceRow({
          id: `reference-${referencePointMeasurement.id}`,
          label: resolvePointLabel({
            point: referencePointMeasurement,
            getMeasurementOrderByType,
            fallbackPointOrderById,
            pointMarkerBadgeByPointId,
          }),
          fromPoint: measurement,
          toPoint: referencePointMeasurement,
          isImplicitReferenceRow: true,
        })
      );
    }

    return relationRows.sort((left, right) =>
      left.label.localeCompare(right.label, "de")
    );
  })();

  const subtitleDirectDistanceMeters =
    distanceTableRows.find((row) => !row.isImplicitReferenceRow)?.distance ??
    distanceTableRows[0]?.distance ??
    null;

  return {
    slotsInput: {
      kind: SPATIAL_MARKUP_KIND_DISTANCE,
      measurement,
      displayPoint,
      relativeElevation: resolveRelativeElevation({
        displayPoint,
        referencePoint,
      }),
      isReference: isReferenceMeasurement({
        measurement,
        referencePoint,
      }),
      currentOrder: getMeasurementOrderByType(
        "distanceMeasure",
        measurement?.id
      ),
      currentOrderToken,
      nextOrder: getNextMeasurementOrderByType("distanceMeasure"),
      isLivePreview: isDistanceLivePreview,
      hasPreviewAnchor: hasDistancePreviewAnchor,
      subtitleDirectDistanceMeters,
      distanceTableRows,
      actions,
    },
    isDistanceMeasurement,
    isDistanceLivePreview,
  };
};
