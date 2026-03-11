import type { Dispatch, SetStateAction } from "react";

import type {
  AnnotationCollection,
  AnnotationMode,
  DerivedPolylinePath,
  NodeChainAnnotation,
  PointAnnotationEntry,
  PointMeasurementEntry,
  PointDistanceRelation,
} from "@carma-mapping/annotations/core";

import { usePointVisibilityState } from "../usePointVisibilityState";
import { usePointLabelAnchorState } from "./label/usePointLabelAnchorState";
import { usePointLabelVisibilityState } from "./label/usePointLabelVisibilityState";
import { usePointMarkerBadgeState } from "./label/usePointMarkerBadgeState";
import { useStandaloneDistancePointState } from "./label/useStandaloneDistancePointState";
import { useSyncPointLabelAnchors } from "./label/useSyncPointLabelAnchors";
import { useLockedAnnotationIdSet } from "../../topology";

type UseAnnotationPointDisplayStateParams = {
  annotations: AnnotationCollection;
  pointEntries: PointAnnotationEntry[];
  pointMeasureEntries: PointMeasurementEntry[];
  nodeChainAnnotations: NodeChainAnnotation[];
  distanceRelations: PointDistanceRelation[];
  selectedAnnotationId: string | null;
  selectedAnnotationIds: string[];
  polylines: DerivedPolylinePath[];
  focusedNodeChainAnnotationId: string | null;
  unselectedClosedAreaNodeIdSet: ReadonlySet<string>;
  hideAnnotationsOfType: Set<AnnotationMode>;
  hideLabelsOfType: Set<AnnotationMode>;
  showLabels: boolean;
  setAnnotations: Dispatch<SetStateAction<AnnotationCollection>>;
};

export const useAnnotationPointDisplayState = ({
  annotations,
  pointEntries,
  pointMeasureEntries,
  nodeChainAnnotations,
  distanceRelations,
  selectedAnnotationId,
  selectedAnnotationIds,
  polylines,
  focusedNodeChainAnnotationId,
  unselectedClosedAreaNodeIdSet,
  hideAnnotationsOfType,
  hideLabelsOfType,
  showLabels,
  setAnnotations,
}: UseAnnotationPointDisplayStateParams) => {
  const { pointMarkerBadgeByPointId } = usePointMarkerBadgeState(
    pointEntries,
    pointMeasureEntries,
    nodeChainAnnotations,
    distanceRelations
  );

  const standaloneDistancePointState = useStandaloneDistancePointState(
    pointEntries,
    distanceRelations,
    selectedAnnotationId,
    selectedAnnotationIds
  );

  const desiredPointLabelAnchorById = usePointLabelAnchorState(
    pointEntries,
    polylines,
    focusedNodeChainAnnotationId,
    pointMarkerBadgeByPointId,
    standaloneDistancePointState
  );
  useSyncPointLabelAnchors(setAnnotations, desiredPointLabelAnchorById);

  const {
    collapsedPillPointIds,
    pointIdsWithoutLabelAnchor,
    labelAnchorPointIdsWithForcedVisibility,
  } = usePointLabelVisibilityState(pointEntries, unselectedClosedAreaNodeIdSet);

  const { showPoints, showPointLabels } = usePointVisibilityState(
    hideAnnotationsOfType,
    showLabels,
    hideLabelsOfType
  );

  const lockedMeasurementIdSet = useLockedAnnotationIdSet(annotations);

  return {
    pointMarkerBadgeByPointId,
    standaloneDistancePointState,
    collapsedPillPointIds,
    pointIdsWithoutLabelAnchor,
    labelAnchorPointIdsWithForcedVisibility,
    showPoints,
    showPointLabels,
    lockedMeasurementIdSet,
  };
};
