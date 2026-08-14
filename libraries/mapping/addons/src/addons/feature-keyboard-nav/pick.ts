import {
  angleBetweenDeg,
  firstCrossing,
  length,
  nearestPointOfCandidate,
  rotate,
  subtract,
} from "./geometry";
import type {
  CandidateEvaluation,
  PickExplanation,
  PickInput,
  PickResult,
  ProjectedCandidate,
  ResolvedNavConstants,
  ScreenPoint,
} from "./types";

/**
 * The picking core: which feature lies in the pressed direction.
 *
 * Pure and map-free. It takes projected outlines in screen pixels and returns
 * the winner together with the numbers that produced it, so the overlay draws
 * exactly what was decided and the whole rule is testable without a map.
 *
 * Two strategies answer two different questions:
 *
 * `nearest-in-cone` ranks candidates by an *effective distance*
 * `cost = d · (1 + w · (θ/θmax)^p)`. The penalty is multiplicative, not
 * additive, so it never mixes pixels with degrees: scaling every distance
 * scales every cost and leaves the ranking untouched, which is why one `w`
 * holds at every zoom, on every screen and over every dataset. With `p = 1` the
 * penalty reaches `1 + w` at the cone edge, so `w = 2.5` reads as "a feature
 * inside the cone wins as soon as it is more than 3.5 times closer".
 *
 * `first-crossed` asks instead whose boundary a walk along the axis crosses
 * first. Gap-free coverage needs it: where four parcels meet at one vertex, the
 * diagonal parcel and the edge-sharing neighbour have their nearest point at
 * that same vertex, so their `d` is identical and the diagonal one may even
 * have the smaller `θ`. No choice of constants separates them — but a ray
 * leaving through the shared edge enters the neighbour, and can only enter the
 * diagonal parcel by passing exactly through the vertex.
 */

/** The effective distance a candidate is ranked by. */
export const costOf = (
  distancePx: number,
  angleDeg: number,
  { coneAngleDeg, angleWeight, anglePower }: ResolvedNavConstants
): number =>
  distancePx *
  (1 + angleWeight * Math.pow(angleDeg / coneAngleDeg, anglePower));

/**
 * Total order over the survivors, so the same map state and key always produce
 * the same result: iteration order over a hash map is not guaranteed, and two
 * candidates can cost exactly the same. Lower cost, then smaller angle, then
 * smaller distance, then the lexicographically smaller key.
 */
