import {
  AREA_LABEL_FIT_DEFAULTS,
  doesBoxFitInPolygon,
  getDeepestInsidePoint,
  getMeanValueWeights,
  getPolygonCentroid,
  resolveAreaLabelFit,
  type ScreenPoint,
} from "./area-label-fit";

const square: ScreenPoint[] = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

// an L whose area centroid falls outside the thin arm it sits next to
const lShape: ScreenPoint[] = [
  { x: 0, y: 0 },
  { x: 200, y: 0 },
  { x: 200, y: 30 },
  { x: 30, y: 30 },
  { x: 30, y: 200 },
  { x: 0, y: 200 },
];

describe("doesBoxFitInPolygon", () => {
  it("fits a small box in a square and rejects one too wide", () => {
    expect(doesBoxFitInPolygon({ x: 50, y: 50 }, 40, 20, square)).toBe(true);
    expect(doesBoxFitInPolygon({ x: 50, y: 50 }, 120, 20, square)).toBe(false);
  });

  it("rejects a box an edge runs through even with its corners inside", () => {
    const notch: ScreenPoint[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 55, y: 100 },
      { x: 50, y: 40 },
      { x: 45, y: 100 },
      { x: 0, y: 100 },
    ];
    expect(doesBoxFitInPolygon({ x: 50, y: 60 }, 40, 10, notch)).toBe(false);
  });

  it("asks for the margin around the box", () => {
    expect(doesBoxFitInPolygon({ x: 50, y: 50 }, 90, 20, square)).toBe(true);
    expect(doesBoxFitInPolygon({ x: 50, y: 50 }, 90, 20, square, 6)).toBe(
      false
    );
  });
});

describe("getPolygonCentroid and getDeepestInsidePoint", () => {
  it("finds the middle of a square", () => {
    expect(getPolygonCentroid(square)).toEqual({ x: 50, y: 50 });
    const deepest = getDeepestInsidePoint(square)!;
    expect(deepest.x).toBeCloseTo(50, 0);
    expect(deepest.y).toBeCloseTo(50, 0);
  });

  it("places the deepest point inside an L where the centroid is not", () => {
    const centroid = getPolygonCentroid(lShape)!;
    expect(doesBoxFitInPolygon(centroid, 2, 2, lShape)).toBe(false);
    const deepest = getDeepestInsidePoint(lShape)!;
    expect(doesBoxFitInPolygon(deepest, 2, 2, lShape)).toBe(true);
  });
});

describe("getMeanValueWeights", () => {
  it("rebuilds the point from the corners", () => {
    const point = { x: 20, y: 120 };
    const weights = getMeanValueWeights(point, lShape)!;
    const rebuilt = lShape.reduce(
      (sum, corner, index) => ({
        x: sum.x + corner.x * weights[index]!,
        y: sum.y + corner.y * weights[index]!,
      }),
      { x: 0, y: 0 }
    );
    expect(rebuilt.x).toBeCloseTo(point.x, 6);
    expect(rebuilt.y).toBeCloseTo(point.y, 6);
  });
});

describe("resolveAreaLabelFit", () => {
  it("uses the centroid while it fits", () => {
    expect(
      resolveAreaLabelFit({ polygon: square, width: 40, height: 20 })
    ).toEqual({ fits: true, position: { x: 50, y: 50 }, weights: null });
  });

  it("falls back to the deepest point and moves it with the outline", () => {
    const first = resolveAreaLabelFit({
      polygon: lShape,
      width: 16,
      height: 10,
    });
    expect(first.fits).toBe(true);
    expect(first.weights).not.toBeNull();
    const moved = lShape.map((corner) => ({ x: corner.x + 7, y: corner.y }));
    const second = resolveAreaLabelFit({
      polygon: moved,
      width: 16,
      height: 10,
      previous: first,
    });
    expect(second.position!.x).toBeCloseTo(first.position!.x + 7, 6);
    expect(second.position!.y).toBeCloseTo(first.position!.y, 6);
  });

  it("leaves the area when nothing fits and comes back only with margin", () => {
    const outside = resolveAreaLabelFit({
      polygon: square,
      width: 120,
      height: 20,
    });
    expect(outside.fits).toBe(false);
    const tight = 100 - 2 * AREA_LABEL_FIT_DEFAULTS.reenterMarginPx + 2;
    expect(
      resolveAreaLabelFit({
        polygon: square,
        width: tight,
        height: 20,
        previous: outside,
      }).fits
    ).toBe(false);
    expect(
      resolveAreaLabelFit({
        polygon: square,
        width: tight,
        height: 20,
        previous: { fits: true, position: { x: 50, y: 50 }, weights: null },
      }).fits
    ).toBe(true);
  });

  it("does not fit without an outline", () => {
    expect(
      resolveAreaLabelFit({ polygon: null, width: 10, height: 10 }).fits
    ).toBe(false);
  });
});
