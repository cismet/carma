import type { CssPixelPosition } from "@carma-units";

import {
  AREA_LABEL_FIT_DEFAULTS,
  doesBoxFitInPolygon,
  resolveAreaLabelFit,
} from "./area-label-fit";

const outline = (points: [number, number][]) =>
  points.map(([x, y]) => ({ x, y } as CssPixelPosition));
const at = (x: number, y: number) => ({ x, y } as CssPixelPosition);

const square = outline([
  [0, 0],
  [100, 0],
  [100, 100],
  [0, 100],
]);

// an L whose area centroid falls outside the thin arm it sits next to
const lShape = outline([
  [0, 0],
  [200, 0],
  [200, 30],
  [30, 30],
  [30, 200],
  [0, 200],
]);

describe("doesBoxFitInPolygon", () => {
  it("fits a small box in a square and rejects one too wide", () => {
    expect(doesBoxFitInPolygon(at(50, 50), 40, 20, square)).toBe(true);
    expect(doesBoxFitInPolygon(at(50, 50), 120, 20, square)).toBe(false);
  });

  it("rejects a box an edge runs through even with its corners inside", () => {
    const notch = outline([
      [0, 0],
      [100, 0],
      [100, 100],
      [55, 100],
      [50, 40],
      [45, 100],
      [0, 100],
    ]);
    expect(doesBoxFitInPolygon(at(50, 60), 40, 10, notch)).toBe(false);
  });

  it("asks for the margin around the box", () => {
    expect(doesBoxFitInPolygon(at(50, 50), 90, 20, square)).toBe(true);
    expect(doesBoxFitInPolygon(at(50, 50), 90, 20, square, 6)).toBe(false);
  });
});

describe("resolveAreaLabelFit", () => {
  it("uses the centroid while it fits", () => {
    expect(
      resolveAreaLabelFit({ polygon: square, width: 40, height: 20 })
    ).toEqual({ fits: true, position: { x: 50, y: 50 }, weights: null });
  });

  it("moves off the centroid and keeps the spot with the outline", () => {
    const first = resolveAreaLabelFit({
      polygon: lShape,
      width: 16,
      height: 10,
    });
    expect(first.fits).toBe(true);
    expect(first.weights).not.toBeNull();
    const moved = lShape.map((corner) => at(corner.x + 7, corner.y));
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
    const retry = (previous: typeof outside) =>
      resolveAreaLabelFit({
        polygon: square,
        width: tight,
        height: 20,
        previous,
      }).fits;
    expect(retry(outside)).toBe(false);
    expect(retry({ fits: true, position: at(50, 50), weights: null })).toBe(
      true
    );
  });

  it("does not fit without an outline", () => {
    expect(
      resolveAreaLabelFit({ polygon: null, width: 10, height: 10 }).fits
    ).toBe(false);
  });
});
