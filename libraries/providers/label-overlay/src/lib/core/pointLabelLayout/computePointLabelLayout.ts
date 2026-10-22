import { createPlacement, getPerspectiveStemAngleMagnitude } from "./config";
import { relaxPlacementWithForces } from "./forceDirectedPlacement";
import { shouldMountPointLabelAtAnchor } from "../pointLabelAnchorSemantics";
import { POINT_LABEL_ATTACH } from "../pointLabelAttach";
import {
  ANCHOR_LABEL_COLLISION_PADDING,
  LABEL_COLLISION_PADDING,
  createAnchorRect,
  createLabelRect,
  createStemSegment,
  getViewportOverflowPenalty,
  rectsIntersect,
  stemSegmentsIntersect,
} from "./geometry";
import type {
  CandidateEvaluation,
  LabelPlacement,
  LayoutPointInput,
  PointLabelLayoutConfig,
  PointLabelLayoutResult,
  Rect,
  StemSegment,
} from "./types";

type ComputePointLabelLayoutInput = {
  points: LayoutPointInput[];
  viewportWidth: number;
  viewportHeight: number;
  cameraPitch: number;
  config: PointLabelLayoutConfig;
};

type LayoutAccumulator = {
  placements: Record<string, LabelPlacement>;
  hiddenByLayout: Set<string>;
  collapsedToCompact: Set<string>;
  occupiedLabelRects: Rect[];
  occupiedStemSegments: StemSegment[];
};

type EvaluationContext = {
  anchor: LayoutPointInput["anchor"];
  occupiedLabelRects: Rect[];
  occupiedStemSegments: StemSegment[];
  otherAnchorRects: Rect[];
  viewportWidth: number;
  viewportHeight: number;
  avoidStemCrossing: boolean;
};

const resolveFixedPlacement = ({
  point,
  defaultPlacement,
  perspectiveStemAngle,
}: {
  point: LayoutPointInput;
  defaultPlacement: LabelPlacement | undefined;
  perspectiveStemAngle: number;
}): LabelPlacement | null => {
  if (shouldMountPointLabelAtAnchor({ anchorKind: point.anchorKind })) {
    return createPlacement(
      POINT_LABEL_ATTACH.CENTER,
      0,
      perspectiveStemAngle,
      `anchor-mounted:${point.id}`
    );
  }

  if (!point.lockPreferredPlacement || !defaultPlacement) {
    return null;
  }

  if (
    point.preferredAttach !== undefined ||
    point.preferredStemDistance !== undefined
  ) {
    return createPlacement(
      point.preferredAttach ?? defaultPlacement.attach,
      point.preferredStemDistance ?? defaultPlacement.distance,
      perspectiveStemAngle,
      `locked:${point.id}`
    );
  }

  return defaultPlacement;
};

const createRegularCandidates = (
  config: PointLabelLayoutConfig,
  perspectiveStemAngle: number
): LabelPlacement[] =>
  config.placementOrder.flatMap((attach) =>
    config.stemDistanceScaleOrder.map((distanceScale, distanceIndex) =>
      createPlacement(
        attach,
        config.stemDistance * distanceScale,
        perspectiveStemAngle,
        `${attach}:${distanceIndex}:${distanceScale.toFixed(3)}`
      )
    )
  );

const createStaticPlacements = ({
  points,
  defaultPlacement,
  perspectiveStemAngle,
}: {
  points: LayoutPointInput[];
  defaultPlacement: LabelPlacement | undefined;
  perspectiveStemAngle: number;
}): PointLabelLayoutResult => ({
  placements: Object.fromEntries(
    points.flatMap((point) => {
      const placement =
        resolveFixedPlacement({
          point,
          defaultPlacement,
          perspectiveStemAngle,
        }) ?? defaultPlacement;

      return placement ? ([[point.id, placement]] as const) : [];
    })
  ),
  hiddenByLayout: new Set<string>(),
  collapsedToCompact: new Set<string>(),
});

const applyFixedPlacement = (
  state: LayoutAccumulator,
  point: LayoutPointInput,
  placement: LabelPlacement
): LayoutAccumulator => ({
  ...state,
  placements: { ...state.placements, [point.id]: placement },
  occupiedLabelRects: [
    ...state.occupiedLabelRects,
    createLabelRect(point.anchor, point.text, placement),
  ],
  occupiedStemSegments: [
    ...state.occupiedStemSegments,
    createStemSegment(point.anchor, placement),
  ],
});

