import { createPlacement, getPerspectiveStemAngleMagnitude } from "./config";
import { relaxPlacementWithForces } from "./forceDirectedPlacement";
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
  LayoutPointInput,
  PointLabelLayoutConfig,
  PointLabelLayoutResult,
  Rect,
  StemSegment,
} from "./types";
type EvaluatePlacementInput = {
  anchor: LayoutPointInput["anchor"];
  labelText: string;
  placement: CandidateEvaluation["placement"];
  orderIndex: number;
  occupiedLabelRects: Rect[];
  occupiedStemSegments: StemSegment[];
  otherAnchorRects: Rect[];
  viewportWidth: number;
  viewportHeight: number;
  avoidStemCrossing: boolean;
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
  collapsedToCompact: Set<string>;
  occupiedLabelRects: Rect[];
  occupiedStemSegments: StemSegment[];
};

const createRegularCandidates = (
  config: PointLabelLayoutConfig,
  perspectiveStemAngle: number
): CandidateEvaluation["placement"][] =>
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
        collapsedToCompact: new Set<string>(),
      }
    : {
        placements: {},
        hiddenByLayout: new Set<string>(),
        collapsedToCompact: new Set<string>(),
      };

const resolveCompactText = (point: LayoutPointInput): string | null => {
  const normalizedCompactText = point.compactText?.trim() ?? "";
  const normalizedDefaultText = point.text.trim();
  if (!normalizedCompactText) return null;
  if (normalizedCompactText === normalizedDefaultText) return null;
  return normalizedCompactText;
};

