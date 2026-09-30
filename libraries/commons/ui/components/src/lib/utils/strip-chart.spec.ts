// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createStripChart, type StripChartRow } from "./strip-chart";

const rows: StripChartRow[] = [
  {
    id: "wire",
    label: "Wire",
    plot: "Transfer",
    color: "blue",
    unit: "MiB/s",
    min: 0,
    reference: { label: "Fibre", value: 600_000_000 / 8 / 1024 ** 2 },
  },
  {
    id: "body",
    label: "Body",
    plot: "Transfer",
    color: "orange",
    unit: "MiB/s",
    min: 0,
  },
  {
    id: "heap",
    label: "Heap",
    color: "purple",
    unit: "MB",
    min: 0,
    reference: { label: "Limit", metric: "heapLimit" },
  },
];
const fixture = (metrics = rows, capacity = 2048) => {
  let path: { op: string; x: number; y: number }[] = [];
  const strokes: { color: string; dash: number[]; path: typeof path }[] = [];
  let dash: number[] = [];
  const context = {
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    setLineDash: (value: number[]) => {
      dash = value;
    },
    beginPath: () => {
      path = [];
    },
    moveTo: (x: number, y: number) => path.push({ op: "move", x, y }),
    lineTo: (x: number, y: number) => path.push({ op: "line", x, y }),
    stroke: () =>
      strokes.push({ color: context.strokeStyle, dash, path: [...path] }),
  };
  const canvas = {
    clientWidth: 400,
    width: 400,
    style: {},
    getContext: () => context,
  } as unknown as HTMLCanvasElement;
  const chart = createStripChart({
    canvas,
    rows: metrics,
    rowHeight: 60,
    capacity,
  });
  const trace = (color: string) =>
    strokes
      .filter((stroke) => stroke.color === color && !stroke.dash.length)
      .at(-1)!.path;
  return { chart, strokes, canvas, trace };
};

describe("parallel chart time and capacity", () => {
  it("reserves label bands without drawing traces or markers through them", () => {
    const { chart, trace, strokes } = fixture();
    chart.resize(96, 32);
    chart.mark({ at: 0, label: "View", color: "cyan" });
    chart.push({ wire: 10, body: 20, heap: 100 }, 0);
    expect(trace("blue").every(({ y }) => y >= 32 && y < 96)).toBe(true);
    expect(trace("purple").every(({ y }) => y >= 128 && y < 192)).toBe(true);
    expect(
      strokes.filter((stroke) => stroke.color === "cyan").at(-1)?.path
    ).toEqual([
      { op: "move", x: 400, y: 32 },
      { op: "line", x: 400, y: 96 },
      { op: "move", x: 400, y: 128 },
      { op: "line", x: 400, y: 192 },
    ]);
  });

  it("aligns irregular timestamps across independent origins and switches windows without losing history", () => {
    const { chart, trace, strokes } = fixture();
    chart.push({ wire: 10, body: 20, heap: 100 }, 0);
    expect(chart.timeRange()).toEqual({ from: -30_000, to: 0 });
    expect(trace("blue").at(-1)?.x).toBe(400);
    chart.push({ wire: 20, body: 30, heap: 200 }, 10_000);
    expect(trace("blue")[0].x).toBeCloseTo((400 * 2) / 3);
    expect(trace("blue").at(-1)?.x).toBe(400);
    chart.mark({ at: 20_000, label: "View frustum", color: "cyan" });
    chart.push({ wire: 30, body: 40, heap: 300 }, 40_000);
    expect(chart.timeRange()).toEqual({ from: 10_000, to: 40_000 });
    expect(trace("blue").map((p) => p.x)).toEqual([0, 400]);
    chart.setWindow(null);
    expect(chart.timeRange()).toEqual({ from: 0, to: 40_000 });
    expect(trace("blue").map((p) => p.x)).toEqual([0, 100, 400]);
    expect(trace("purple").map((p) => p.x)).toEqual([0, 100, 400]);
    expect(chart.rowCenter("wire")).toBe(chart.rowCenter("body"));
    expect(chart.rowCenter("heap")).not.toBe(chart.rowCenter("wire"));
    expect(strokes.filter((s) => s.color === "cyan").at(-1)?.path).toEqual([
      { op: "move", x: 200, y: 0 },
      { op: "line", x: 200, y: 120 },
    ]);
  });

  it("draws physical and time-varying limits while allowing overshoots", () => {
    const { chart, strokes } = fixture();
    chart.push({ wire: 1, heap: 10, heapLimit: 100 }, 0);
    expect(chart.range("wire").max).toBeGreaterThan(71.5);
    chart.push({ wire: 100, heap: 20, heapLimit: 200 }, 1000);
    expect(chart.range("wire")).toEqual(chart.range("body"));
    expect(chart.range("wire").max).toBeGreaterThan(100);
    expect(chart.reference("heap")).toContain("200 MB");
    const limit = strokes
      .filter((s) => s.color === "purple" && s.dash.length)
      .at(-1)!.path;
    expect(limit[0].y).toBeGreaterThan(limit[1].y);
  });

  it("keeps peaks and the start time after bounded history compaction", () => {
    const { chart, trace } = fixture([rows[1]], 16);
    for (let index = 0; index < 160; index++)
      chart.push({ body: index === 2 ? 1000 : 10 }, index * 1000);
    chart.setWindow(null);
    expect(chart.timeRange()).toEqual({ from: 0, to: 159_000 });
    expect(chart.range("body").max).toBeGreaterThanOrEqual(1000);
    expect(trace("orange").length).toBeLessThan(16 * 4);
    chart.resize();
    expect(chart.current("body")).toBe(10);
    expect(chart.timeRange().from).toBe(0);
    // An isolated finite burst also survives compaction between unavailable samples.
    const gapped = fixture([rows[1]], 16);
    for (let index = 0; index < 80; index++)
      gapped.chart.push(
        { body: index === 2 ? 1000 : Number.NaN },
        index * 1000
      );
    gapped.chart.setWindow(null);
    expect(gapped.trace("orange").some((point) => point.y < 10)).toBe(true);
    // Late cleanup from the old window cannot detach the replacement canvas.
    const replacement = { ...gapped.canvas } as HTMLCanvasElement;
    gapped.chart.attach(replacement);
    expect(gapped.chart.detach(gapped.canvas)).toBe(false);
  });

  it("breaks unavailable measurements and ignores out-of-order clock samples", () => {
    const { chart, trace } = fixture();
    chart.push({ body: 8, heap: 100 }, 0);
    chart.push({ body: Number.NaN }, 1000);
    expect(chart.formatted("body")).toBe("–");
    chart.push({ body: 12 }, 2000);
    chart.push({ body: 30 }, 1500);
    expect(chart.current("body")).toBe(12);
    expect(chart.current("heap")).toBe(100);
    expect(trace("orange").map((p) => p.op)).toEqual(["move", "move"]);
  });

  it("rejects unlike units on the same origin", () => {
    expect(() => fixture([rows[0], { ...rows[1], unit: "ms" }])).toThrow(
      "share units and bounds"
    );
  });
});
