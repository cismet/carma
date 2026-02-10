import { createPlacement, getPerspectiveStemAngleMagnitude } from "./config";
import { relaxPlacementWithForces } from "./forceDirectedPlacement";
import {
  ANCHOR_LABEL_COLLISION_PADDING,
  LABEL_COLLISION_PADDING,
  createAnchorRect,
  createLabelRect,
  getViewportOverflowPenalty,
  rectsIntersect,
} from "./geometry";
import type {
  CandidateEvaluation,
  LayoutPointInput,
  PointLabelLayoutConfig,
  PointLabelLayoutResult,
  Rect,
} from "./types";

type EvaluatePlacementInput = {
  anchor: LayoutPointInput["anchor"];
  labelText: string;
  placement: CandidateEvaluation["placement"];
  orderIndex: number;
  occupiedLabelRects: Rect[];
  otherAnchorRects: Rect[];
  viewportWidth: number;
  viewportHeight: number;
};

type ComputePointLabelLayoutInput = {
  points: LayoutPointInput[];
  viewportWidth: number;
  viewportHeight: number;
  cameraPitch: number;
  config: PointLabelLayoutConfig;
};

type LayoutAccumulator = {
  placements: Record<string, CandidateEvaluation["placement"]>;
  hiddenByLayout: Set<string>;
  occupiedLabelRects: Rect[];
};

const createStaticPlacements = (
  points: LayoutPointInput[],
  defaultPlacement: CandidateEvaluation["placement"] | undefined
): PointLabelLayoutResult =>
  defaultPlacement
    ? {
        placements: Object.fromEntries(
          points.map((point) => [point.id, defaultPlacement])
        ),
        hiddenByLayout: new Set<string>(),
      }
    : {
        placements: {},
        hiddenByLayout: new Set<string>(),
      };

const evaluatePlacement = ({
  anchor,
  labelText,
  placement,
  orderIndex,
  occupiedLabelRects,
  otherAnchorRects,
  viewportWidth,
  viewportHeight,
}: EvaluatePlacementInput): CandidateEvaluation => {
  const rect = createLabelRect(anchor, labelText, placement);
  const intersectsLabel = occupiedLabelRects.some((occupiedRect) =>
    rectsIntersect(rect, occupiedRect, LABEL_COLLISION_PADDING)
  );
  const intersectsOtherAnchor = otherAnchorRects.some((anchorRect) =>
    rectsIntersect(rect, anchorRect, ANCHOR_LABEL_COLLISION_PADDING)
  );
  const viewportPenalty = getViewportOverflowPenalty(
    rect,
    viewportWidth,
    viewportHeight
  );

  const score =
    (intersectsLabel ? 10000 : 0) +
    (intersectsOtherAnchor ? 5000 : 0) +
    viewportPenalty;

  return {
    placement,
    rect,
    score,
    orderIndex,
    intersectsLabel,
    intersectsOtherAnchor,
    viewportPenalty,
    collisionFree:
      !intersectsLabel && !intersectsOtherAnchor && viewportPenalty === 0,
  };
};

const sortByScoreThenOrder = (
  left: CandidateEvaluation,
  right: CandidateEvaluation
): number =>
  left.score !== right.score
    ? left.score - right.score
    : left.orderIndex - right.orderIndex;

const pickEvaluation = (
  regularEvaluations: CandidateEvaluation[],
  forcedEvaluations: CandidateEvaluation[],
  isSelected: boolean
): CandidateEvaluation | undefined => {
  const regularStrict = regularEvaluations.find(
    (evaluation) => evaluation.collisionFree
  );
  const regularNoLabelOverlap = regularEvaluations.find(
    (evaluation) =>
      !evaluation.intersectsLabel && !evaluation.intersectsOtherAnchor
  );
  const forceStrict = forcedEvaluations.find(
    (evaluation) => evaluation.collisionFree
  );
  const forceNoLabelOverlap = forcedEvaluations.find(
    (evaluation) =>
      !evaluation.intersectsLabel && !evaluation.intersectsOtherAnchor
  );

  const bestNonOverlapping = [...regularEvaluations, ...forcedEvaluations]
    .filter((evaluation) => !evaluation.intersectsLabel)
    .sort(sortByScoreThenOrder)[0];

  const bestAny = [...regularEvaluations, ...forcedEvaluations].sort(
    sortByScoreThenOrder
  )[0];

  return (
    regularStrict ??
    regularNoLabelOverlap ??
    forceStrict ??
    forceNoLabelOverlap ??
    bestNonOverlapping ??
    (isSelected ? bestAny : undefined)
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
  const regularCandidates = config.placementOrder.map((attach) =>
    createPlacement(attach, config.stemDistance, perspectiveStemAngle)
  );

  const sortedPoints = [...points].sort((left, right) => {
    if (left.selected !== right.selected) return left.selected ? -1 : 1;
    return left.index - right.index;
  });

  // Static mode: keep labels on preferred slot, skip dynamic collision resolution.
  if (!config.dynamicLabelPlacement) {
    return createStaticPlacements(sortedPoints, regularCandidates[0]);
  }

  const anchorRectsById = sortedPoints.reduce<Record<string, Rect>>(
    (accumulator, point) => ({
      ...accumulator,
      [point.id]: createAnchorRect(point.anchor),
    }),
    {}
  );

  const finalState = sortedPoints.reduce<LayoutAccumulator>(
    (state, point) => {
      const otherAnchorRects = sortedPoints
        .filter((candidate) => candidate.id !== point.id)
        .map((candidate) => anchorRectsById[candidate.id]);

      const regularEvaluations = regularCandidates.map(
        (placement, orderIndex) =>
          evaluatePlacement({
            anchor: point.anchor,
            labelText: point.text,
            placement,
            orderIndex,
            occupiedLabelRects: state.occupiedLabelRects,
            otherAnchorRects,
            viewportWidth,
            viewportHeight,
          })
      );

      const forcedEvaluations = !regularEvaluations.some(
        (evaluation) => evaluation.collisionFree
      )
        ? regularCandidates.map((placement, orderIndex) => {
            const forcedPlacement = relaxPlacementWithForces({
              anchor: point.anchor,
              labelText: point.text,
              basePlacement: placement,
              occupiedLabelRects: state.occupiedLabelRects,
              otherAnchorRects,
              viewportWidth,
              viewportHeight,
              config: config.dynamicLabelPlacementConfig,
            });

            return evaluatePlacement({
              anchor: point.anchor,
              labelText: point.text,
              placement: forcedPlacement,
              orderIndex,
              occupiedLabelRects: state.occupiedLabelRects,
              otherAnchorRects,
              viewportWidth,
              viewportHeight,
            });
          })
        : [];

      const selectedEvaluation = pickEvaluation(
        regularEvaluations,
        forcedEvaluations,
        point.selected
      );

      if (!selectedEvaluation) {
        const hiddenByLayout = new Set(state.hiddenByLayout);
        hiddenByLayout.add(point.id);

        return {
          ...state,
          hiddenByLayout,
        };
      }

      return {
        placements: {
          ...state.placements,
          [point.id]: selectedEvaluation.placement,
        },
        hiddenByLayout: state.hiddenByLayout,
        occupiedLabelRects: [
          ...state.occupiedLabelRects,
          selectedEvaluation.rect,
        ],
      };
    },
    {
      placements: {},
      hiddenByLayout: new Set<string>(),
      occupiedLabelRects: [],
    }
  );

  return {
    placements: finalState.placements,
    hiddenByLayout: finalState.hiddenByLayout,
  };
};