const applyEvaluation = (
  state: LayoutAccumulator,
  point: LayoutPointInput,
  evaluation: CandidateEvaluation,
  collapsed: boolean = false
): LayoutAccumulator => ({
  placements: { ...state.placements, [point.id]: evaluation.placement },
  hiddenByLayout: state.hiddenByLayout,
  collapsedToCompact: collapsed
    ? new Set(state.collapsedToCompact).add(point.id)
    : state.collapsedToCompact,
  occupiedLabelRects: [...state.occupiedLabelRects, evaluation.rect],
  occupiedStemSegments: [...state.occupiedStemSegments, evaluation.stemSegment],
});

const resolveCompactText = (point: LayoutPointInput): string | null => {
  const compactText = point.compactText?.trim() ?? "";
  return compactText && compactText !== point.text.trim() ? compactText : null;
};

const evaluatePlacement = (
  context: EvaluationContext,
  labelText: string,
  placement: LabelPlacement,
  orderIndex: number
): CandidateEvaluation => {
  const rect = createLabelRect(context.anchor, labelText, placement);
  const stemSegment = createStemSegment(context.anchor, placement);
  const intersectsLabel = context.occupiedLabelRects.some((occupiedRect) =>
    rectsIntersect(rect, occupiedRect, LABEL_COLLISION_PADDING)
  );
  const intersectsOtherAnchor = context.otherAnchorRects.some((anchorRect) =>
    rectsIntersect(rect, anchorRect, ANCHOR_LABEL_COLLISION_PADDING)
  );
  const crossesStem =
    context.avoidStemCrossing &&
    context.occupiedStemSegments.some((occupiedStemSegment) =>
      stemSegmentsIntersect(stemSegment, occupiedStemSegment)
    );
  const viewportPenalty = getViewportOverflowPenalty(
    rect,
    context.viewportWidth,
    context.viewportHeight
  );

  return {
    placement,
    rect,
    stemSegment,
    score:
      (intersectsLabel ? 10000 : 0) +
      (intersectsOtherAnchor ? 5000 : 0) +
      (crossesStem ? 7500 : 0) +
      viewportPenalty,
    orderIndex,
    intersectsLabel,
    intersectsOtherAnchor,
    crossesStem,
    viewportPenalty,
    collisionFree:
      !intersectsLabel &&
      !intersectsOtherAnchor &&
      !crossesStem &&
      viewportPenalty === 0,
  };
};

const sortByScoreThenOrder = (
  left: CandidateEvaluation,
  right: CandidateEvaluation
): number =>
  left.score !== right.score
    ? left.score - right.score
    : left.orderIndex - right.orderIndex;

const isOverlapFree = (evaluation: CandidateEvaluation): boolean =>
  !evaluation.intersectsLabel &&
  !evaluation.intersectsOtherAnchor &&
  !evaluation.crossesStem;

const isCollisionFree = (evaluation: CandidateEvaluation): boolean =>
  evaluation.collisionFree;

const pickBest = (
  evaluations: CandidateEvaluation[]
): CandidateEvaluation | undefined =>
  [...evaluations].sort(sortByScoreThenOrder)[0];

type CandidateEvaluations = {
  regular: CandidateEvaluation[];
  forced: CandidateEvaluation[];
};

const pickEvaluation = ({
  regular,
  forced,
}: CandidateEvaluations): CandidateEvaluation | undefined =>
  regular.find(isCollisionFree) ??
  regular.find(isOverlapFree) ??
  forced.find(isCollisionFree) ??
  forced.find(isOverlapFree);

const pickAnyEvaluation = ({
  regular,
  forced,
}: CandidateEvaluations): CandidateEvaluation | undefined =>
  pickBest([...regular, ...forced]);

const pickCompactBestEffortEvaluation = ({
  regular,
  forced,
}: CandidateEvaluations): CandidateEvaluation | undefined => {
  const nonCrossing = [...regular, ...forced].filter(
    (evaluation) => !evaluation.crossesStem
  );

  return (
    pickBest(
      nonCrossing.filter(
        (evaluation) =>
          !evaluation.intersectsOtherAnchor && evaluation.viewportPenalty === 0
      )
    ) ??
    pickBest(
      nonCrossing.filter((evaluation) => !evaluation.intersectsOtherAnchor)
    ) ??
    pickBest(nonCrossing)
  );
};

