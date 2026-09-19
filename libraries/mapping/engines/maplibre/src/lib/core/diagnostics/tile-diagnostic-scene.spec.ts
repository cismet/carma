import { describe, expect, it, vi } from "vitest";
import {
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

  it("draws processing steps as a pie and the payload size as boxes", () => {
    // A loaded tile of 20 kB whose three steps cost 100, 50 and 50 ms.
    const state = snapshot([, , , , , , , , 3, , 20 * 1024, 100, 50, 50, 0]);
    const data = buildDiagnosticPrimitives(state);
    const primitives = Array.from(
      { length: data.length / PRIMITIVE_FLOATS },
      (_, i) =>
        Array.from(data.slice(i * PRIMITIVE_FLOATS, (i + 1) * PRIMITIVE_FLOATS))
    );
    const pie = primitives.find((primitive) => primitive[4] === 6);
    if (!pie) throw new Error("expected a pie primitive");
    // A finished tile sweeps the full circle, split by each step's share.
    expect(pie[6]).toBe(1);
    expect(pie[12]).toBeCloseTo(0.5, 5);
    expect(pie[13]).toBeCloseTo(0.75, 5);
    expect(pie[14]).toBeCloseTo(1, 5);
    // One box per kilobyte while the largest tile in the cut is small.
    const boxes = primitives.filter(
      (primitive) => primitive[4] === 0 && primitive[2] < 10
    );
    expect(boxes).toHaveLength(20);
    // The boxes run from the top left corner towards the bottom right one.
    expect(boxes[0][0]).toBeLessThan(boxes[boxes.length - 1][0]);
    expect(boxes[0][1]).toBeLessThan(boxes[boxes.length - 1][1]);
  });

  it("sweeps a loading tile against the median of the finished ones", () => {
    const record = (phase: number, steps: number[]) => [
      10,
      20,
      100,
      80,
      TILE_KINDS.indexOf("displayed"),
      0,
      5,
      5,
      phase,
      20,
      0,
      ...steps,
    ];
    const state = snapshot();
    state.tiles = new Float32Array([
      ...record(3, [100, 100, 0, 0]),
      ...record(2, [50, 0, 0, 0]),
    ]);
    state.ids = ["done", "loading"];
    const data = buildDiagnosticPrimitives(state);
    const pies = Array.from(
      { length: data.length / PRIMITIVE_FLOATS },
      (_, i) =>
        Array.from(data.slice(i * PRIMITIVE_FLOATS, (i + 1) * PRIMITIVE_FLOATS))
    ).filter((primitive) => primitive[4] === 6);
    expect(pies).toHaveLength(2);
    expect(pies[0][6]).toBe(1);
    // 50 ms against a 200 ms median reads as a quarter of the way in.
    expect(pies[1][6]).toBeCloseTo(0.25, 5);
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
});
