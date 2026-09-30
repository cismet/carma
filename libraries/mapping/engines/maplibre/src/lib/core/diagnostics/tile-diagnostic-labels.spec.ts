import { describe, expect, it, vi } from "vitest";
import {
  TILE_KINDS,
  TILE_RECORD_FLOATS,
  type DiagnosticSnapshot,
} from "./tile-diagnostic-scene";
import {
  compactDiagnosticTileId,
  drawDiagnosticText,
  formatTileResidentBytes,
  hitTestDiagnosticLabel,
  type DiagnosticLabelHit,
} from "./tile-diagnostic-labels";

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

describe("diagnostic tile labels", () => {
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
  it("labels offscreen retained tiles without inventing an unknown LOD state", () => {
    const fillText = vi.fn();
    const context = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      strokeText: vi.fn(),
      fillText,
      measureText: (value: string) => ({ width: value.length * 6.6 }),
    } as unknown as CanvasRenderingContext2D;
    drawDiagnosticText(context, snapshot([, , , , , 4, NaN, NaN, 0, NaN]), {
      width: 200,
      height: 200,
      pixelRatio: 1,
      opacity: 1,
      view: { x: 0, y: 0, w: 200, h: 200 },
      labels: "id",
    } as Parameters<typeof drawDiagnosticText>[2]);
    expect(fillText).not.toHaveBeenCalled();
  });
  it("compacts terrain and stable content URLs without using the tileset prefix", () => {
    expect(compactDiagnosticTileId("dem:source:14/4260/2733")).toBe(
      "14/4260/2733"
    );
    expect(
      compactDiagnosticTileId(
        "https://example/tileset.json#0/2:https://example/content/5_23_29.glb"
      )
    ).toBe("5/23/29");
    expect(compactDiagnosticTileId("https://example/mesh_1168775.glb")).toBe(
      "1168775"
    );
    expect(compactDiagnosticTileId("https://example/_mesh_1168775.glb")).toBe(
      "1168775"
    );
  });
  it.each([
    [0, "0 B"],
    [1023, "1023 B"],
    [1024, "1 KiB"],
    [1536, "1.5 KiB"],
    [1024 ** 2, "1 MiB"],
    [1024 ** 3, "1 GiB"],
  ])("formats %d resident bytes as %s", (bytes, expected) => {
    expect(formatTileResidentBytes(bytes)).toBe(expected);
  });

  it("omits IDs that do not fit and suppresses overlapping labels", () => {
    const fillText = vi.fn();
    const context = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      strokeText: vi.fn(),
      fillText,
      measureText: (value: string) => ({ width: value.length * 6.6 }),
    } as unknown as CanvasRenderingContext2D;
    const data = snapshot([, , 26]);
    data.ids = ["14/4260/2733"];
    const frame = {
      width: 200,
      height: 200,
      pixelRatio: 1,
      opacity: 1,
      view: { x: 0, y: 0, w: 200, h: 200 },
      labels: "id",
    } as Parameters<typeof drawDiagnosticText>[2];
    drawDiagnosticText(context, data, frame);
    expect(fillText).not.toHaveBeenCalled();
    data.tiles = snapshot().tiles;
    drawDiagnosticText(context, data, frame);
    expect(fillText.mock.calls.map(([label]) => label)).toEqual([
      "14",
      "4260",
      "2733",
    ]);
    expect(fillText.mock.calls.map(([, , y]) => y)).toEqual([50, 60, 70]);
    fillText.mockClear();
    data.tiles[10] = 24 * 1024;
    drawDiagnosticText(context, data, { ...frame, labels: "id and stats" });
    expect(fillText.mock.calls.map(([label]) => label)).toEqual([
      "14",
      "4260",
      "2733",
      "24 KiB",
    ]);
    fillText.mockClear();
    data.tiles = new Float32Array([...snapshot().tiles, ...snapshot().tiles]);
    data.ids = ["one", "two"];
    drawDiagnosticText(context, data, frame);
    expect(fillText.mock.calls.map(([label]) => label)).toEqual(["one"]);
  });
  it("attaches labels to affine box faces and gives nearest faces overlap priority", () => {
    const fillText = vi.fn();
    const setTransform = vi.fn();
    const context = {
      setTransform,
      clearRect: vi.fn(),
      strokeText: vi.fn(),
      fillText,
      measureText: (value: string) => ({ width: value.length * 6.6 }),
    } as unknown as CanvasRenderingContext2D;
    const data = snapshot();
    data.tiles = new Float32Array([...data.tiles, ...data.tiles]);
    data.ids = ["far", "near"];
    const frame = {
      width: 240,
      height: 240,
      pixelRatio: 2,
      opacity: 1,
      view: { x: 10, y: 20, w: 120, h: 120 },
      labels: "id",
    } as Parameters<typeof drawDiagnosticText>[2];
    const face = {
      transform: [1, 0.25, 0.5, 1, 40, 60] as const,
      width: 100,
      height: 80,
    };
    const hits: DiagnosticLabelHit[] = [];
    drawDiagnosticText(
      context,
      data,
      frame,
      [
        { ...face, record: 0, depth: 0.8 },
        { ...face, record: 1, depth: 0.2 },
      ],
      (hit) => hits.push(hit)
    );
    expect(fillText.mock.calls).toEqual([["near", 50, 40]]);
    expect(setTransform).toHaveBeenCalledWith(4, 1, 2, 4, 120, 160);
    expect(parseFloat(context.font)).toBeLessThan(10);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ record: 1, depth: 0.2 });
    const [x0, y0, x1, y1, x2, y2, x3, y3] = hits[0].polygon;
    expect((x0 + x1 + x2 + x3) / 4).toBeCloseTo(200);
    expect((y0 + y1 + y2 + y3) / 4).toBeCloseTo(185);
    expect(y1).toBeGreaterThan(y0);
    expect(x2).toBeGreaterThan(x1);
    expect(setTransform).toHaveBeenLastCalledWith(2, 0, 0, 2, 0, 0);
  });
});
