import type { Rect } from "@carma-providers/label-overlay";

import type { AnnotationLineLabelOptions } from "../config/annotation-line-label-options";
import {
  applySecondaryLineLabelPlacementStrategy,
  type SecondaryLineLabelPlacementCandidate,
} from "./secondary-line-label-placement";

export type SecondaryLineLabelConflictCandidate = {
  zIndex: number;
  annotationId: string;
  metricValueMeters: number;
} & SecondaryLineLabelPlacementCandidate;

const sortSecondaryLineLabelCandidatesByGlobalPriority = (
  left: SecondaryLineLabelConflictCandidate,
  right: SecondaryLineLabelConflictCandidate
) => right.zIndex - left.zIndex;

const sortSecondaryLineLabelCandidatesBySameMeasurementPriority = (
  left: SecondaryLineLabelConflictCandidate,
  right: SecondaryLineLabelConflictCandidate
) => {
  if (left.metricValueMeters !== right.metricValueMeters) {
    return right.metricValueMeters - left.metricValueMeters;
  }

  return sortSecondaryLineLabelCandidatesByGlobalPriority(left, right);
};

const groupSecondaryLineLabelCandidatesByAnnotationId = (
  candidates: readonly SecondaryLineLabelConflictCandidate[]
) =>
  candidates.reduce<Map<string, SecondaryLineLabelConflictCandidate[]>>(
    (groupedCandidates, candidate) => {
      const measurementCandidates = groupedCandidates.get(
        candidate.annotationId
      );
      if (measurementCandidates) {
        measurementCandidates.push(candidate);
        return groupedCandidates;
      }

      groupedCandidates.set(candidate.annotationId, [candidate]);
      return groupedCandidates;
    },
    new Map()
  );

const resolveVisibleSecondaryLineLabelCandidatesWithinMeasurement = ({
  candidates,
  occupiedLabelRects,
  collisionResolutionStrategy,
  anchorSlideStepRatio,
  maxAnchorSlideDeltaRatio,
}: {
  candidates: readonly SecondaryLineLabelConflictCandidate[];
  occupiedLabelRects: Rect[];
  collisionResolutionStrategy: AnnotationLineLabelOptions["collision"]["resolutionStrategy"];
  anchorSlideStepRatio: number;
  maxAnchorSlideDeltaRatio: number;
}) => {
  const visibleCandidates: SecondaryLineLabelConflictCandidate[] = [];
  const occupiedRectsWithinMeasurement = [...occupiedLabelRects];

  [...candidates]
    .sort(sortSecondaryLineLabelCandidatesBySameMeasurementPriority)
    .forEach((candidate) => {
      const placementResult = applySecondaryLineLabelPlacementStrategy({
        candidate,
        occupiedLabelRects: occupiedRectsWithinMeasurement,
        allowEarlyRemoval: true,
        collisionResolutionStrategy,
        anchorSlideStepRatio,
        maxAnchorSlideDeltaRatio,
      });

      if (!placementResult.visible || !placementResult.collisionRect) {
        return;
      }

      occupiedRectsWithinMeasurement.push(placementResult.collisionRect);
      visibleCandidates.push(candidate);
    });

  return visibleCandidates;
};

export const reconcileSecondaryLineLabelVisibility = ({
  candidates,
  occupiedLabelRects,
  allowEarlyRemoval,
  collisionResolutionStrategy,
  anchorSlideStepRatio,
  maxAnchorSlideDeltaRatio,
}: {
  candidates: readonly SecondaryLineLabelConflictCandidate[];
  occupiedLabelRects: Rect[];
  allowEarlyRemoval: boolean;
  collisionResolutionStrategy: AnnotationLineLabelOptions["collision"]["resolutionStrategy"];
  anchorSlideStepRatio: number;
  maxAnchorSlideDeltaRatio: number;
}) => {
  const globallyVisibleCandidates = [
    ...groupSecondaryLineLabelCandidatesByAnnotationId(candidates).values(),
  ]
    .flatMap((measurementCandidates) =>
      resolveVisibleSecondaryLineLabelCandidatesWithinMeasurement({
        candidates: measurementCandidates,
        occupiedLabelRects,
        collisionResolutionStrategy,
        anchorSlideStepRatio,
        maxAnchorSlideDeltaRatio,
      })
    )
    .sort(sortSecondaryLineLabelCandidatesByGlobalPriority);

  globallyVisibleCandidates.forEach((candidate) => {
    const placementResult = applySecondaryLineLabelPlacementStrategy({
      candidate,
      occupiedLabelRects,
      allowEarlyRemoval,
      collisionResolutionStrategy,
      anchorSlideStepRatio,
      maxAnchorSlideDeltaRatio,
    });

    if (placementResult.visible && placementResult.collisionRect) {
      occupiedLabelRects.push(placementResult.collisionRect);
    }
  });
};
