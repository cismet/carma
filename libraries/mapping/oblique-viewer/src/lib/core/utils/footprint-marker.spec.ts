import { describe, expect, it } from "vitest";
import { Vector2 } from "three";
import {
  footprintMarkerGeometry,
  footprintSeriesLabel,
} from "./footprint-marker";
import type { ObliquePose } from "../types";
import {
  resolveDataset,
  WUPPERTAL_OBLIQUE_2024,
  WUPPERTAL_OBLIQUE_2026,
  WUPPERTAL_2026_RATHAUS_DATASET,
} from "../config";

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
    expect(resolveDataset(undefined).acquisitionYear).toBe(2024);
    expect(WUPPERTAL_2026_RATHAUS_DATASET.acquisitionYear).toBe(2026);
    expect(
      resolveDataset({ id: "undated-flight" }).acquisitionYear
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
    expect(footprintSeriesLabel(WUPPERTAL_OBLIQUE_2024, 3)).toBe("2024");
    expect(footprintSeriesLabel(WUPPERTAL_OBLIQUE_2026, 3)).toBe("2026");
    expect(footprintSeriesLabel(WUPPERTAL_2026_RATHAUS_DATASET, 3)).toBe(
      "2026Test"
    );
    expect(WUPPERTAL_OBLIQUE_2024.acquisitionMonth).toBe(3);
    expect(WUPPERTAL_OBLIQUE_2026.acquisitionMonth).toBe(4);
  });
  it("suppresses labels when only one series is enabled", () => {
    for (const series of [
      WUPPERTAL_OBLIQUE_2024,
      WUPPERTAL_OBLIQUE_2026,
      WUPPERTAL_2026_RATHAUS_DATASET,
    ]) {
      expect(footprintSeriesLabel(series, 1)).toBeUndefined();
    }
    expect(footprintSeriesLabel(WUPPERTAL_OBLIQUE_2026, 0)).toBeUndefined();
    expect(resolveDataset({ id: "unknown-flight" }).shortLabel).toBeUndefined();
    expect(
      resolveDataset({ id: "unknown-flight" }).acquisitionMonth
    ).toBeUndefined();
  });
});
