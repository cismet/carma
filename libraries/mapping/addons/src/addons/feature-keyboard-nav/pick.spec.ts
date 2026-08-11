import { describe, expect, it } from "vitest";

import { resolveNavConstants } from "./constants";
import { rotate } from "./geometry";
import { pickInDirection } from "./pick";
import type { PickInput, ProjectedCandidate, ScreenPoint } from "./types";

/**
 * The picking core against fixed screen coordinates, with no map involved.
 *
 * Screen `y` grows downwards, so the axis used throughout is up = `(0, -1)`.
 */

const UP: ScreenPoint = { x: 0, y: -1 };
const ORIGIN: ScreenPoint = { x: 0, y: 0 };

/** A point candidate `distancePx` away from the origin, `angleDeg` off the axis. */
const pointAt = (
  key: string,
  distancePx: number,
  angleDeg: number,
  layerId?: string
): ProjectedCandidate => {
  const direction = rotate(UP, angleDeg);
  return {
    key,
    isArea: false,
    parts: [[{ x: direction.x * distancePx, y: direction.y * distancePx }]],
    ...(layerId ? { layerId } : {}),
  };
};

const polygon = (
  key: string,
  ring: [number, number][]
): ProjectedCandidate => ({
  key,
  isArea: true,
  parts: [[...ring, ring[0]].map(([x, y]) => ({ x, y }))],
});

const inputFor = (
  candidates: ProjectedCandidate[],
  overrides: Partial<PickInput> = {}
): PickInput => ({
  origin: ORIGIN,
  axis: UP,
  candidates,
  constants: resolveNavConstants(),
  originIsArea: false,
  strategy: "nearest-in-cone",
  crossLayer: "free",
  currentLayerBonus: 0.6,
  minStepPx: 2,
  fanDeg: 8,
  rayLengthPx: 4000,
  ...overrides,
});

describe("nearest-in-cone", () => {
  it("lets a near off-axis candidate beat a distant on-axis one (A1)", () => {
    const result = pickInDirection(
      inputFor([
        pointAt("far-on-axis", 500, 0),
        pointAt("near-off-axis", 40, 15),
      ])
    );

    expect(result.winnerKey).toBe("near-off-axis");
    // 40 · (1 + 2.5 · 15/60) = 65 against 500
    const near = result.explanation.evaluations.find(
      (evaluation) => evaluation.key === "near-off-axis"
    );
    expect(near?.cost).toBeCloseTo(65, 6);
  });

  it("rejects a candidate that is essentially sideways (A2)", () => {
    const result = pickInDirection(inputFor([pointAt("sideways", 30, 89)]));

    expect(result.winnerKey).toBeUndefined();
    expect(result.explanation.evaluations[0].rejectedBecause).toBe(
      "outside-cone"
    );
  });

  it("pins the 3.5x break-even at the cone edge (A3)", () => {
    const loses = pickInDirection(
      inputFor([pointAt("on-axis", 100, 0), pointAt("edge", 30, 60)])
    );
    // 30 · 3.5 = 105 > 100
    expect(loses.winnerKey).toBe("on-axis");

    const wins = pickInDirection(
      inputFor([pointAt("on-axis", 100, 0), pointAt("edge", 25, 60)])
    );
    // 25 · 3.5 = 87.5 < 100
    expect(wins.winnerKey).toBe("edge");
  });

  it("returns no winner when nothing lies in that direction (A8)", () => {
    const result = pickInDirection(
      inputFor([pointAt("behind", 40, 180), pointAt("sideways", 40, 95)])
    );

    expect(result.winnerKey).toBeUndefined();
    expect(
      result.explanation.evaluations.every(
        (evaluation) => evaluation.rejectedBecause === "behind-origin"
      )
    ).toBe(true);
  });

  it("resolves identical costs through the full tie-break order (A7)", () => {
    const tied = ["candidate-c", "candidate-a", "candidate-b"].map((key) =>
      pointAt(key, 100, 0)
    );

    const winners = [
      tied,
      [tied[2], tied[0], tied[1]],
      [tied[1], tied[2], tied[0]],
    ].map((shuffled) => pickInDirection(inputFor(shuffled)).winnerKey);

    expect(winners).toEqual(["candidate-a", "candidate-a", "candidate-a"]);
  });

  it("makes a layer change need a decisively closer candidate under prefer-current", () => {
    const candidates = [
      pointAt("same-layer", 100, 0, "parcels"),
      pointAt("other-layer", 70, 0, "poi"),
    ];
    const overrides = {
      crossLayer: "prefer-current" as const,
      currentLayerId: "parcels",
    };

    // 100 · 0.6 = 60 beats 70
    expect(pickInDirection(inputFor(candidates, overrides)).winnerKey).toBe(
      "same-layer"
    );

    const decisive = [candidates[0], pointAt("other-layer", 50, 0, "poi")];
    expect(pickInDirection(inputFor(decisive, overrides)).winnerKey).toBe(
      "other-layer"
    );
  });

  it("drops candidates outside the walked layer under locked", () => {
    const result = pickInDirection(
      inputFor([pointAt("other-layer", 40, 0, "poi")], {
        crossLayer: "locked",
        currentLayerId: "parcels",
      })
    );

    expect(result.winnerKey).toBeUndefined();
    expect(result.explanation.evaluations[0].rejectedBecause).toBe(
      "out-of-scope"
    );
  });
});

describe("first-crossed on gap-free coverage (A5)", () => {
  /**
   * The origin parcel comes to a peak at the vertex `(0, 0)`, straight ahead of
   * the origin point. `edge-sharing` lies behind the parcel's own left flank and
   * therefore shares an edge with it; `diagonal` sits above the vertex and
   * touches the origin parcel at that single point only.
   *
   * Both strategies are asserted, so the reason the second one exists cannot be
   * optimised away later.
   */
  const origin: ScreenPoint = { x: -10, y: 140 };
  const edgeSharing = polygon("edge-sharing", [
    [-140, 60],
    [0, 0],
    [-60, -60],
  ]);
  const diagonal = polygon("diagonal", [
    [0, 0],
    [100, -80],
    [-100, -80],
  ]);
  const candidates = [diagonal, edgeSharing];

  it("selects the edge-sharing neighbour", () => {
    const result = pickInDirection(
      inputFor(candidates, {
        origin,
        originIsArea: true,
        strategy: "first-crossed",
      })
    );

    expect(result.explanation.strategyUsed).toBe("first-crossed");
    expect(result.winnerKey).toBe("edge-sharing");
  });

  it("documents that the cone selects the diagonal one instead", () => {
    const result = pickInDirection(
      inputFor(candidates, { origin, strategy: "nearest-in-cone" })
    );

    expect(result.winnerKey).toBe("diagonal");
  });

  it("falls through to the cone when no ray crosses anything", () => {
    const result = pickInDirection(
      inputFor([pointAt("scattered-point", 80, 10)], {
        origin: ORIGIN,
        originIsArea: true,
        strategy: "auto",
      })
    );

    expect(result.explanation.strategyUsed).toBe("nearest-in-cone");
    expect(result.explanation.rays).toHaveLength(3);
    expect(result.winnerKey).toBe("scattered-point");
  });
});
