import { describe, expect, it, vi } from "vitest";
import {
  TILE_STEP_SLOTS,
  buildDiagnosticPrimitives,
  buildDiagnosticViewport,
  buildDiagnosticSelection,
  diagnosticProjection,
  hitTestDiagnosticLabel,
  TILE_KINDS,
  TILE_RECORD_FLOATS,
  PRIMITIVE_FLOATS,
  tilePhaseFill,
  drawDiagnosticText,
  type DiagnosticSnapshot,
} from "./tile-diagnostic-scene";

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
  it("hit tests labels in reverse draw order without confusing ancestor outlines", () => {
    const tile = {};
    const model = {
      rects: [
        { x: 0, y: 0, w: 100, h: 100, kind: "displayed", tile },
        { x: 0, y: 0, w: 100, h: 100, kind: "ancestor", tile: {} },
      ],
    } as Parameters<typeof hitTestDiagnosticLabel>[0];
    const view = { x: 0, y: 0, w: 100, h: 100 };
    expect(hitTestDiagnosticLabel(model, view, 100, 100, 50, 50)).toBe(tile);
    expect(hitTestDiagnosticLabel(model, view, 100, 100, 50, 90)).toBeNull();
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
  it("uses loading milestones for the shader's clipped left-to-right fill", () => {
    expect(["", "○", "◐", "●", "×", "Ⅱ"].map(tilePhaseFill)).toEqual([
      0,
      0,
      1 / 3,
      2 / 3,
      0,
      0,
    ]);
    expect(
      buildDiagnosticPrimitives(snapshot([, , , , , , , , 2]))[23]
    ).toBeCloseTo(1 / 3);
    expect(
      buildDiagnosticPrimitives(snapshot([, , , , , , , , 3]))[23]
    ).toBeCloseTo(2 / 3);
  });
  it("omits idle baseline glyphs and metadata ancestors", () => {
    expect(buildDiagnosticPrimitives(snapshot([, , , , , 4])).length).toBe(16);
    expect(buildDiagnosticPrimitives(snapshot([, , , , -1])).length).toBe(16);
    expect(
      buildDiagnosticPrimitives(snapshot([, , , , , 4, , , 2])).length
    ).toBe(32);
  });
  it("omits target-matched glyphs, but shows ongoing work", () => {
    expect(buildDiagnosticPrimitives(snapshot([, , , , , , 0, 0])).length).toBe(
      16
    );
    expect(
      buildDiagnosticPrimitives(snapshot([, , , , , , 0, 0, 1])).length
    ).toBe(32);
  });
  it("labels offscreen retained tiles without inventing an unknown LOD state", () => {
    const fillText = vi.fn();
    const context = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      strokeText: vi.fn(),
      fillText,
    } as unknown as CanvasRenderingContext2D;
    drawDiagnosticText(context, snapshot([, , , , , 4, NaN, NaN, 0, NaN]), {
      width: 200,
      height: 200,
      pixelRatio: 1,
      opacity: 1,
      view: { x: 0, y: 0, w: 200, h: 200 },
      labels: "id and error",
    } as Parameters<typeof drawDiagnosticText>[2]);
    expect(fillText.mock.calls.map(([text]) => text)).toEqual([
      "tile · outside views",
    ]);
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
    // A loaded tile of 20 kB whose first three steps cost 100, 50 and 50 ms.
    const state = snapshot();
    state.tiles = new Float32Array(
      tileRecord({ bytes: 20 * 1024, steps: [100, 50, 50], level: 12 })
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
});
