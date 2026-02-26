import { useMemo } from "react";
import type { Cartesian3 } from "@carma/cesium";
import {
  getENU,
  getEuclideanDistance,
  isPointMeasurementEntry,
  MeasurementMode,
  type MeasurementEntry,
  type PointDistanceRelation,
  useCesiumMeasurements,
} from "@carma-mapping/engines/cesium/measurements";

import { useMeasurements } from "../../context/MeasurementsContext";
import { buildMeasurementOrderById } from "../../utils/measurementOrdering";
import {
  fromAlphabeticSequence,
  toAlphabeticSequence,
} from "../../utils/measurementTokens";
import type { LivePreviewDistanceRow } from "./InfoBoxMeasurement3DPointDistance.types";

export const DEFAULT_DISTANCE_MEASUREMENT_PLACEHOLDER = "Distanzmessung";

type UseInfoBoxDistancePreviewStateParams = {
  currentMeasurement?: MeasurementEntry;
  isPolygonInfoMode: boolean;
  currentPointHasDistanceRelations: boolean;
};

type UseInfoBoxDistancePreviewStateResult = {
  isDistanceCreatePreviewMode: boolean;
  isCurrentPointDistanceMeasurement: boolean;
  hasActiveDistancePreviewAnchor: boolean;
  livePreviewDistanceRow: LivePreviewDistanceRow | null;
  currentDistanceMeasureOrder: number | null;
  currentDistanceMeasurementOrderDisplay: string | null;
  distancePreviewOrder: number;
  distancePreviewOrderToken: string;
  distanceNavigationInstructionText: string | null;
};

const getNextDistanceMeasureOrder = ({
  distanceMeasureEntriesByType,
  pointMarkerBadgeByPointId,
}: {
  distanceMeasureEntriesByType: MeasurementEntry[];
  pointMarkerBadgeByPointId: Readonly<Record<string, { text?: string }>>;
}): number => {
  const maxDistanceBadgeIndex = distanceMeasureEntriesByType.reduce<number>(
    (maxValue, measurement) => {
      const badgeToken =
        pointMarkerBadgeByPointId[measurement.id]?.text?.trim() ?? "";
      const tokenIndex = fromAlphabeticSequence(badgeToken);
      if (tokenIndex === null) return maxValue;
      return Math.max(maxValue, tokenIndex);
    },
    -1
  );

  if (maxDistanceBadgeIndex >= 0) {
    return maxDistanceBadgeIndex + 2;
  }
  return distanceMeasureEntriesByType.length + 1;
};

const resolveLivePreviewDistanceRow = ({
  isDistanceCreatePreviewMode,
  hasActiveDistancePreviewAnchor,
  livePreviewPointECEF,
  activePointMeasurement,
}: {
  isDistanceCreatePreviewMode: boolean;
  hasActiveDistancePreviewAnchor: boolean;
  livePreviewPointECEF: Cartesian3 | null;
  activePointMeasurement: MeasurementEntry | undefined;
}): LivePreviewDistanceRow | null => {
  if (!isDistanceCreatePreviewMode) return null;
  if (!hasActiveDistancePreviewAnchor) return null;
  if (!livePreviewPointECEF) return null;
  if (
    !activePointMeasurement ||
    !isPointMeasurementEntry(activePointMeasurement)
  ) {
    return null;
  }

  const enu = getENU(livePreviewPointECEF, activePointMeasurement.geometryECEF);
  return {
    label: "Vorschau",
    elevation: enu.up,
    horizontalDistance: Math.hypot(enu.east, enu.north),
    distance: getEuclideanDistance(
      livePreviewPointECEF,
      activePointMeasurement.geometryECEF
    ),
  };
};

