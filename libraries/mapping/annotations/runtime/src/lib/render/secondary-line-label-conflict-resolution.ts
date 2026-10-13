import type { Rect } from "@carma-providers/label-overlay";
import type { CssPixelPosition } from "@carma-units";

import type { AnnotationLineLabelOptions } from "../config/annotation-line-label-options";
import {
  applySecondaryLineLabelPlacementStrategy,
  type SecondaryLineLabelPlacementCandidate,
} from "./secondary-line-label-placement";
import { measureLineLabelBoxes } from "./line-label-box";

export type SecondaryLineLabelConflictCandidate = {
  zIndex: number;
  annotationId: string;
  metricValueMeters: number;
} & SecondaryLineLabelPlacementCandidate;

type ConflictResolutionOptions = {
  candidates: readonly SecondaryLineLabelConflictCandidate[];
  occupiedLabelRects: Rect[];
  collisionResolutionStrategy: AnnotationLineLabelOptions["collision"]["resolutionStrategy"];
  anchorSlideStepRatio: number;
  maxAnchorSlideDeltaRatio: number;
  /** Client position of the labels' layer; read from each label's parent when omitted. */
  layerOrigin?: CssPixelPosition;
};

const byGlobalPriority = (
  left: SecondaryLineLabelConflictCandidate,
  right: SecondaryLineLabelConflictCandidate
) => right.zIndex - left.zIndex;

const bySameMeasurementPriority = (
  left: SecondaryLineLabelConflictCandidate,
  right: SecondaryLineLabelConflictCandidate
) =>
  left.metricValueMeters !== right.metricValueMeters
    ? right.metricValueMeters - left.metricValueMeters
    : byGlobalPriority(left, right);

const groupByAnnotationId = (
  candidates: readonly SecondaryLineLabelConflictCandidate[]
) => {
  const groups = new Map<string, SecondaryLineLabelConflictCandidate[]>();
  candidates.forEach((candidate) => {
    const group = groups.get(candidate.annotationId);
    if (group) {
      group.push(candidate);
    } else {
      groups.set(candidate.annotationId, [candidate]);
    }
  });
  return groups;
};

const resolveVisibleCandidatesWithinMeasurement = ({
  candidates,
  occupiedLabelRects,
  ...options
}: ConflictResolutionOptions) => {
  const visibleCandidates: SecondaryLineLabelConflictCandidate[] = [];
  const occupiedRectsWithinMeasurement = [...occupiedLabelRects];

  [...candidates].sort(bySameMeasurementPriority).forEach((candidate) => {
    const placementResult = applySecondaryLineLabelPlacementStrategy({
      ...options,
      candidate,
      occupiedLabelRects: occupiedRectsWithinMeasurement,
      allowEarlyRemoval: true,
    });

    if (placementResult.visible && placementResult.collisionRect) {
      occupiedRectsWithinMeasurement.push(placementResult.collisionRect);
      visibleCandidates.push(candidate);
    }
  });

  return visibleCandidates;
};

/** Places each measurement's labels against each other first, then the survivors of all measurements by z-index. */
export const reconcileSecondaryLineLabelVisibility = ({
  candidates,
  occupiedLabelRects,
  allowEarlyRemoval,
  ...options
}: ConflictResolutionOptions & { allowEarlyRemoval: boolean }) => {
  measureLineLabelBoxes(candidates);
  const globallyVisibleCandidates = [
    ...groupByAnnotationId(candidates).values(),
  ]
    .flatMap((measurementCandidates) =>
      resolveVisibleCandidatesWithinMeasurement({
        ...options,
        candidates: measurementCandidates,
        occupiedLabelRects,
      })
    )
    .sort(byGlobalPriority);

  globallyVisibleCandidates.forEach((candidate) => {
    const placementResult = applySecondaryLineLabelPlacementStrategy({
      ...options,
      candidate,
      occupiedLabelRects,
      allowEarlyRemoval,
    });

    if (placementResult.visible && placementResult.collisionRect) {
      occupiedLabelRects.push(placementResult.collisionRect);
    }
  });
};
