import type { Rect } from "@carma-providers/label-overlay";

import type { PreviewLineLabelVisualOptions } from "../config/preview-line-label-visual-defaults";
import {
  applySecondaryLineLabelPlacementStrategy,
  type SecondaryLineLabelPlacementCandidate,
} from "./secondary-line-label-placement";

export type SecondaryLineLabelConflictCandidate = {
  zIndex: number;
  measurementId: string;
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

const groupSecondaryLineLabelCandidatesByMeasurementId = (
  candidates: readonly SecondaryLineLabelConflictCandidate[]
) =>
  candidates.reduce<Map<string, SecondaryLineLabelConflictCandidate[]>>(
    (groupedCandidates, candidate) => {
      const measurementCandidates = groupedCandidates.get(
        candidate.measurementId
      );
      if (measurementCandidates) {
        measurementCandidates.push(candidate);
        return groupedCandidates;
      }

      groupedCandidates.set(candidate.measurementId, [candidate]);
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
  collisionResolutionStrategy: PreviewLineLabelVisualOptions["collisionResolutionStrategy"];
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
  collisionResolutionStrategy: PreviewLineLabelVisualOptions["collisionResolutionStrategy"];
  anchorSlideStepRatio: number;
  maxAnchorSlideDeltaRatio: number;
}) => {
  const globallyVisibleCandidates = [
    ...groupSecondaryLineLabelCandidatesByMeasurementId(candidates).values(),
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