const resolveCurrentDistanceBadgeToken = ({
  currentMeasurement,
  distanceRelations,
  activeDistancePreviewAnchorId,
  pointMarkerBadgeByPointId,
}: {
  currentMeasurement?: MeasurementEntry;
  distanceRelations: ReadonlyArray<PointDistanceRelation>;
  activeDistancePreviewAnchorId: string | null;
  pointMarkerBadgeByPointId: Readonly<Record<string, { text?: string }>>;
}): string | null => {
  if (!currentMeasurement || !isPointMeasurementEntry(currentMeasurement)) {
    return null;
  }

  const candidatePointIds = new Set<string>([currentMeasurement.id]);

  distanceRelations.forEach((relation) => {
    const touchesCurrentPoint =
      relation.pointAId === currentMeasurement.id ||
      relation.pointBId === currentMeasurement.id ||
      relation.anchorPointId === currentMeasurement.id;
    if (!touchesCurrentPoint) return;

    if (relation.pointAId) {
      candidatePointIds.add(relation.pointAId);
    }
    if (relation.pointBId) {
      candidatePointIds.add(relation.pointBId);
    }
    if (relation.anchorPointId) {
      candidatePointIds.add(relation.anchorPointId);
    }
  });

  if (activeDistancePreviewAnchorId) {
    candidatePointIds.add(activeDistancePreviewAnchorId);
  }

  const candidateTokens = Array.from(candidatePointIds)
    .map((pointId) => pointMarkerBadgeByPointId[pointId]?.text?.trim() ?? "")
    .filter((token): token is string => token.length > 0)
    .sort((left, right) =>
      left.localeCompare(right, undefined, {
        numeric: true,
        sensitivity: "base",
      })
    );

  return candidateTokens[0] ?? null;
};

