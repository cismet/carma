import { useEffect, useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";

import {
  applyDesiredPointLabelAnchors,
  buildDesiredPointLabelAnchorById,
  buildStandaloneDistancePointSets,
  collectCollapsedPillPointIds,
  collectLabelAnchorPointIdsWithForcedVisibility,
  collectPointIdsWithoutSelfLabelAnchor,
  formatNumber,
  isPointAnnotationEntry,
  useAnnotationPointMarkerBadges,
  type AnnotationCollection,
  type AnnotationPointMarkerBadge,
  type PlanarGroupBadgeKind,
  type PlanarPolygonGroup,
  type PointAnnotationEntry,
  type PointDistanceRelation,
  type PointMeasurementEntry,
} from "@carma-mapping/annotations/core";

import type { DerivedPolylinePath } from "../types/derivedPolylinePath";

const resolvePlanarGroupBadgeKind = (
  group: PlanarPolygonGroup
): PlanarGroupBadgeKind => group.measurementKind;

type UsePointLabelDisplayStateParams = {
  pointEntries: ReadonlyArray<PointAnnotationEntry>;
  pointMeasureEntries: ReadonlyArray<PointMeasurementEntry>;
  setAnnotations: Dispatch<SetStateAction<AnnotationCollection>>;
  planarPolygonGroups: readonly PlanarPolygonGroup[];
  distanceRelations: readonly PointDistanceRelation[];
  polylines: readonly DerivedPolylinePath[];
  focusedPlanarPolygonGroupId: string | null;
  selectedMeasurementId: string | null;
  selectedMeasurementIds: readonly string[];
  unselectedClosedAreaVertexPointIdSet: ReadonlySet<string>;
};

export const usePointLabelDisplayState = ({
  pointEntries,
  pointMeasureEntries,
  setAnnotations,
  planarPolygonGroups,
  distanceRelations,
  polylines,
  focusedPlanarPolygonGroupId,
  selectedMeasurementId,
  selectedMeasurementIds,
  unselectedClosedAreaVertexPointIdSet,
}: UsePointLabelDisplayStateParams) => {
  const pointMeasureOrderById = useMemo(
    () =>
      pointMeasureEntries
        .filter((measurement) => !measurement.auxiliaryLabelAnchor)
        .reduce<Record<string, number>>((orderById, measurement, index) => {
          orderById[measurement.id] = index + 1;
          return orderById;
        }, {}),
    [pointMeasureEntries]
  );

  const pointMarkerBadgeByPointId = useAnnotationPointMarkerBadges({
    pointEntries,
    planarPolygonGroups,
    distanceRelations,
    pointMeasureOrderById,
    resolvePlanarGroupBadgeKind,
    isPointAutoCorner: (point) => Boolean(point.isFacadeAutoCorner),
  });

  const {
    standaloneDistanceHighestPointIds,
    unfocusedStandaloneDistanceNonHighestPointIds,
    focusedStandaloneDistanceNonHighestPointIds,
  } = useMemo(() => {
    const selectedPointIdSet = new Set<string>(selectedMeasurementIds);
    if (selectedMeasurementId) {
      selectedPointIdSet.add(selectedMeasurementId);
    }

    const {
      highestPointIds,
      unfocusedNonHighestPointIds,
      focusedNonHighestPointIds,
    } = buildStandaloneDistancePointSets({
      pointMeasurements: pointEntries,
      distanceRelations,
      selectedPointIds: selectedPointIdSet,
    });

    return {
      standaloneDistanceHighestPointIds: highestPointIds,
      unfocusedStandaloneDistanceNonHighestPointIds:
        unfocusedNonHighestPointIds,
      focusedStandaloneDistanceNonHighestPointIds: focusedNonHighestPointIds,
    };
  }, [
    distanceRelations,
    pointEntries,
    selectedMeasurementId,
    selectedMeasurementIds,
  ]);

  const desiredLabelAnchorByPointId = useMemo(
    () =>
      buildDesiredPointLabelAnchorById({
        pointMeasurements: pointEntries,
        polylines,
        focusedPlanarPolygonGroupId,
        pointMarkerBadgeByPointId,
        standaloneDistanceHighestPointIds,
        unfocusedStandaloneDistanceNonHighestPointIds,
        focusedStandaloneDistanceNonHighestPointIds,
        formatDistanceLabel: formatNumber,
      }),
    [
      focusedPlanarPolygonGroupId,
      focusedStandaloneDistanceNonHighestPointIds,
      pointEntries,
      pointMarkerBadgeByPointId,
      polylines,
      standaloneDistanceHighestPointIds,
      unfocusedStandaloneDistanceNonHighestPointIds,
    ]
  );

  useEffect(() => {
    setAnnotations((prev) => {
      const { nextMeasurements, hasChanges } = applyDesiredPointLabelAnchors({
        annotations: prev,
        desiredLabelAnchorByPointId,
        isPointMeasurement: isPointAnnotationEntry,
      });
      return hasChanges ? nextMeasurements : prev;
    });
  }, [desiredLabelAnchorByPointId, setAnnotations]);

  const collapsedPillPointIds = useMemo(
    () => collectCollapsedPillPointIds(pointEntries),
    [pointEntries]
  );
  const pointIdsWithoutLabelAnchor = useMemo(
    () => collectPointIdsWithoutSelfLabelAnchor(pointEntries),
    [pointEntries]
  );
  const labelAnchorPointIdsWithForcedVisibility = useMemo(
    () =>
      collectLabelAnchorPointIdsWithForcedVisibility(
        pointEntries,
        unselectedClosedAreaVertexPointIdSet
      ),
    [pointEntries, unselectedClosedAreaVertexPointIdSet]
  );

  return {
    pointMarkerBadgeByPointId,
    standaloneDistanceVisibilityState: {
      unfocusedNonHighestPointIds:
        unfocusedStandaloneDistanceNonHighestPointIds,
      focusedNonHighestPointIds: focusedStandaloneDistanceNonHighestPointIds,
    },
    labelState: {
      collapsedPillPointIds,
      pointIdsWithoutLabelAnchor,
      labelAnchorPointIdsWithForcedVisibility,
    },
  } as const;
};
