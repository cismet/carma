import { describe, expect, it } from "vitest";
import {
  TILE_STEP_SLOTS,
  diagnosticProjection,
  TILE_KINDS,
  TILE_RECORD_FLOATS,
  PRIMITIVE_FLOATS,
  PHASE_SWEEP,
  type DiagnosticSnapshot,
  type DiagnosticLegendEntry,
} from "./tile-diagnostic-scene";
import { buildDiagnosticPrimitives } from "./tile-diagnostic-primitives";
import {
  buildDiagnosticViewport,
  buildDiagnosticSelection,
} from "./tile-diagnostic-camera-primitives";

const snapshot = (overrides: number[] = []): DiagnosticSnapshot => {
  const record = [
    10,
    20,
    100,
    80,
    TILE_KINDS.indexOf("displayed"),
    0,
    5,
    5,
    0,
    20,
    // bytes and the step milliseconds a tile may carry
    ...new Array(TILE_RECORD_FLOATS - 10).fill(0),
  ];
  overrides.forEach((v, i) => {
    if (v !== undefined) record[i] = v;
  });
  return {
    tiles: new Float32Array(record),
    ids: ["tile"],
    edges: new Float32Array(),
    extent: null,
    center: null,
    target: 2,
  };
};

/** A record of the current layout: fields, then the step slots, then level. */
const tileRecord = ({
  x = 10,
  y = 20,
  w = 100,
  h = 80,
  kind = TILE_KINDS.indexOf("displayed"),
  flags = 0,
  phase = 3,
  bytes = 0,
  steps = [] as number[],
  level = 0,
}) => [
  x,
  y,
  w,
  h,
  kind,
  flags,
  5,
  5,
  phase,
  20,
  bytes,
  ...Array.from({ length: TILE_STEP_SLOTS }, (_, slot) => steps[slot] ?? 0),
  level,
];
const primitivesOf = (data: Float32Array) =>
  Array.from({ length: data.length / PRIMITIVE_FLOATS }, (_, i) =>
    Array.from(data.slice(i * PRIMITIVE_FLOATS, (i + 1) * PRIMITIVE_FLOATS))
  );

