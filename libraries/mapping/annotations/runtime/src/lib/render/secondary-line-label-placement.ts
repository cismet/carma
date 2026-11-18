import { clamp } from "@carma-commons/math";
import {
  LABEL_COLLISION_PADDING,
  rectsIntersect,
  type Rect,
} from "@carma-providers/label-overlay";
import {
  clampUnitRangeRatio,
  type CssPixelPosition,
  type Ratio,
} from "@carma-units";

import {
  ANNOTATION_LINE_LABEL_COLLISION_RESOLUTION_STRATEGY,
  type AnnotationLineLabelCollisionResolutionStrategy,
} from "../config/annotation-line-label-options";
import {
  applyLineLabel,
  resolveLineLabelPlacement,
  writeLineLabelPlacementData,
} from "../interaction/authoring-line-label";
import {
  resolveAnnotationLineLabelTransform,
  type AnnotationLineLabelPlacement,
} from "../interaction/line-label-placement";
import {
  measureLineLabelBox,
  readLineLabelLayerOrigin,
  resolveLineLabelBoxRect,
} from "./line-label-box";

export type SecondaryLineLabelPlacementCandidate = {
  element: HTMLDivElement;
  text: string;
  start: CssPixelPosition;
  end: CssPixelPosition;
  outsideReferencePoint?: CssPixelPosition | null;
};

type SecondaryLineLabelPlacementResult = {
  visible: boolean;
  anchorRatio: Ratio | null;
  collisionCount: number;
  collisionRect: Rect | null;
};

type SecondaryLineLabelPlacementAttempt = {
  anchorRatio: Ratio;
  collisionRect: Rect;
  collisionCount: number;
  lastSolutionJumpPenalty: number;
  originalOffsetPenalty: number;
};

const secondaryLineLabelPlacementDefaults = Object.freeze({
  anchorRatio: 0.5 as Ratio,
  anchorRatioEpsilon: 1e-6,
  minAnchorSlideStepRatio: 0.01,
});

const resolveStoredLineLabelAnchorRatio = (element: HTMLDivElement) => {
  const parsedAnchorRatio = Number.parseFloat(
    element.dataset.annotationOverlayLineLabelAnchorRatio ?? ""
  );

  return Number.isFinite(parsedAnchorRatio)
    ? clampUnitRangeRatio(parsedAnchorRatio)
    : secondaryLineLabelPlacementDefaults.anchorRatio;
};

const resolveLineLabelAnchorRatios = ({
  element,
  collisionResolutionStrategy,
  stepRatio,
  maxDeltaRatio,
}: {
  element: HTMLDivElement;
  collisionResolutionStrategy: AnnotationLineLabelCollisionResolutionStrategy;
  stepRatio: number;
  maxDeltaRatio: number;
}) => {
  const clampedMaxDeltaRatio = Math.min(
    secondaryLineLabelPlacementDefaults.anchorRatio,
    clampUnitRangeRatio(maxDeltaRatio)
  ) as Ratio;
  const minAnchorRatio =
    secondaryLineLabelPlacementDefaults.anchorRatio - clampedMaxDeltaRatio;
  const maxAnchorRatio =
    secondaryLineLabelPlacementDefaults.anchorRatio + clampedMaxDeltaRatio;
  const lastResolvedAnchorRatio = clamp(
    resolveStoredLineLabelAnchorRatio(element),
    minAnchorRatio,
    maxAnchorRatio
  ) as Ratio;
  const candidateRatios = new Set<Ratio>([
    lastResolvedAnchorRatio,
    secondaryLineLabelPlacementDefaults.anchorRatio,
  ]);

  if (
    collisionResolutionStrategy !==
    ANNOTATION_LINE_LABEL_COLLISION_RESOLUTION_STRATEGY.MOVE_ON_LINE
  ) {
    return {
      lastResolvedAnchorRatio,
      anchorRatios: [...candidateRatios],
    };
  }

  const effectiveStepRatio = Math.max(
    stepRatio,
    secondaryLineLabelPlacementDefaults.minAnchorSlideStepRatio
  );
  for (
    let offsetRatio = effectiveStepRatio;
    offsetRatio <=
    clampedMaxDeltaRatio +
      secondaryLineLabelPlacementDefaults.anchorRatioEpsilon;
    offsetRatio += effectiveStepRatio
  ) {
    candidateRatios.add(
      Math.max(
        minAnchorRatio,
        secondaryLineLabelPlacementDefaults.anchorRatio - offsetRatio
      ) as Ratio
    );
    candidateRatios.add(
      Math.min(
        maxAnchorRatio,
        secondaryLineLabelPlacementDefaults.anchorRatio + offsetRatio
      ) as Ratio
    );
  }

  return {
    lastResolvedAnchorRatio,
    anchorRatios: [...candidateRatios].sort((left, right) => {
      const leftLastSolutionDelta = Math.abs(left - lastResolvedAnchorRatio);
      const rightLastSolutionDelta = Math.abs(right - lastResolvedAnchorRatio);
      if (leftLastSolutionDelta !== rightLastSolutionDelta) {
        return leftLastSolutionDelta - rightLastSolutionDelta;
      }

      return (
        Math.abs(left - secondaryLineLabelPlacementDefaults.anchorRatio) -
        Math.abs(right - secondaryLineLabelPlacementDefaults.anchorRatio)
      );
    }),
  };
};

const resolveCandidatePlacement = (
  candidate: SecondaryLineLabelPlacementCandidate,
  anchorRatio: Ratio,
  previousShouldFlip: boolean
) =>
  resolveLineLabelPlacement({
    element: candidate.element,
    start: candidate.start,
    end: candidate.end,
    outsideReferencePoint: candidate.outsideReferencePoint,
    anchorRatio,
    previousShouldFlip,
  });