export const computePointLabelLayout = ({
  points,
  viewportWidth,
  viewportHeight,
  cameraPitch,
  config,
}: ComputePointLabelLayoutInput): PointLabelLayoutResult => {
  const perspectiveStemAngle = getPerspectiveStemAngleMagnitude(
    cameraPitch,
    config
  );
  const regularCandidates = createRegularCandidates(
    config,
    perspectiveStemAngle
  );
  const preferredPlacement = regularCandidates[0];

  const sortedPoints = [...points].sort(
    (left, right) =>
      (right.layoutPriority ?? 0) - (left.layoutPriority ?? 0) ||
      left.index - right.index
  );

  if (!config.dynamicLabelPlacement) {
    return createStaticPlacements({
      points: sortedPoints,
      defaultPlacement: preferredPlacement,
      perspectiveStemAngle,
    });
  }

  const { dynamicLabelPlacementConfig, allowEarlyRemoval } = config;
  const anchorRectsById = new Map(
    sortedPoints.map((point) => [point.id, createAnchorRect(point.anchor)])
  );

  const placePoint = (
    state: LayoutAccumulator,
    point: LayoutPointInput
  ): LayoutAccumulator => {
    const fixedPlacement = resolveFixedPlacement({
      point,
      defaultPlacement: preferredPlacement,
      perspectiveStemAngle,
    });
    if (fixedPlacement) {
      return applyFixedPlacement(state, point, fixedPlacement);
    }

    const context: EvaluationContext = {
      anchor: point.anchor,
      occupiedLabelRects: state.occupiedLabelRects,
      occupiedStemSegments: state.occupiedStemSegments,
      otherAnchorRects: sortedPoints
        .filter((candidate) => candidate.id !== point.id)
        .map((candidate) => anchorRectsById.get(candidate.id) as Rect),
      viewportWidth,
      viewportHeight,
      avoidStemCrossing: dynamicLabelPlacementConfig.avoidStemCrossing,
    };

    const evaluateCandidates = (labelText: string): CandidateEvaluations => {
      const regular = regularCandidates.map((placement, orderIndex) =>
        evaluatePlacement(context, labelText, placement, orderIndex)
      );
      const needsForced =
        dynamicLabelPlacementConfig.mode === "always" ||
        !regular.some(isCollisionFree);
      const forced = needsForced
        ? regularCandidates.map((placement, orderIndex) =>
            evaluatePlacement(
              context,
              labelText,
              relaxPlacementWithForces({
                anchor: point.anchor,
                labelText,
                basePlacement: placement,
                occupiedLabelRects: state.occupiedLabelRects,
                otherAnchorRects: context.otherAnchorRects,
                viewportWidth,
                viewportHeight,
                config: dynamicLabelPlacementConfig,
              }),
              orderIndex
            )
          )
        : [];
      return { regular, forced };
    };

    const candidates = evaluateCandidates(point.text);
    const selected = pickEvaluation(candidates);
    if (selected) {
      return applyEvaluation(state, point, selected);
    }

    const compactText = resolveCompactText(point);
    if (compactText) {
      const compactCandidates = evaluateCandidates(compactText);
      const compactEvaluation =
        pickEvaluation(compactCandidates) ??
        pickCompactBestEffortEvaluation(compactCandidates) ??
        (allowEarlyRemoval ? undefined : pickAnyEvaluation(compactCandidates));
      if (compactEvaluation) {
        return applyEvaluation(state, point, compactEvaluation, true);
      }
    }

    const fallback = allowEarlyRemoval
      ? undefined
      : pickAnyEvaluation(candidates);
    if (fallback) {
      return applyEvaluation(state, point, fallback);
    }

    return {
      ...state,
      hiddenByLayout: new Set(state.hiddenByLayout).add(point.id),
    };
  };

  const { placements, hiddenByLayout, collapsedToCompact } =
    sortedPoints.reduce<LayoutAccumulator>(placePoint, {
      placements: {},
      hiddenByLayout: new Set<string>(),
      collapsedToCompact: new Set<string>(),
      occupiedLabelRects: [],
      occupiedStemSegments: [],
    });

  return { placements, hiddenByLayout, collapsedToCompact };
};
