import { Cartesian3, CarmaTransforms } from "@carma/cesium";
import {
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_POINT,
  compareOrderedEntries,
  getCustomPointAnnotationName,
  isDistancePointEntry,
  type AnnotationPointEntry,
} from "@carma-mapping/annotations/core";
import { formatNumber } from "@carma-mapping/annotations/core";
import type {
  AnnotationSlots,
  AnnotationInfoBoxEntryPayload,
  DistanceTableRow,
} from "../annotationInfoBoxSlots.types";
import {
  DISTANCE_TITLE,
  getDistanceInstructionText,
  getInfoBoxDistanceDefaultName,
  renderDistanceTableContent,
  renderEditableAnnotationSubtitle,
} from "./shared";
import {
  findReferencePointMeasurement,
  isPointReferenceMeasurement,
  resolvePointAnnotationDisplayPoint,
} from "../utils/pointAnnotationDisplay";

const getNodeChainNodeIdSet = (
  input: Pick<
    AnnotationInfoBoxEntryPayload,
    | "polylineAnnotations"
    | "groundPolygons"
    | "planarPolygons"
    | "verticalPolygons"
  >
): ReadonlySet<string> => {
  const ids = new Set<string>();

  [
    ...input.polylineAnnotations,
    ...input.groundPolygons,
    ...input.planarPolygons,
    ...input.verticalPolygons,
  ].forEach((group) => {
    if (group.type === ANNOTATION_TYPE_DISTANCE) {
      return;
    }
    group.nodeIds.forEach((nodeId) => {
      if (nodeId) {
        ids.add(nodeId);
      }
    });
  });

  return ids;
};

const getStandaloneDistanceMeasurements = (
  input: AnnotationInfoBoxEntryPayload
): AnnotationPointEntry[] => {
  const nodeChainNodeIds = getNodeChainNodeIdSet(input);

  return input.pointEntries
    .filter(
      (entry) =>
        isDistancePointEntry(entry) &&
        !entry.auxiliaryLabelAnchor &&
        !nodeChainNodeIds.has(entry.id)
    )
    .sort(compareOrderedEntries);
};

const resolvePointLabel = ({
  point,
  pointEntries,
  pointMarkerBadgeByPointId,
}: {
  point: AnnotationPointEntry;
  pointEntries: ReadonlyArray<AnnotationPointEntry>;
  pointMarkerBadgeByPointId: AnnotationInfoBoxEntryPayload["pointMarkerBadgeByPointId"];
}): string => {
  const customName = getCustomPointAnnotationName(point.name);
  if (customName) {
    return customName;
  }

  const pointMeasurements = pointEntries
    .filter(
      (entry) =>
        entry.type === ANNOTATION_TYPE_POINT && !entry.auxiliaryLabelAnchor
    )
    .sort(compareOrderedEntries);
  const pointOrder = pointMeasurements.findIndex(
    (entry) => entry.id === point.id
  );
  if (pointOrder >= 0) {
    return `${pointOrder + 1}`;
  }

  const numericBadgeToken =
    pointMarkerBadgeByPointId[point.id]?.text?.trim() ?? "";
  if (/^\d+$/.test(numericBadgeToken)) {
    return numericBadgeToken;
  }

  const fallbackPointOrderById = new Map(
    [...pointEntries]
      .sort(compareOrderedEntries)
      .map((pointEntry, index) => [pointEntry.id, index + 1] as const)
  );
  const fallbackOrder = fallbackPointOrderById.get(point.id);
  if (fallbackOrder !== undefined) {
    return `${fallbackOrder}`;
  }

  return numericBadgeToken;
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
  fromPoint: AnnotationPointEntry;
  toPoint: AnnotationPointEntry;
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

export const getDistanceAnnotationInfoBoxSlots = (
  input: AnnotationInfoBoxEntryPayload
): AnnotationSlots => {
  const measurement =
    input.kind === ANNOTATION_TYPE_DISTANCE ? input.pointAnnotation : null;
  const distanceMeasurements = getStandaloneDistanceMeasurements(input);
  const currentOrder =
    measurement && isDistancePointEntry(measurement)
      ? distanceMeasurements.findIndex((entry) => entry.id === measurement.id) +
        1
      : null;
  const nextOrder = distanceMeasurements.length + 1;
  const currentOrderToken = measurement
    ? input.pointMarkerBadgeByPointId[measurement.id]?.text ?? null
    : null;
  const displayPoint = resolvePointAnnotationDisplayPoint(measurement);
  const isReference = isPointReferenceMeasurement(
    measurement,
    input.referencePoint
  );
  const pointById = new Map(
    input.pointEntries.map((pointEntry) => [pointEntry.id, pointEntry])
  );
  const distanceTableRows = (() => {
    if (!measurement) {
      return [] as DistanceTableRow[];
    }

    const relationRows = input.distanceRelations
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
        const relatedPoint = pointById.get(relatedPointId);
        if (!relatedPoint) {
          return null;
        }

        return buildDistanceRow({
          id: `${relation.id}-${relatedPointId}`,
          relationId: relation.id,
          label: resolvePointLabel({
            point: relatedPoint,
            pointEntries: input.pointEntries,
            pointMarkerBadgeByPointId: input.pointMarkerBadgeByPointId,
          }),
          fromPoint: measurement,
          toPoint: relatedPoint,
        });
      })
      .filter((row): row is DistanceTableRow => row !== null);

    const referencePointMeasurement = findReferencePointMeasurement({
      pointEntries: input.pointEntries,
      referencePoint: input.referencePoint,
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
            pointEntries: input.pointEntries,
            pointMarkerBadgeByPointId: input.pointMarkerBadgeByPointId,
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
    headingTitle: DISTANCE_TITLE,
    subtitle: renderEditableAnnotationSubtitle({
      defaultDisplayName: getInfoBoxDistanceDefaultName({
        currentOrderToken,
        currentOrder,
        nextOrder,
      }),
      measurement,
      displayPoint,
      subtitleMetaText:
        subtitleDirectDistanceMeters !== null
          ? `${formatNumber(subtitleDirectDistanceMeters)} m`
          : null,
      isReference,
      actions: input.actions,
    }),
    content: renderDistanceTableContent(distanceTableRows, false, false),
    collapsible: Boolean(measurement),
    instructionText: measurement ? null : getDistanceInstructionText(false),
  };
};