const toPlacementAttempt = (
  anchorRatio: Ratio,
  collisionRect: Rect,
  occupiedLabelRects: Rect[],
  lastResolvedAnchorRatio: Ratio
): SecondaryLineLabelPlacementAttempt => ({
  anchorRatio,
  collisionRect,
  collisionCount: occupiedLabelRects.reduce(
    (count, occupiedRect) =>
      rectsIntersect(collisionRect, occupiedRect, LABEL_COLLISION_PADDING)
        ? count + 1
        : count,
    0
  ),
  lastSolutionJumpPenalty: Math.abs(anchorRatio - lastResolvedAnchorRatio),
  originalOffsetPenalty: Math.abs(
    anchorRatio - secondaryLineLabelPlacementDefaults.anchorRatio
  ),
});

const isBetterSecondaryLineLabelPlacementAttempt = (
  placementAttempt: SecondaryLineLabelPlacementAttempt,
  bestAttempt: SecondaryLineLabelPlacementAttempt | null
) => {
  if (!bestAttempt) {
    return true;
  }

  if (placementAttempt.collisionCount !== bestAttempt.collisionCount) {
    return placementAttempt.collisionCount < bestAttempt.collisionCount;
  }

  if (placementAttempt.collisionCount === 0) {
    if (
      placementAttempt.originalOffsetPenalty !==
      bestAttempt.originalOffsetPenalty
    ) {
      return (
        placementAttempt.originalOffsetPenalty <
        bestAttempt.originalOffsetPenalty
      );
    }

    return (
      placementAttempt.lastSolutionJumpPenalty <
      bestAttempt.lastSolutionJumpPenalty
    );
  }

  if (
    placementAttempt.lastSolutionJumpPenalty !==
    bestAttempt.lastSolutionJumpPenalty
  ) {
    return (
      placementAttempt.lastSolutionJumpPenalty <
      bestAttempt.lastSolutionJumpPenalty
    );
  }

  return (
    placementAttempt.originalOffsetPenalty < bestAttempt.originalOffsetPenalty
  );
};

/**
 * Tries the anchor ratios on the label's line and shows the label at the best
 * one, or hides it. The candidate boxes are computed from one measurement of
 * the label per text (see `measureLineLabelBox`), so a pass reads no layout;
 * the outcome, including the side hysteresis carried from one tried ratio to
 * the next and the state left on the element, is that of applying each ratio
 * to the element and reading back its box.
 */
export const applySecondaryLineLabelPlacementStrategy = ({
  candidate,
  occupiedLabelRects,
  allowEarlyRemoval,
  collisionResolutionStrategy,
  anchorSlideStepRatio,
  maxAnchorSlideDeltaRatio,
  layerOrigin,
}: {
  candidate: SecondaryLineLabelPlacementCandidate;
  occupiedLabelRects: Rect[];
  allowEarlyRemoval: boolean;
  collisionResolutionStrategy: AnnotationLineLabelCollisionResolutionStrategy;
  anchorSlideStepRatio: number;
  maxAnchorSlideDeltaRatio: number;
  /** Client position of the labels' layer; read from the label's parent when omitted. */
  layerOrigin?: CssPixelPosition;
}): SecondaryLineLabelPlacementResult => {
  const { element, text } = candidate;
  let bestAttempt: SecondaryLineLabelPlacementAttempt | null = null;
  const { lastResolvedAnchorRatio, anchorRatios } =
    resolveLineLabelAnchorRatios({
      element,
      collisionResolutionStrategy,
      stepRatio: anchorSlideStepRatio,
      maxDeltaRatio: maxAnchorSlideDeltaRatio,
    });
  const box = measureLineLabelBox(element, text);
  const origin = layerOrigin ?? readLineLabelLayerOrigin(element);
  let shouldFlip = element.dataset.annotationOverlayLineLabelNormalFlip === "1";
  let lastPlacement: AnnotationLineLabelPlacement | null = null;

  for (const anchorRatio of anchorRatios) {
    const placement = resolveCandidatePlacement(
      candidate,
      anchorRatio,
      shouldFlip
    );
    if (!placement) {
      continue;
    }
    lastPlacement = placement;
    shouldFlip = placement.shouldFlip;
    if (!box) {
      continue;
    }

    const placementAttempt = toPlacementAttempt(
      anchorRatio,
      resolveLineLabelBoxRect(placement, box, origin),
      occupiedLabelRects,
      lastResolvedAnchorRatio
    );
    if (
      isBetterSecondaryLineLabelPlacementAttempt(placementAttempt, bestAttempt)
    ) {
      bestAttempt = placementAttempt;
    }
  }

  if (lastPlacement) {
    writeLineLabelPlacementData(element, text, lastPlacement);
    element.style.transform =
      resolveAnnotationLineLabelTransform(lastPlacement);
  }

  if (bestAttempt && (bestAttempt.collisionCount === 0 || !allowEarlyRemoval)) {
    applyLineLabel({
      element,
      text,
      start: candidate.start,
      end: candidate.end,
      outsideReferencePoint: candidate.outsideReferencePoint,
      anchorRatio: bestAttempt.anchorRatio,
    });

    return {
      visible: true,
      anchorRatio: bestAttempt.anchorRatio,
      collisionCount: bestAttempt.collisionCount,
      collisionRect: bestAttempt.collisionRect,
    };
  }

  element.style.display = "none";

  return {
    visible: false,
    anchorRatio: bestAttempt?.anchorRatio ?? null,
    collisionCount: bestAttempt?.collisionCount ?? 0,
    collisionRect: null,
  };
};