const byCost = (a: CandidateEvaluation, b: CandidateEvaluation): number =>
  a.cost - b.cost ||
  a.angleDeg - b.angleDeg ||
  a.distancePx - b.distancePx ||
  (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

/** Candidates outside the walked layer are dropped only under "locked". */
const isOutOfScope = (
  candidate: ProjectedCandidate,
  input: Pick<PickInput, "crossLayer" | "currentLayerId">
): boolean =>
  input.crossLayer === "locked" &&
  input.currentLayerId !== undefined &&
  candidate.layerId !== input.currentLayerId;

const rejected = (
  key: string,
  point: ScreenPoint,
  distancePx: number,
  angleDeg: number,
  because: CandidateEvaluation["rejectedBecause"]
): CandidateEvaluation => ({
  key,
  nearestPointPx: point,
  distancePx,
  angleDeg,
  cost: Infinity,
  rejectedBecause: because,
});

/**
 * The cone strategy. Hard gates first — a candidate outside the cone does not
 * lie in that direction at all, and one closer than `minStepPx` is co-located
 * with the origin and would trap the cursor — then the cost, then the
 * cross-layer multiplier that makes a layer change need a decisively closer
 * candidate.
 */
export const evaluateInCone = (input: PickInput): CandidateEvaluation[] => {
  const { origin, axis, constants, minStepPx } = input;
  const evaluations: CandidateEvaluation[] = [];

  for (const candidate of input.candidates) {
    const nearest = nearestPointOfCandidate(origin, candidate);
    if (!nearest) continue;

    const delta = subtract(nearest, origin);
    const distancePx = length(delta);
    const angleDeg = angleBetweenDeg(delta, axis);

    if (isOutOfScope(candidate, input)) {
      evaluations.push(
        rejected(candidate.key, nearest, distancePx, angleDeg, "out-of-scope")
      );
      continue;
    }
    if (distancePx < minStepPx) {
      evaluations.push(
        rejected(candidate.key, nearest, distancePx, angleDeg, "too-close")
      );
      continue;
    }
    if (angleDeg > constants.coneAngleDeg) {
      evaluations.push(
        rejected(
          candidate.key,
          nearest,
          distancePx,
          angleDeg,
          // past a right angle it is not merely off-axis, it is behind
          angleDeg >= 90 ? "behind-origin" : "outside-cone"
        )
      );
      continue;
    }

    const base = costOf(distancePx, angleDeg, constants);
    const isCurrentLayer =
      input.currentLayerId !== undefined &&
      candidate.layerId === input.currentLayerId;
    const cost =
      input.crossLayer === "prefer-current" && isCurrentLayer
        ? base * input.currentLayerBonus
        : base;

    evaluations.push({
      key: candidate.key,
      nearestPointPx: nearest,
      distancePx,
      angleDeg,
      cost,
    });
  }

  return evaluations;
};

const winnerOf = (evaluations: CandidateEvaluation[]): string | undefined => {
  const survivors = evaluations
    .filter((evaluation) => evaluation.rejectedBecause === undefined)
    .sort(byCost);
  return survivors[0]?.key;
};

export type FirstCrossedResult = {
  evaluations: CandidateEvaluation[];
  rays: NonNullable<PickExplanation["rays"]>;
  winnerKey?: string;
};

/**
 * The ray strategy. Three rays at `−fan`, `0` and `+fan` degrees rather than
 * one: a single ray can leave the origin exactly through the vertex four
 * parcels share, or run exactly along a shared border, and both are ties the
 * fan resolves. The overall smallest crossing wins, the centre ray taking ties.
 *
 * The cross-layer *multiplier* of the cone strategy has no counterpart here —
 * there is no cost to multiply, only a crossing distance — but "locked" still
 * drops candidates outside the walked layer, since that is a scope rule.
 */
export const evaluateFirstCrossed = (input: PickInput): FirstCrossedResult => {
  const { origin, axis, fanDeg, rayLengthPx } = input;
  const rayAngles = [0, -fanDeg, fanDeg];
  const directions = rayAngles.map((angleDeg) => rotate(axis, angleDeg));

  const evaluations: CandidateEvaluation[] = [];
  const nearestPerRay: Array<ScreenPoint | undefined> = rayAngles.map(
    () => undefined
  );
  const nearestTPerRay: number[] = rayAngles.map(() => Infinity);

  /**
   * The pressed direction counts for more than the fan around it.
   *
   * The fan exists so that a neighbour meeting the origin at a corner is still
   * reachable, but ranking all three rays by raw distance lets a parcel the
   * outer ray only clips beat the one lying straight ahead. Discounting the
   * centre ray means a fan crossing has to be that much closer to win, which
   * leaves the corner case working while the obvious neighbour stays the
   * obvious answer. A bonus of 1 is the old behaviour.
   */
  const centerRayBonus = input.centerRayBonus ?? 1;
  const costOfCrossing = (t: number, rayIndex: number) =>
    rayIndex === 0 ? t * centerRayBonus : t;

  for (const candidate of input.candidates) {
    if (isOutOfScope(candidate, input)) continue;

    let best:
      | { t: number; point: ScreenPoint; rayIndex: number; cost: number }
      | undefined;
    for (let rayIndex = 0; rayIndex < directions.length; rayIndex++) {
      const crossing = firstCrossing(
        origin,
        directions[rayIndex],
        candidate,
        rayLengthPx
      );
      if (!crossing) continue;
      if (crossing.t < nearestTPerRay[rayIndex]) {
        nearestTPerRay[rayIndex] = crossing.t;
        nearestPerRay[rayIndex] = crossing.point;
      }
      const cost = costOfCrossing(crossing.t, rayIndex);
      // rayAngles starts with the centre ray, so a strict `<` lets it keep ties
      if (!best || cost < best.cost) {
        best = { ...crossing, rayIndex, cost };
      }
    }

    if (!best || best.t < input.minStepPx) continue;

    evaluations.push({
      key: candidate.key,
      nearestPointPx: best.point,
      distancePx: best.t,
      // the crossing lies on its ray, so the ray's own angle is its θ
      angleDeg: Math.abs(rayAngles[best.rayIndex]),
      cost: best.cost,
    });
  }

  return {
    evaluations,
    rays: rayAngles.map((angleDeg, index) => ({
      angleDeg,
      ...(nearestPerRay[index] ? { crossingPx: nearestPerRay[index] } : {}),
    })),
    winnerKey: winnerOf(evaluations),
  };
};

/**
 * One keypress. `auto` casts rays from a polygon origin and uses the cone
 * otherwise; when no ray crosses anything the cone still runs, within the same
 * keypress, so a parcel at the edge of its coverage can still step onto a
 * neighbouring point layer.
 */
export const pickInDirection = (input: PickInput): PickResult => {
  const strategy =
    input.strategy === "auto"
      ? input.originIsArea
        ? "first-crossed"
        : "nearest-in-cone"
      : input.strategy;

  const base = {
    originPx: input.origin,
    axis: input.axis,
    coneAngleDeg: input.constants.coneAngleDeg,
    angleWeight: input.constants.angleWeight,
    anglePower: input.constants.anglePower,
  };

  if (strategy === "first-crossed") {
    const crossed = evaluateFirstCrossed(input);
    if (crossed.winnerKey !== undefined) {
      return {
        winnerKey: crossed.winnerKey,
        explanation: {
          ...base,
          strategyUsed: "first-crossed",
          rays: crossed.rays,
          evaluations: crossed.evaluations,
          winnerKey: crossed.winnerKey,
        },
      };
    }
    const evaluations = evaluateInCone(input);
    const winnerKey = winnerOf(evaluations);
    return {
      winnerKey,
      explanation: {
        ...base,
        strategyUsed: "nearest-in-cone",
        // kept: they are why the cone had to run at all
        rays: crossed.rays,
        evaluations,
        ...(winnerKey === undefined ? {} : { winnerKey }),
      },
    };
  }

  const evaluations = evaluateInCone(input);
  const winnerKey = winnerOf(evaluations);
  return {
    winnerKey,
    explanation: {
      ...base,
      strategyUsed: "nearest-in-cone",
      evaluations,
      ...(winnerKey === undefined ? {} : { winnerKey }),
    },
  };
};

/**
 * The ranked survivors, best first. The addon walks this list when
 * `verifyWithRenderer` rejects the winner.
 */
export const rankedKeys = (explanation: PickExplanation): string[] =>
  explanation.evaluations
    .filter((evaluation) => evaluation.rejectedBecause === undefined)
    .sort(byCost)
    .map((evaluation) => evaluation.key);
