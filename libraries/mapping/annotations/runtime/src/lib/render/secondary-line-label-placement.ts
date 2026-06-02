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
import { applyLineLabel } from "../interaction/authoring-visual-runtime";

export type SecondaryLineLabelPlacementCandidate = {
  element: HTMLDivElement;
  text: string;
  start: CssPixelPosition;
  end: CssPixelPosition;
  outsideReferencePoint?: CssPixelPosition | null;
  flipReadingDirection?: boolean;
};

export type SecondaryLineLabelPlacementResult = {
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

const clampLineLabelAnchorRatio = (value: number): Ratio =>
  clampUnitRangeRatio(value);

const resolveAnnotationLineLabelCollisionRect = (
  element: HTMLDivElement
): Rect | null => {
  if (element.style.display === "none") {
    return null;
  }

  const textElement = element.querySelector(
    '[data-annotation-overlay-line-label-text="true"]'
  ) as HTMLElement | null;
  const targetElement = textElement ?? element;
  const rect = targetElement.getBoundingClientRect();

  return rect.width > 0 && rect.height > 0
    ? {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      }
    : null;
};

const resolveStoredLineLabelAnchorRatio = (element: HTMLDivElement) => {
  const parsedAnchorRatio = Number.parseFloat(
    element.dataset.annotationOverlayLineLabelAnchorRatio ?? ""
  );

  return Number.isFinite(parsedAnchorRatio)
    ? clampLineLabelAnchorRatio(parsedAnchorRatio)
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
  const lastResolvedAnchorRatio = Math.min(
    maxAnchorRatio,
    Math.max(minAnchorRatio, resolveStoredLineLabelAnchorRatio(element))
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

const applySecondaryLineLabelCandidatePlacement = ({
  candidate,
  anchorRatio,
  occupiedLabelRects,
  lastResolvedAnchorRatio,
}: {
  candidate: SecondaryLineLabelPlacementCandidate;
  anchorRatio: Ratio;
  occupiedLabelRects: Rect[];
  lastResolvedAnchorRatio: Ratio;
}): SecondaryLineLabelPlacementAttempt | null => {
  applyLineLabel({
    element: candidate.element,
    text: candidate.text,
    start: candidate.start,
    end: candidate.end,
    outsideReferencePoint: candidate.outsideReferencePoint,
    flipReadingDirection: candidate.flipReadingDirection,
    anchorRatio,
  });

  const collisionRect = resolveAnnotationLineLabelCollisionRect(candidate.element);
  if (!collisionRect) {
    return null;
  }

  return {
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
  };
};

export const applySecondaryLineLabelPlacementStrategy = ({
  candidate,
  occupiedLabelRects,
  allowEarlyRemoval,
  collisionResolutionStrategy,
  anchorSlideStepRatio,
  maxAnchorSlideDeltaRatio,
}: {
  candidate: SecondaryLineLabelPlacementCandidate;
  occupiedLabelRects: Rect[];
  allowEarlyRemoval: boolean;
  collisionResolutionStrategy: AnnotationLineLabelCollisionResolutionStrategy;
  anchorSlideStepRatio: number;
  maxAnchorSlideDeltaRatio: number;
}): SecondaryLineLabelPlacementResult => {
  let bestAttempt: SecondaryLineLabelPlacementAttempt | null = null;
  const { lastResolvedAnchorRatio, anchorRatios } =
    resolveLineLabelAnchorRatios({
      element: candidate.element,
      collisionResolutionStrategy,
      stepRatio: anchorSlideStepRatio,
      maxDeltaRatio: maxAnchorSlideDeltaRatio,
    });

  for (const anchorRatio of anchorRatios) {
    const placementAttempt = applySecondaryLineLabelCandidatePlacement({
      candidate,
      anchorRatio,
      occupiedLabelRects,
      lastResolvedAnchorRatio,
    });
    if (!placementAttempt) {
      continue;
    }

    if (placementAttempt.collisionCount === 0) {
      return {
        visible: true,
        anchorRatio: placementAttempt.anchorRatio,
        collisionCount: 0,
        collisionRect: placementAttempt.collisionRect,
      };
    }

    if (
      !bestAttempt ||
      placementAttempt.collisionCount < bestAttempt.collisionCount ||
      (placementAttempt.collisionCount === bestAttempt.collisionCount &&
        placementAttempt.lastSolutionJumpPenalty <
          bestAttempt.lastSolutionJumpPenalty) ||
      (placementAttempt.collisionCount === bestAttempt.collisionCount &&
        placementAttempt.lastSolutionJumpPenalty ===
          bestAttempt.lastSolutionJumpPenalty &&
        placementAttempt.originalOffsetPenalty <
          bestAttempt.originalOffsetPenalty)
    ) {
      bestAttempt = placementAttempt;
    }
  }

  if (!allowEarlyRemoval && bestAttempt) {
    applyLineLabel({
      element: candidate.element,
      text: candidate.text,
      start: candidate.start,
      end: candidate.end,
      outsideReferencePoint: candidate.outsideReferencePoint,
      flipReadingDirection: candidate.flipReadingDirection,
      anchorRatio: bestAttempt.anchorRatio,
    });

    return {
      visible: true,
      anchorRatio: bestAttempt.anchorRatio,
      collisionCount: bestAttempt.collisionCount,
      collisionRect: bestAttempt.collisionRect,
    };
  }

  candidate.element.style.display = "none";

  return {
    visible: false,
    anchorRatio: bestAttempt?.anchorRatio ?? null,
    collisionCount: bestAttempt?.collisionCount ?? 0,
    collisionRect: null,
  };
};
