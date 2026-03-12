import { useEffect, useMemo, type Dispatch, type SetStateAction } from "react";

import {
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_POINT,
  AnnotationCollection,
  AnnotationLabelAnchor,
  AnnotationMode,
  NodeChainAnnotation,
  PointAnnotationEntry,
  PointDistanceRelation,
  PointMeasurementEntry,
  applyDesiredPointLabelAnchors,
  buildOrderByIdFromEntryOrder,
  buildDesiredPointLabelAnchorById,
  buildStandaloneDistancePointSets,
  collectCollapsedPillPointIds,
  collectLabelAnchorPointIdsWithForcedVisibility,
  collectPointIdsWithoutSelfLabelAnchor,
  isPointAnnotationEntry,
} from "@carma-mapping/annotations/core";

import { useLockedAnnotationIdSet } from "../../annotation-entries/hooks/useLockedAnnotationIdSet";
import {
  usePointMarkerBadges,
  type AnnotationPointMarkerBadge,
  type NodeChainBadgeKind,
} from "../point/usePointMarkerBadges";

export const isPointVisibleForRendering = (
  annotation: PointAnnotationEntry,
  hideMeasurementsOfType: ReadonlySet<AnnotationMode>,
  hideLabelsOfType: ReadonlySet<AnnotationMode>,
  showLabels: boolean
) => {
  if (annotation.hidden) {
    return false;
  }

  if (annotation.auxiliaryLabelAnchor) {
    return showLabels && !hideLabelsOfType.has(ANNOTATION_TYPE_POINT);
  }

  return !hideMeasurementsOfType.has(annotation.type);
};

const derivePointVisibility = (
  visiblePointEntries: readonly PointAnnotationEntry[],
  showLabels: boolean,
  hidePointLabels: boolean
) => {
  const showPoints = visiblePointEntries.length > 0;
  const showPointLabels = showPoints && showLabels && !hidePointLabels;

  return {
    showPoints,
    showPointLabels,
  };
};

const deriveStandaloneDistancePointState = (
  pointEntries: readonly PointAnnotationEntry[],
  distanceRelations: readonly PointDistanceRelation[],
  selectedAnnotationId: string | null,
  selectedAnnotationIds: readonly string[]
) => {
  const selectedPointIdSet = new Set<string>(selectedAnnotationIds);
  if (selectedAnnotationId) {
    selectedPointIdSet.add(selectedAnnotationId);
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
    unfocusedStandaloneDistanceNonHighestPointIds: unfocusedNonHighestPointIds,
    focusedStandaloneDistanceNonHighestPointIds: focusedNonHighestPointIds,
  } as const;
};

type StandaloneDistancePointState = ReturnType<
  typeof deriveStandaloneDistancePointState
>;

const derivePointLabelAnchors = (
  pointEntries: readonly PointAnnotationEntry[],
  nodeChainAnnotations: readonly NodeChainAnnotation[],
  focusedNodeChainAnnotationId: string | null,
  pointMarkerBadgeByPointId: Readonly<
    Record<string, AnnotationPointMarkerBadge>
  >,
  standaloneDistancePointState: StandaloneDistancePointState
) =>
  buildDesiredPointLabelAnchorById({
    pointMeasurements: pointEntries,
    nodeChains: nodeChainAnnotations,
    focusedNodeChainAnnotationId,
    pointMarkerBadgeByPointId,
    standaloneDistanceHighestPointIds:
      standaloneDistancePointState.standaloneDistanceHighestPointIds,
    unfocusedStandaloneDistanceNonHighestPointIds:
      standaloneDistancePointState.unfocusedStandaloneDistanceNonHighestPointIds,
    focusedStandaloneDistanceNonHighestPointIds:
      standaloneDistancePointState.focusedStandaloneDistanceNonHighestPointIds,
  });

const applyPointLabelAnchors = (
  annotations: AnnotationCollection,
  desiredLabelAnchorByPointId: Readonly<
    Record<string, AnnotationLabelAnchor | undefined>
  >
): AnnotationCollection => {
  const { nextMeasurements, hasChanges } = applyDesiredPointLabelAnchors({
    annotations,
    desiredLabelAnchorByPointId,
    isPointMeasurement: isPointAnnotationEntry,
  });

  return hasChanges ? nextMeasurements : annotations;
};