describe("instanced tile diagnostics", () => {
  it("keeps viewport, seam and base colors distinct even outside the camera", () => {
    const colors = [32, 64, 128].map((role) => {
      const data = snapshot([, , , , , role | 4]);
      return Array.from(buildDiagnosticPrimitives(data).slice(8, 11));
    });
    expect(colors[0][0]).toBeCloseTo(138 / 255);
    expect(colors[1][1]).toBeCloseTo(196 / 255);
    expect(colors[2][1]).toBeCloseTo(156 / 255);
    expect(new Set(colors.map((color) => JSON.stringify(color))).size).toBe(3);
  });
  it("draws a fixed three-pixel-radius centroid dot for terminal tiles", () => {
    const data = buildDiagnosticPrimitives(snapshot([, , , , , 16]));
    expect(data.length).toBe(PRIMITIVE_FLOATS * 2);
    expect(Array.from(data.slice(16, 21))).toEqual([60, 60, 3, 3, 4]);
    expect(
      buildDiagnosticPrimitives(snapshot([, , , , , 16, 0, 0])).length
    ).toBe(PRIMITIVE_FLOATS);
    expect(
      buildDiagnosticPrimitives(snapshot([, , , , , 16, -2, -2]))[20]
    ).toBe(2);
  });
  it("stores all concentric contours in one instance, without a three-level cap", () => {
    const data = buildDiagnosticPrimitives(snapshot([, , , , , , 12, 12]));
    expect(data.length).toBe(PRIMITIVE_FLOATS * 2);
    expect(data[PRIMITIVE_FLOATS + 4]).toBe(1);
    expect(data[PRIMITIVE_FLOATS + 6]).toBe(12);
  });
  it("uses squares for oversharp tiles, centered on the tile centroid", () => {
    const data = buildDiagnosticPrimitives(snapshot([, , , , , , -5, -5]));
    expect(Array.from(data.slice(16, 20))).toEqual([60, 60, 40, 40]);
    expect(data[20]).toBe(2);
  });
  it("sweeps a pie by phase when a tile reports no timings", () => {
    // Loading is more than a quarter and less than the whole turn; loaded is
    // the whole turn. No sideways fill anywhere.
    expect([
      PHASE_SWEEP["\u25cb"],
      PHASE_SWEEP["\u25d0"],
      PHASE_SWEEP["\u25cf"],
    ]).toEqual([0.25, 0.6, 1]);
    const loading = primitivesOf(
      buildDiagnosticPrimitives(snapshot([, , , , , , , , 2]))
    ).filter((primitive) => primitive[4] === 6);
    expect(loading).toHaveLength(1);
    expect(loading[0][6]).toBe(0);
    expect(loading[0][7]).toBeCloseTo(0.6, 5);
  });
  it("omits idle baseline glyphs and metadata ancestors", () => {
    expect(buildDiagnosticPrimitives(snapshot([, , , , , 4])).length).toBe(16);
    expect(buildDiagnosticPrimitives(snapshot([, , , , -1])).length).toBe(16);
    // Work in progress draws its contour, its phase pie and the pie's ring.
    expect(
      buildDiagnosticPrimitives(snapshot([, , , , , 4, , , 2])).length
    ).toBe(64);
  });
  it("omits target-matched glyphs, but shows ongoing work", () => {
    expect(buildDiagnosticPrimitives(snapshot([, , , , , , 0, 0])).length).toBe(
      16
    );
    // At the target there is no contour left, but the phase still reads as a
    // pie inside its ring.
    expect(
      buildDiagnosticPrimitives(snapshot([, , , , , , 0, 0, 1])).length
    ).toBe(48);
  });
  it("packs frustum segments and ignores stale hover indices", () => {
    const state = snapshot();
    state.edges = new Float32Array([1, 2, 3, 4]);
    const data = buildDiagnosticPrimitives(state);
    expect(data.length).toBe(32);
    const frustum = buildDiagnosticViewport(state);
    expect(frustum.length).toBe(16);
    expect(frustum[4]).toBe(3);
    state.edges = new Float32Array([10, 20, 30, 40]);
    expect(buildDiagnosticPrimitives(state)).toEqual(data);
    expect(buildDiagnosticViewport(state)).not.toEqual(frustum);
    expect(
      buildDiagnosticSelection(state, [
        [0, 1],
        [99, 0],
      ]).length
    ).toBe(16);
    expect(state.tiles.length).toBe(TILE_RECORD_FLOATS);
  });
  it("matches aspect-preserving SVG meet projection and inverse pointer mapping", () => {
    const p = diagnosticProjection({ x: 10, y: 20, w: 100, h: 100 }, 200, 100);
    expect([p.scale, p.offsetX, p.offsetY]).toEqual([1, 40, -20]);
    expect(10 * p.matrix[0] + p.matrix[12]).toBeCloseTo(-0.5);
    expect(20 * p.matrix[5] + p.matrix[13]).toBeCloseTo(1);
    expect((50 - p.offsetX) / p.scale).toBe(10);
  });

  it("draws every processing step as its own wedge and the size as boxes", () => {
    // A loaded tile of 200 KiB whose first three steps cost 100, 50 and 50 ms.
    const state = snapshot();
    state.tiles = new Float32Array(
      tileRecord({ bytes: 200 * 1024, steps: [100, 50, 50], level: 12 })
    );
    const primitives = primitivesOf(buildDiagnosticPrimitives(state));
    const wedges = primitives.filter((primitive) => primitive[4] === 6);
    expect(wedges).toHaveLength(3);
    // The wedges follow one another around the circle, sized by their share.
    expect(wedges.map((wedge) => Number(wedge[6].toFixed(4)))).toEqual([
      0, 0.5, 0.75,
    ]);
    expect(wedges.map((wedge) => Number(wedge[7].toFixed(4)))).toEqual([
      0.5, 0.75, 1,
    ]);
    // Each wedge carries the colour of its own step, not of its position.
    expect(new Set(wedges.map((wedge) => wedge.slice(8, 11).join())).size).toBe(
      3
    );
    // One cell per kilobyte while the largest tile in the cut is small, laid
    // out in reading order across a ten by ten grid.
    const cells = primitives.filter(
      (primitive) => primitive[4] === 0 && primitive[2] < 10
    );
    expect(cells).toHaveLength(20);
    expect(new Set(cells.map((cell) => cell[0].toFixed(4))).size).toBe(10);
    expect(new Set(cells.map((cell) => cell[1].toFixed(4))).size).toBe(2);
    expect(cells[10][0]).toBeCloseTo(cells[0][0], 5);
    expect(cells[10][1]).toBeGreaterThan(cells[0][1]);
    const pitch = cells[1][0] - cells[0][0];
    expect(cells[0][2] * 2).toBeLessThan(pitch);
    expect(cells[0][2] * 2).toBeGreaterThan(pitch * 0.8);
  });

  it("publishes legend samples from the enabled primitive emission branches", () => {
    const state = snapshot();
    state.tiles = new Float32Array(
      tileRecord({ flags: 32, bytes: 2 * 1024 * 1024, steps: [100, 50] })
    );
    let legend: DiagnosticLegendEntry[] = [];
    const publishLegend = (entries: DiagnosticLegendEntry[]) => {
      legend = entries;
    };
    const data = buildDiagnosticPrimitives(state, publishLegend);
    expect(data).toEqual(buildDiagnosticPrimitives(state));
    expect(legend.map(({ id }) => id)).toEqual([
      "viewport",
      "bytes",
      "step-0",
      "step-1",
      "time",
    ]);
    expect(legend.find(({ id }) => id === "bytes")?.label).toBe(
      "1 cell = 100 KiB"
    );
    const emitted = primitivesOf(data);
    for (const { primitives } of legend)
      expect(
        emitted.some(
          (primitive) =>
            primitive[4] === primitives[4] &&
            primitive
              .slice(8)
              .every((value, i) => Math.abs(value - primitives[i + 8]) < 1e-6)
        )
      ).toBe(true);
    buildDiagnosticPrimitives(
      { ...state, showSize: false, showStats: false },
      publishLegend
    );
    expect(legend.map(({ id }) => id)).toEqual(["viewport"]);
    const untimed = snapshot([, , , , , 0, 0, 0, 2]);
    buildDiagnosticPrimitives(untimed, publishLegend);
    const phase = legend.find(({ id }) => id === "phase-2")!;
    expect(phase.primitives).toHaveLength(PRIMITIVE_FLOATS * 2);
    expect(phase.primitives[4]).toBe(6);
    expect(phase.primitives[7]).toBe(0.6);
    expect(phase.primitives[PRIMITIVE_FLOATS + 4]).toBe(1);
    for (const phase of [4, 5]) {
      buildDiagnosticPrimitives(
        snapshot([, , , , , 0, 0, 0, phase]),
        publishLegend
      );
      expect(legend.some(({ id }) => id.startsWith("phase-"))).toBe(false);
    }
    buildDiagnosticPrimitives(
      { ...state, tiles: new Float32Array() },
      publishLegend
    );
    expect(legend).toEqual([]);
  });

  it("steps the size unit by ten until the largest tile fits the grid", () => {
    // Two megabytes needs a hundred kilobyte cell to stay inside a hundred.
    const state = snapshot();
    state.tiles = new Float32Array(
      tileRecord({ bytes: 2 * 1024 * 1024, steps: [10] })
    );
    const cells = primitivesOf(buildDiagnosticPrimitives(state)).filter(
      (primitive) => primitive[4] === 0 && primitive[2] < 10
    );
    expect(cells).toHaveLength(21);
  });

  it("sweeps a loading tile against the median of the finished ones", () => {
    const state = snapshot();
    state.tiles = new Float32Array([
      ...tileRecord({ phase: 3, steps: [100, 100], level: 12 }),
      ...tileRecord({ phase: 2, steps: [50], level: 12, x: 200 }),
    ]);
    state.ids = ["done", "loading"];
    const wedges = primitivesOf(buildDiagnosticPrimitives(state)).filter(
      (primitive) => primitive[4] === 6
    );
    // Two wedges for the finished tile, one for the tile still loading.
    expect(wedges).toHaveLength(3);
    expect(wedges[1][7]).toBe(1);
    // 50 ms against a 200 ms median reads as a quarter of the way in.
    expect(wedges[2][7]).toBeCloseTo(0.25, 5);
  });

  it("draws only the cut outline even when its centre is available", () => {
    const state = snapshot();
    state.edges = new Float32Array([
      0, 0, 0.1, 0, 0.1, 0, 0.1, 0.1, 0.1, 0.1, 0, 0.1, 0, 0.1, 0, 0,
    ]);
    state.center = [0.05, 0.05];
    const primitives = primitivesOf(buildDiagnosticViewport(state));
    expect(primitives).toHaveLength(4);
    expect(primitives.flatMap((primitive) => primitive.slice(0, 4))).toEqual(
      Array.from(state.edges)
    );
    state.edges = new Float32Array();
    expect(buildDiagnosticViewport(state)).toHaveLength(0);
  });

  it("tapers a frustum edge from the eye outwards", () => {
    const state = snapshot();
    // One edge running away from an eye at the origin of the overview.
    state.edges = new Float32Array([0, 0, 0, 100]);
    const plain = buildDiagnosticViewport(state);
    expect(plain[4]).toBe(3);
    const tapered = buildDiagnosticViewport({ ...state, origin: [0, 0] });
    expect(tapered[4]).toBe(5);
    // Near end wide, far end narrow, and both ends drawn.
    expect(tapered[6]).toBeGreaterThan(tapered[7]);
    expect(tapered[7]).toBeGreaterThan(0);
  });

  it("fades the generations above the cut and marks the outliers", () => {
    const tile = (level: number, steps: number[], x = 10) =>
      tileRecord({ level, steps, x });
    const state = snapshot();
    state.tiles = new Float32Array([
      ...tile(12, [10, 0, 0, 0], 10),
      ...tile(12, [10, 0, 0, 0], 120),
      ...tile(11, [10, 0, 0, 0], 230),
      ...tile(12, [400, 0, 0, 0], 340),
    ]);
    state.ids = ["a", "b", "parent", "slow"];
    const data = buildDiagnosticPrimitives(state);
    const rects = Array.from(
      { length: data.length / PRIMITIVE_FLOATS },
      (_, i) =>
        Array.from(data.slice(i * PRIMITIVE_FLOATS, (i + 1) * PRIMITIVE_FLOATS))
    ).filter((primitive) => primitive[4] === 0 && primitive[2] === 50);
    expect(rects).toHaveLength(4);
    // One generation above the finest level keeps two thirds of the opacity.
    expect(rects[2][11]).toBeCloseTo(rects[0][11] * (2 / 3), 5);
    // The expensive tile is drawn in the failure colour at full opacity.
    expect(rects[3][11]).toBe(1);
    expect(rects[3].slice(8, 11)).not.toEqual(rects[0].slice(8, 11));
  });

  it("draws light tile cuts without the free-standing light box", () => {
    const view = {
      ...snapshot(),
      edges: new Float32Array([100, 100, 200, 200]),
      frustumEdges: new Float32Array([0, 20, 40, 20]),
      nearCenter: [20, 20] as const,
      forward: [0, 1] as const,
      origin: [20, 0] as const,
    };
    const data = primitivesOf(
      buildDiagnosticViewport(view, "rgba(246, 250, 164, 0.6)", true)
    );
    expect(data).toHaveLength(2);
    expect(data[0].slice(0, 5)).toEqual([100, 100, 200, 200, 3]);
    expect(data[1].slice(0, 8)).toEqual([20, 20, 8, 8, 7, 0, 0, 1]);
    expect(data[1][11]).toBeCloseTo(0.6);
    expect(
      primitivesOf(
        buildDiagnosticViewport({ ...view, forward: null }, "#ffffff", true)
      )
    ).toHaveLength(1);
  });

  it("sizes a pie by its cost against the median and rings that median", () => {
    const state = snapshot();
    state.tiles = new Float32Array([
      ...tileRecord({ steps: [100], level: 12, x: 10 }),
      ...tileRecord({ steps: [100], level: 12, x: 120 }),
      ...tileRecord({ steps: [400], level: 12, x: 230 }),
    ]);
    state.ids = ["a", "b", "slow"];
    const primitives = primitivesOf(buildDiagnosticPrimitives(state));
    const wedges = primitives.filter((primitive) => primitive[4] === 6);
    const rings = primitives.filter((primitive) => primitive[4] === 1);
    expect(wedges).toHaveLength(3);
    expect(rings).toHaveLength(3);
    // Four times the median cost is twice the radius: area carries the ratio.
    expect(wedges[2][2]).toBeCloseTo(wedges[0][2] * 2, 5);
    // The reference ring is the same for every tile of the cut.
    expect(rings[2][2]).toBeCloseTo(rings[0][2], 5);
    expect(wedges[0][2]).toBeCloseTo(rings[0][2], 5);
  });
});