export const useInfoBoxDistancePreviewState = ({
  currentMeasurement,
  isPolygonInfoMode,
  currentPointHasDistanceRelations,
}: UseInfoBoxDistancePreviewStateParams): UseInfoBoxDistancePreviewStateResult => {
  const { measurements, measurementsByType, measurementMode } = useMeasurements<
    MeasurementMode,
    MeasurementEntry
  >();
  const {
    activeMeasurementId,
    livePreviewPointECEF,
    hasDistancePreviewAnchor,
    distanceRelations,
    pointMarkerBadgeByPointId,
  } = useCesiumMeasurements();

  const distanceMeasureEntriesByType = useMemo(
    () => measurementsByType("distanceMeasure").filter(isPointMeasurementEntry),
    [measurementsByType]
  );
  const distanceMeasureOrderById = useMemo(
    () => buildMeasurementOrderById(distanceMeasureEntriesByType),
    [distanceMeasureEntriesByType]
  );
  const currentDistanceMeasureOrder =
    currentMeasurement && isPointMeasurementEntry(currentMeasurement)
      ? distanceMeasureOrderById[currentMeasurement.id] ?? null
      : null;
  const nextDistanceMeasureOrder = useMemo(
    () =>
      getNextDistanceMeasureOrder({
        distanceMeasureEntriesByType,
        pointMarkerBadgeByPointId,
      }),
    [distanceMeasureEntriesByType, pointMarkerBadgeByPointId]
  );
  const activePointMeasurement = useMemo(
    () =>
      activeMeasurementId
        ? measurements.find(
            (measurement) => measurement.id === activeMeasurementId
          )
        : undefined,
    [activeMeasurementId, measurements]
  );
  const isDistanceCreatePreviewMode =
    measurementMode === MeasurementMode.PointQuery && !isPolygonInfoMode;
  const isCurrentPointDistanceMeasurement = Boolean(
    currentMeasurement &&
      isPointMeasurementEntry(currentMeasurement) &&
      (Boolean(currentMeasurement.distanceAdhocNode) ||
        Boolean(currentMeasurement.distanceRelationId) ||
        currentPointHasDistanceRelations)
  );
  const hasActiveDistancePreviewAnchor =
    isDistanceCreatePreviewMode && hasDistancePreviewAnchor;
  const activeDistancePreviewAnchorId =
    hasActiveDistancePreviewAnchor &&
    activePointMeasurement &&
    isPointMeasurementEntry(activePointMeasurement)
      ? activePointMeasurement.id
      : null;
  const activeDistancePreviewAnchorHasCommittedRelation = Boolean(
    activeDistancePreviewAnchorId &&
      distanceRelations.some(
        (relation) =>
          relation.pointAId === activeDistancePreviewAnchorId ||
          relation.pointBId === activeDistancePreviewAnchorId
      )
  );
  const hasDraftDistanceMeasurementAnchor = Boolean(
    hasActiveDistancePreviewAnchor &&
      activePointMeasurement &&
      isPointMeasurementEntry(activePointMeasurement) &&
      activePointMeasurement.distanceAdhocNode &&
      !activePointMeasurement.distanceRelationId &&
      !activeDistancePreviewAnchorHasCommittedRelation
  );
  const activeDistancePreviewOrder = activeDistancePreviewAnchorId
    ? distanceMeasureOrderById[activeDistancePreviewAnchorId] ?? null
    : null;
  const livePreviewDistanceRow = useMemo(
    () =>
      resolveLivePreviewDistanceRow({
        isDistanceCreatePreviewMode,
        hasActiveDistancePreviewAnchor,
        livePreviewPointECEF,
        activePointMeasurement,
      }),
    [
      activePointMeasurement,
      hasActiveDistancePreviewAnchor,
      isDistanceCreatePreviewMode,
      livePreviewPointECEF,
    ]
  );
  const nextDistanceMeasureOrderToken = toAlphabeticSequence(
    nextDistanceMeasureOrder - 1
  );
  const activeDistancePreviewBadgeToken = activeDistancePreviewAnchorId
    ? pointMarkerBadgeByPointId[activeDistancePreviewAnchorId]?.text?.trim() ??
      ""
    : "";
  const activeDistancePreviewOrderToken =
    activeDistancePreviewBadgeToken.length > 0 &&
    fromAlphabeticSequence(activeDistancePreviewBadgeToken) !== null
      ? activeDistancePreviewBadgeToken
      : null;
  const distancePreviewOrder = hasDraftDistanceMeasurementAnchor
    ? activeDistancePreviewOrder ?? nextDistanceMeasureOrder
    : nextDistanceMeasureOrder;
  const distancePreviewOrderToken = hasDraftDistanceMeasurementAnchor
    ? activeDistancePreviewOrderToken ?? nextDistanceMeasureOrderToken
    : nextDistanceMeasureOrderToken;
  const currentDistanceBadgeToken = useMemo(
    () =>
      resolveCurrentDistanceBadgeToken({
        currentMeasurement,
        distanceRelations,
        activeDistancePreviewAnchorId,
        pointMarkerBadgeByPointId,
      }),
    [
      activeDistancePreviewAnchorId,
      currentMeasurement,
      distanceRelations,
      pointMarkerBadgeByPointId,
    ]
  );
  const currentDistanceMeasurementOrderDisplay =
    currentDistanceBadgeToken ||
    (currentDistanceMeasureOrder
      ? toAlphabeticSequence(currentDistanceMeasureOrder - 1)
      : null);
  const distanceNavigationInstructionText = isDistanceCreatePreviewMode
    ? hasActiveDistancePreviewAnchor
      ? "Klick auf den zweiten Punkt, um die Distanzmessung abzuschließen."
      : "Klick auf das Modell, um den ersten Punkt der Distanzmessung zu setzen."
    : null;

  return {
    isDistanceCreatePreviewMode,
    isCurrentPointDistanceMeasurement,
    hasActiveDistancePreviewAnchor,
    livePreviewDistanceRow,
    currentDistanceMeasureOrder,
    currentDistanceMeasurementOrderDisplay,
    distancePreviewOrder,
    distancePreviewOrderToken,
    distanceNavigationInstructionText,
  };
};