const evaluatePlacement = ({
  anchor,
  labelText,
  placement,
  orderIndex,
  occupiedLabelRects,
  occupiedStemSegments,
  otherAnchorRects,
  viewportWidth,
  viewportHeight,
  avoidStemCrossing,
}: EvaluatePlacementInput): CandidateEvaluation => {
  const rect = createLabelRect(anchor, labelText, placement);
  const stemSegment = createStemSegment(anchor, placement);
  const intersectsLabel = occupiedLabelRects.some((occupiedRect) =>
    rectsIntersect(rect, occupiedRect, LABEL_COLLISION_PADDING)
  );
  const intersectsOtherAnchor = otherAnchorRects.some((anchorRect) =>
    rectsIntersect(rect, anchorRect, ANCHOR_LABEL_COLLISION_PADDING)
  );
  const crossesStem =
    avoidStemCrossing &&
    occupiedStemSegments.some((occupiedStemSegment) =>
      stemSegmentsIntersect(stemSegment, occupiedStemSegment)
    );
  const viewportPenalty = getViewportOverflowPenalty(
    rect,
    viewportWidth,
    viewportHeight
  );

  const score =
    (intersectsLabel ? 10000 : 0) +
    (intersectsOtherAnchor ? 5000 : 0) +
    (crossesStem ? 7500 : 0) +
    viewportPenalty;

  return {
    placement,
    rect,
    stemSegment,
    score,
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

const pickEvaluation = (
  regularEvaluations: CandidateEvaluation[],
  forcedEvaluations: CandidateEvaluation[]
): CandidateEvaluation | undefined => {
  const regularStrict = regularEvaluations.find(
    (evaluation) => evaluation.collisionFree
  );
  const regularNoLabelOverlap = regularEvaluations.find(
    (evaluation) =>
      !evaluation.intersectsLabel &&
      !evaluation.intersectsOtherAnchor &&
      !evaluation.crossesStem
  );
  const forceStrict = forcedEvaluations.find(
    (evaluation) => evaluation.collisionFree
  );
  const forceNoLabelOverlap = forcedEvaluations.find(
    (evaluation) =>
      !evaluation.intersectsLabel &&
      !evaluation.intersectsOtherAnchor &&
      !evaluation.crossesStem
  );

  const bestNonOverlapping = [...regularEvaluations, ...forcedEvaluations]
    .filter(
      (evaluation) =>
        !evaluation.intersectsLabel &&
        !evaluation.intersectsOtherAnchor &&
        !evaluation.crossesStem
    )
    .sort(sortByScoreThenOrder)[0];

  return (
    regularStrict ??
    regularNoLabelOverlap ??
    forceStrict ??
    forceNoLabelOverlap ??
    bestNonOverlapping
  );
};

const pickCompactBestEffortEvaluation = (
  evaluations: CandidateEvaluation[]
): CandidateEvaluation | undefined => {
  const nonCrossingEvaluations = evaluations.filter(
    (evaluation) => !evaluation.crossesStem
  );
  if (nonCrossingEvaluations.length === 0) return undefined;

  const strictViewportSafe = nonCrossingEvaluations
    .filter(
      (evaluation) =>
        !evaluation.intersectsOtherAnchor &&
        !evaluation.crossesStem &&
        evaluation.viewportPenalty === 0
    )
    .sort(sortByScoreThenOrder)[0];
  if (strictViewportSafe) return strictViewportSafe;

  const noAnchorOverlap = nonCrossingEvaluations
    .filter(
      (evaluation) =>
        !evaluation.intersectsOtherAnchor && !evaluation.crossesStem
    )
    .sort(sortByScoreThenOrder)[0];
  if (noAnchorOverlap) return noAnchorOverlap;

  return [...nonCrossingEvaluations].sort(sortByScoreThenOrder)[0];
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

  const sortedPoints = [...points].sort((left, right) => {
    const priorityDelta =
      (right.layoutPriority ?? 0) - (left.layoutPriority ?? 0);
    if (priorityDelta !== 0) return priorityDelta;
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
      const preferredPlacement = regularCandidates[0];
      if (point.lockPreferredPlacement && preferredPlacement) {
        const lockedPlacement =
          point.preferredAttach !== undefined ||
          point.preferredStemDistance !== undefined
            ? createPlacement(
                point.preferredAttach ?? preferredPlacement.attach,
                point.preferredStemDistance ?? preferredPlacement.distance,
                perspectiveStemAngle,
                `locked:${point.id}`
              )
            : preferredPlacement;

        return {
          placements: {
            ...state.placements,
            [point.id]: lockedPlacement,
          },
          hiddenByLayout: state.hiddenByLayout,
          collapsedToCompact: state.collapsedToCompact,
          occupiedLabelRects: [
            ...state.occupiedLabelRects,
            createLabelRect(point.anchor, point.text, lockedPlacement),
          ],
          occupiedStemSegments: [
            ...state.occupiedStemSegments,
            createStemSegment(point.anchor, lockedPlacement),
          ],
        };
      }

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
            occupiedStemSegments: state.occupiedStemSegments,
            otherAnchorRects,
            viewportWidth,
            viewportHeight,
            avoidStemCrossing:
              config.dynamicLabelPlacementConfig.avoidStemCrossing,
          })
      );

      const shouldGenerateForcedEvaluations =
        config.dynamicLabelPlacementConfig.mode === "always" ||
        !regularEvaluations.some((evaluation) => evaluation.collisionFree);
      const forcedEvaluations = shouldGenerateForcedEvaluations
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
              occupiedStemSegments: state.occupiedStemSegments,
              otherAnchorRects,
              viewportWidth,
              viewportHeight,
              avoidStemCrossing:
                config.dynamicLabelPlacementConfig.avoidStemCrossing,
            });
          })
        : [];

      const selectedEvaluation = pickEvaluation(
        regularEvaluations,
        forcedEvaluations
      );

      if (selectedEvaluation) {
        return {
          placements: {
            ...state.placements,
            [point.id]: selectedEvaluation.placement,
          },
          hiddenByLayout: state.hiddenByLayout,
          collapsedToCompact: state.collapsedToCompact,
          occupiedLabelRects: [
            ...state.occupiedLabelRects,
            selectedEvaluation.rect,
          ],
          occupiedStemSegments: [
            ...state.occupiedStemSegments,
            selectedEvaluation.stemSegment,
          ],
        };
      }

      const compactText = resolveCompactText(point);
      if (compactText) {
        const compactRegularEvaluations = regularCandidates.map(
          (placement, orderIndex) =>
            evaluatePlacement({
              anchor: point.anchor,
              labelText: compactText,
              placement,
              orderIndex,
              occupiedLabelRects: state.occupiedLabelRects,
              occupiedStemSegments: state.occupiedStemSegments,
              otherAnchorRects,
              viewportWidth,
              viewportHeight,
              avoidStemCrossing:
                config.dynamicLabelPlacementConfig.avoidStemCrossing,
            })
        );

        const shouldGenerateCompactForcedEvaluations =
          config.dynamicLabelPlacementConfig.mode === "always" ||
          !compactRegularEvaluations.some(
            (evaluation) => evaluation.collisionFree
          );
        const compactForcedEvaluations = shouldGenerateCompactForcedEvaluations
          ? regularCandidates.map((placement, orderIndex) => {
              const forcedPlacement = relaxPlacementWithForces({
                anchor: point.anchor,
                labelText: compactText,
                basePlacement: placement,
                occupiedLabelRects: state.occupiedLabelRects,
                otherAnchorRects,
                viewportWidth,
                viewportHeight,
                config: config.dynamicLabelPlacementConfig,
              });

              return evaluatePlacement({
                anchor: point.anchor,
                labelText: compactText,
                placement: forcedPlacement,
                orderIndex,
                occupiedLabelRects: state.occupiedLabelRects,
                occupiedStemSegments: state.occupiedStemSegments,
                otherAnchorRects,
                viewportWidth,
                viewportHeight,
                avoidStemCrossing:
                  config.dynamicLabelPlacementConfig.avoidStemCrossing,
              });
            })
          : [];

        const compactSelectedEvaluation = pickEvaluation(
          compactRegularEvaluations,
          compactForcedEvaluations
        );

        const compactBestEffortEvaluation =
          compactSelectedEvaluation ??
          pickCompactBestEffortEvaluation([
            ...compactRegularEvaluations,
            ...compactForcedEvaluations,
          ]);

        if (compactBestEffortEvaluation) {
          const collapsedToCompact = new Set(state.collapsedToCompact);
          collapsedToCompact.add(point.id);
          return {
            placements: {
              ...state.placements,
              [point.id]: compactBestEffortEvaluation.placement,
            },
            hiddenByLayout: state.hiddenByLayout,
            collapsedToCompact,
            occupiedLabelRects: [
              ...state.occupiedLabelRects,
              compactBestEffortEvaluation.rect,
            ],
            occupiedStemSegments: [
              ...state.occupiedStemSegments,
              compactBestEffortEvaluation.stemSegment,
            ],
          };
        }
      }

      const hiddenByLayout = new Set(state.hiddenByLayout);
      hiddenByLayout.add(point.id);

      return {
        ...state,
        hiddenByLayout,
      };
    },
    {
      placements: {},
      hiddenByLayout: new Set<string>(),
      collapsedToCompact: new Set<string>(),
      occupiedLabelRects: [],
      occupiedStemSegments: [],
    }
  );

  return {
    placements: finalState.placements,
    hiddenByLayout: finalState.hiddenByLayout,
    collapsedToCompact: finalState.collapsedToCompact,
  };
};