type UsePointBridgeParams = {
  annotations: AnnotationCollection;
  pointEntries: PointAnnotationEntry[];
  visiblePointEntries: PointAnnotationEntry[];
  pointMeasurementEntries: PointMeasurementEntry[];
  nodeChainAnnotations: NodeChainAnnotation[];
  distanceRelations: PointDistanceRelation[];
  selectedAnnotationId: string | null;
  selectedAnnotationIds: string[];
  focusedNodeChainAnnotationId: string | null;
  unselectedClosedAreaNodeIdSet: ReadonlySet<string>;
  showLabels: boolean;
  hidePointLabels: boolean;
  setAnnotations: Dispatch<SetStateAction<AnnotationCollection>>;
};

export const usePointBridge = ({
  annotations,
  pointEntries,
  visiblePointEntries,
  pointMeasurementEntries,
  nodeChainAnnotations,
  distanceRelations,
  selectedAnnotationId,
  selectedAnnotationIds,
  focusedNodeChainAnnotationId,
  unselectedClosedAreaNodeIdSet,
  showLabels,
  hidePointLabels,
  setAnnotations,
}: UsePointBridgeParams) => {
  const pointMeasureOrderById = useMemo(
    () =>
      buildOrderByIdFromEntryOrder(
        pointMeasurementEntries.filter(
          (measurement) => !measurement.auxiliaryLabelAnchor
        )
      ),
    [pointMeasurementEntries]
  );
  const distanceDisplayRelations = useMemo(() => {
    const distanceGroupIdSet = new Set(
      nodeChainAnnotations
        .filter((group) => group.type === ANNOTATION_TYPE_DISTANCE)
        .map((group) => group.id)
    );
    if (distanceGroupIdSet.size === 0) {
      return distanceRelations;
    }

    return distanceRelations.map((relation) =>
      relation.polygonGroupId && distanceGroupIdSet.has(relation.polygonGroupId)
        ? { ...relation, polygonGroupId: undefined }
        : relation
    );
  }, [distanceRelations, nodeChainAnnotations]);
  const badgeNodeChains = useMemo(
    () =>
      nodeChainAnnotations.filter(
        (group): group is NodeChainAnnotation & { type: NodeChainBadgeKind } =>
          group.type !== ANNOTATION_TYPE_DISTANCE
      ),
    [nodeChainAnnotations]
  );
  const pointMarkerBadgeByPointId = usePointMarkerBadges(
    pointEntries,
    badgeNodeChains,
    distanceDisplayRelations,
    pointMeasureOrderById
  );

  const standaloneDistancePointState = useMemo(
    () =>
      deriveStandaloneDistancePointState(
        pointEntries,
        distanceDisplayRelations,
        selectedAnnotationId,
        selectedAnnotationIds
      ),
    [
      distanceDisplayRelations,
      pointEntries,
      selectedAnnotationId,
      selectedAnnotationIds,
    ]
  );

  const desiredPointLabelAnchorById = useMemo(
    () =>
      derivePointLabelAnchors(
        pointEntries,
        nodeChainAnnotations,
        focusedNodeChainAnnotationId,
        pointMarkerBadgeByPointId,
        standaloneDistancePointState
      ),
    [
      focusedNodeChainAnnotationId,
      nodeChainAnnotations,
      pointEntries,
      pointMarkerBadgeByPointId,
      standaloneDistancePointState,
    ]
  );
  useEffect(() => {
    setAnnotations((previousAnnotations) =>
      applyPointLabelAnchors(previousAnnotations, desiredPointLabelAnchorById)
    );
  }, [desiredPointLabelAnchorById, setAnnotations]);

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
        unselectedClosedAreaNodeIdSet
      ),
    [pointEntries, unselectedClosedAreaNodeIdSet]
  );

  const { showPoints, showPointLabels } = derivePointVisibility(
    visiblePointEntries,
    showLabels,
    hidePointLabels
  );

  const lockedAnnotationIdSet = useLockedAnnotationIdSet(annotations);

  return {
    pointMarkerBadgeByPointId,
    standaloneDistancePointState,
    collapsedPillPointIds,
    pointIdsWithoutLabelAnchor,
    labelAnchorPointIdsWithForcedVisibility,
    showPoints,
    showPointLabels,
    lockedAnnotationIdSet,
  };
};
