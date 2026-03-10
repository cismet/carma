import { Cartesian3, CarmaTransforms } from "@carma/cesium";
import {
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_POINT,
  AnnotationMode,
  type AnnotationToolType,
  PointDistanceRelation,
  PointAnnotationEntry,
  getCustomPointAnnotationName,
} from "@carma-mapping/annotations/core";

import type {
  DistanceTableRow,
  DistanceAnnotationSlotsInput,
  AnnotationSlotActions,
} from "./annotationInfoBoxSlots.types";
import {
  findReferencePointMeasurement,
  isPointReferenceMeasurement,
  resolvePointAnnotationDisplayPoint,
  resolvePointRelativeElevation,
} from "./utils/pointAnnotationDisplay";

type GetDistanceMeasurementSlotsInputParams = {
  activeToolType: AnnotationToolType;
  measurement: PointAnnotationEntry | null;
  activeMeasurementId: string | null;
  pointEntries: ReadonlyArray<PointAnnotationEntry>;
  referencePoint: PointAnnotationEntry["geometryECEF"] | null;
  hasDistancePreviewAnchor: boolean;
  distanceRelations: ReadonlyArray<PointDistanceRelation>;
  pointMarkerBadgeByPointId: Readonly<Record<string, { text?: string }>>;
  getAnnotationOrderByType: (
    type: AnnotationMode,
    id: string | null | undefined
  ) => number | null;
  getNextAnnotationOrderByType: (type: AnnotationMode) => number;
  actions: AnnotationSlotActions;
};

export type DistanceMeasurementSlotsInputResult = {
  slotsInput: DistanceAnnotationSlotsInput;
  isDistanceMeasurement: boolean;
  isDistanceCandidate: boolean;
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

const resolvePointLabel = ({
  point,
  getAnnotationOrderByType,
  fallbackPointOrderById,
  pointMarkerBadgeByPointId,
}: {
  point: PointAnnotationEntry;
  getAnnotationOrderByType: (
    type: AnnotationMode,
    id: string | null | undefined
  ) => number | null;
  fallbackPointOrderById: ReadonlyMap<string, number>;
  pointMarkerBadgeByPointId: Readonly<Record<string, { text?: string }>>;
}): string => {
  const customName = getCustomPointAnnotationName(point.name);
  if (customName) {
    return customName;
  }
  const order = getAnnotationOrderByType(ANNOTATION_TYPE_POINT, point.id);
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
  const enu = CarmaTransforms.getEastNorthUpOffset(
    fromPoint.geometryECEF,
    toPoint.geometryECEF
  );
  return {
    id,
    relationId,
    label,
    vertical: enu.up,
    horizontalDistance: Math.hypot(enu.east, enu.north),
    distance: Cartesian3.distance(fromPoint.geometryECEF, toPoint.geometryECEF),
    isImplicitReferenceRow,
  };
};

export const getDistanceAnnotationSlotsInput = ({
  activeToolType,
  measurement,
  activeMeasurementId,
  pointEntries,
  referencePoint,
  hasDistancePreviewAnchor,
  distanceRelations,
  pointMarkerBadgeByPointId,
  getAnnotationOrderByType,
  getNextAnnotationOrderByType,
  actions,
}: GetDistanceMeasurementSlotsInputParams): DistanceMeasurementSlotsInputResult => {
  const displayPoint = resolvePointAnnotationDisplayPoint(measurement);
  const isDistanceMeasurement = isDistanceMeasurementEntry({
    measurement,
    distanceRelations,
  });
  const isDistanceCandidate = activeToolType === ANNOTATION_TYPE_DISTANCE;
  const currentOrderToken = measurement
    ? pointMarkerBadgeByPointId[measurement.id]?.text ?? null
    : null;
  const pointEntryById = new Map(
    pointEntries.map((pointEntry) => [pointEntry.id, pointEntry])
  );
  const fallbackPointOrderById = new Map(
    [...pointEntries]
      .sort((left, right) => {
        const indexDelta = (left.index ?? 0) - (right.index ?? 0);
        if (indexDelta !== 0) return indexDelta;
        const timeDelta = left.timestamp - right.timestamp;
        if (timeDelta !== 0) return timeDelta;
        return left.id.localeCompare(right.id);
      })
      .map((pointEntry, index) => [pointEntry.id, index + 1] as const)
  );

  const distanceTableRows = (() => {
    if (!measurement) {
      return [] as DistanceTableRow[];
    }

    if (isDistanceCandidate) {
      if (!hasDistancePreviewAnchor) {
        return [] as DistanceTableRow[];
      }
      const activeAnchorPoint =
        activeMeasurementId !== null
          ? pointEntryById.get(activeMeasurementId) ?? null
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
        const relatedPoint = pointEntryById.get(relatedPointId);
        if (!relatedPoint) {
          return null;
        }

        return buildDistanceRow({
          id: `${relation.id}-${relatedPointId}`,
          relationId: relation.id,
          label: resolvePointLabel({
            point: relatedPoint,
            getAnnotationOrderByType,
            fallbackPointOrderById,
            pointMarkerBadgeByPointId,
          }),
          fromPoint: measurement,
          toPoint: relatedPoint,
        });
      })
      .filter((row): row is DistanceTableRow => row !== null);

    const referencePointMeasurement = findReferencePointMeasurement({
      pointEntries,
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
            getAnnotationOrderByType,
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
      kind: ANNOTATION_TYPE_DISTANCE,
      measurement,
      displayPoint,
      relativeElevation: resolvePointRelativeElevation(
        displayPoint,
        referencePoint
      ),
      isReference: isPointReferenceMeasurement(measurement, referencePoint),
      currentOrder: getAnnotationOrderByType(
        ANNOTATION_TYPE_DISTANCE,
        measurement?.id
      ),
      currentOrderToken,
      nextOrder: getNextAnnotationOrderByType(ANNOTATION_TYPE_DISTANCE),
      isCandidate: isDistanceCandidate,
      hasCandidateAnchor: hasDistancePreviewAnchor,
      subtitleDirectDistanceMeters,
      distanceTableRows,
      actions,
    },
    isDistanceMeasurement,
    isDistanceCandidate,
  };
};
