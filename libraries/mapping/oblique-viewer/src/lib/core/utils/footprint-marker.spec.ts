import { resolveSeries } from "../config";
import { describe, expect, it } from "vitest";
import { Vector2 } from "three";
import {
  footprintMarkerGeometry,
  footprintSeriesLabel,
} from "./footprint-marker";
import type { ObliquePose } from "../types";
import {
  TEST_LEGACY_SERIES,
  TEST_INPHO_SERIES,
  TEST_SAMPLE_SERIES,
} from "./synthetic-series.test-fixture";

const ring = [
  [-200, -100],
  [200, -100],
  [200, 100],
  [-200, 100],
  [-200, -100],
].map(([x, y]) => new Vector2(x, y));
const north: Pick<ObliquePose, "direction" | "up"> = {
  direction: [0, 0, -1],
  up: [0, 1, 0],
};
const base = (points: Vector2[]) =>
  points[1].clone().add(points[2]).multiplyScalar(0.5);

describe("terrain footprint marker placement", () => {
  it("opens the image-up caret to 120 degrees", () => {
    const [tip, right, left] = footprintMarkerGeometry(ring, north)!.triangle;
    const angle = Math.acos(
      right.clone().sub(tip).normalize().dot(left.clone().sub(tip).normalize())
    );
    expect((angle * 180) / Math.PI).toBeCloseTo(120);
  });
  it("uses declared acquisition years without inventing one for another flight", () => {
    expect(TEST_LEGACY_SERIES.acquisitionYear).toBe(2024);
    expect(TEST_SAMPLE_SERIES.acquisitionYear).toBe(2026);
    expect(
      resolveSeries({
        series: [
          {
            ...TEST_LEGACY_SERIES,
            id: "undated-flight",
            acquisitionYear: undefined,
          },
        ],
      })[0].acquisitionYear
    ).toBeUndefined();
  });
  it("anchors the triangle at image bottom and points toward image top", () => {
    const marker = footprintMarkerGeometry(ring, north)!;
    expect(base(marker.triangle).toArray()).toEqual([0, -100]);
    expect(marker.triangle[0].x).toBe(0);
    expect(marker.triangle[0].y).toBeGreaterThan(-100);
    expect(marker.triangle[0].y).toBeLessThan(0);
    const center = marker.labelCorners
      .reduce((sum, p) => sum.add(p), new Vector2())
      .divideScalar(4);
    expect(center.toArray()).toEqual([0, 0]);
    expect(marker.labelCorners[0].y).toBeGreaterThan(marker.labelCorners[3].y);
  });
  it("is independent of ring winding and start corner", () => {
    const open = ring.slice(0, 4);
    for (const polygon of [
      open.slice().reverse(),
      [...open.slice(2), ...open.slice(0, 2)],
    ]) {
      const marker = footprintMarkerGeometry(polygon, north)!;
      expect(marker.triangle.map((p) => p.toArray())).toEqual(
        footprintMarkerGeometry(ring, north)!.triangle.map((p) => p.toArray())
      );
    }
  });
  it("places an east-facing image's marker at its west edge", () => {
    const marker = footprintMarkerGeometry(ring, {
      direction: [0.6, 0, -0.8],
      up: [0.8, 0, 0.6],
    })!;
    expect(base(marker.triangle).toArray()).toEqual([-200, 0]);
    expect(marker.triangle[0].x).toBeGreaterThan(-200);
  });
  it("follows image roll instead of the camera heading", () => {
    const marker = footprintMarkerGeometry(ring, {
      direction: [0.6, 0, -0.8],
      up: [0, 1, 0],
    })!;
    expect(base(marker.triangle).toArray()).toEqual([0, -100]);
  });
  it("centers the year on an asymmetric polygon's area centroid", () => {
    const trapezoid = [
      [-100, -100],
      [100, -100],
      [200, 100],
      [-200, 100],
    ].map(([x, y]) => new Vector2(x, y));
    const marker = footprintMarkerGeometry(trapezoid, north)!;
    const center = marker.labelCorners
      .reduce((sum, p) => sum.add(p), new Vector2())
      .divideScalar(4);
    expect(center.x).toBeCloseTo(0);
    expect(center.y).toBeCloseTo(100 / 9);
  });
  it("omits degenerate or nonfinite footprints", () => {
    expect(
      footprintMarkerGeometry(
        [new Vector2(), new Vector2(1, 0), new Vector2(2, 0)],
        north
      )
    ).toBeNull();
    expect(
      footprintMarkerGeometry([new Vector2(NaN, 0), ...ring], north)
    ).toBeNull();
  });
  it("omits horizon-facing poses without a stable ground intersection", () => {
    expect(
      footprintMarkerGeometry(ring, { direction: [0, 1, -1e-8], up: [0, 0, 1] })
    ).toBeNull();
  });
});

describe("series footprint identity", () => {
  it("uses distinct short labels for both 2026 catalogs", () => {
    expect(footprintSeriesLabel(TEST_LEGACY_SERIES, 3)).toBe("2024");
    expect(footprintSeriesLabel(TEST_INPHO_SERIES, 3)).toBe("2026");
    expect(footprintSeriesLabel(TEST_SAMPLE_SERIES, 3)).toBe("2026Test");
    expect(TEST_LEGACY_SERIES.acquisitionMonth).toBe(3);
    expect(TEST_INPHO_SERIES.acquisitionMonth).toBe(4);
  });
  it("suppresses labels until multiple enabled series have loaded successfully", () => {
    for (const series of [
      TEST_LEGACY_SERIES,
      TEST_INPHO_SERIES,
      TEST_SAMPLE_SERIES,
    ]) {
      expect(footprintSeriesLabel(series, 1)).toBeUndefined();
    }
    expect(footprintSeriesLabel(TEST_INPHO_SERIES, 0)).toBeUndefined();
    expect(
      resolveSeries({
        series: [
          {
            ...TEST_LEGACY_SERIES,
            id: "unknown-flight",
            shortLabel: undefined,
          },
        ],
      })[0].shortLabel
    ).toBeUndefined();
    expect(
      resolveSeries({
        series: [
          {
            ...TEST_LEGACY_SERIES,
            id: "unknown-flight",
            acquisitionMonth: undefined,
          },
        ],
      })[0].acquisitionMonth
    ).toBeUndefined();
  });
});
