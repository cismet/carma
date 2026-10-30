import { Matrix4, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  ecefFromGeographicCoordinate,
  readEnuAxesAtEcef,
} from "@carma-geo/proj";
import { createEnuOrientedDiscMatrix, createOrientedDiscMatrix } from "./disc";
const origin = ecefFromGeographicCoordinate({
  longitude: 7.18,
  latitude: 51.26,
  altitude: 200,
});
const axes = readEnuAxesAtEcef(origin);
const columns = (m: Matrix4) =>
  [0, 1, 2].map((i) => new Vector3().setFromMatrixColumn(m, i));
describe("ENU guide disc", () => {
  it("puts ground X east, Y north and leaves normal offsets in metres", () => {
    const matrix = createEnuOrientedDiscMatrix(origin, axes.up, 5);
    const [x, y, z] = columns(matrix);
    expect(x!.distanceTo(axes.east.clone().multiplyScalar(5))).toBeLessThan(
      1e-10
    );
    expect(y!.distanceTo(axes.north.clone().multiplyScalar(5))).toBeLessThan(
      1e-10
    );
    expect(z!.distanceTo(axes.up)).toBeLessThan(1e-10);
    expect(new Vector3().setFromMatrixPosition(matrix).equals(origin)).toBe(
      true
    );
  });
  it.each([0.2, 1, 5, 20])(
    "preserves a horizontal tangent axis and right-handed frame and a unit normal at radius %s",
    (radius) => {
      const normal = axes.up
        .clone()
        .multiplyScalar(0.5)
        .addScaledVector(axes.east, 0.7)
        .addScaledVector(axes.north, 0.4)
        .normalize();
      const [x, y, z] = columns(
        createEnuOrientedDiscMatrix(origin, normal, radius)
      );
      expect(x!.length()).toBeCloseTo(radius, 12);
      expect(y!.length()).toBeCloseTo(radius, 12);
      expect(z!.length()).toBeCloseTo(1, 12);
      expect(x!.dot(y!)).toBeCloseTo(0, 12);
      expect(x!.dot(z!)).toBeCloseTo(0, 12);
      expect(y!.dot(z!)).toBeCloseTo(0, 12);
      expect(x!.clone().cross(y!).normalize().distanceTo(normal)).toBeLessThan(
        1e-12
      );
      // A tangent axis must remain locally horizontal even on an oblique slope.
      expect(x!.dot(axes.up)).toBeCloseTo(0, 12);
      expect(x!.dot(normal)).toBeCloseTo(0, 12);
    }
  );
  it("does not flip its twist while crossing a steep wall", () => {
    const normals = [-1e-6, 0, 1e-6].map((h) =>
      axes.east.clone().addScaledVector(axes.up, h).normalize()
    );
    const frames = normals.map((n) =>
      columns(createEnuOrientedDiscMatrix(origin, n, 1))
    );
    for (let i = 1; i < frames.length; i++)
      for (let axis = 0; axis < 3; axis++)
        expect(frames[i]![axis]!.dot(frames[i - 1]![axis]!)).toBeGreaterThan(
          0.999999999
        );
  });
  it("reuses output without mutating the anchor or normal", () => {
    const anchor = origin.clone(),
      normal = axes.up.clone(),
      output = new Matrix4();
    expect(createEnuOrientedDiscMatrix(anchor, normal, 2, output)).toBe(output);
    expect(anchor.equals(origin)).toBe(true);
    expect(normal.equals(axes.up)).toBe(true);
  });
  it("keeps the legacy radius scaling and metre-normal contract", () => {
    const a = columns(createOrientedDiscMatrix(origin, axes.up, 1));
    const b = columns(createOrientedDiscMatrix(origin, axes.up, 20));
    expect(b[0]!.distanceTo(a[0]!.clone().multiplyScalar(20))).toBeLessThan(
      1e-12
    );
    expect(b[1]!.distanceTo(a[1]!.clone().multiplyScalar(20))).toBeLessThan(
      1e-12
    );
    expect(b[2]!.distanceTo(a[2]!)).toBeLessThan(1e-12);
  });
});

describe("horizontal tangent edge cases", () => {
  it.each([
    axes.east,
    axes.north,
    axes.east.clone().add(axes.north).normalize(),
  ])("retains the surface normal on vertical walls", (normal) => {
    const [horizontal, tangent, z] = columns(
      createEnuOrientedDiscMatrix(origin, normal, 5)
    );
    expect(horizontal!.dot(axes.up)).toBeCloseTo(0, 12);
    expect(horizontal!.dot(normal)).toBeCloseTo(0, 12);
    expect(horizontal!.length()).toBeCloseTo(5, 12);
    expect(tangent!.length()).toBeCloseTo(5, 12);
    expect(z!.distanceTo(normal)).toBeLessThan(1e-12);
    expect(
      horizontal!.clone().cross(tangent!).normalize().distanceTo(normal)
    ).toBeLessThan(1e-12);
  });
  it("uses the local up fallback for a degenerate supplied normal", () => {
    const [x, y, z] = columns(
      createEnuOrientedDiscMatrix(origin, new Vector3(), 2)
    );
    expect(x!.distanceTo(axes.east.clone().multiplyScalar(2))).toBeLessThan(
      1e-12
    );
    expect(y!.distanceTo(axes.north.clone().multiplyScalar(2))).toBeLessThan(
      1e-12
    );
    expect(z!.distanceTo(axes.up)).toBeLessThan(1e-12);
  });
});

describe("small-inclination slope bearing without a compass limiter", () => {
  it.each(
    [1e-6, 1e-3].flatMap((inclination) =>
      [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4].map(
        (azimuth) => [inclination, azimuth] as const
      )
    )
  )(
    "keeps the horizontal tangent and slope-bearing axis at inclination %s, azimuth %s",
    (inclination, azimuth) => {
      const bearing = axes.east
        .clone()
        .multiplyScalar(Math.cos(azimuth))
        .addScaledVector(axes.north, Math.sin(azimuth));
      const normal = axes.up
        .clone()
        .multiplyScalar(Math.cos(inclination))
        .addScaledVector(bearing, Math.sin(inclination))
        .normalize();
      const [x, y, z] = columns(createEnuOrientedDiscMatrix(origin, normal, 1));
      // ECEF subtraction at tiny inclinations amplifies floating-point error;
      // this tolerance remains far below any user-visible angular difference.
      expect(Math.abs(x!.dot(axes.up))).toBeLessThan(1e-9);
      expect(Math.abs(x!.dot(normal))).toBeLessThan(1e-9);
      const horizontalY = y!
        .clone()
        .addScaledVector(axes.up, -y!.dot(axes.up))
        .normalize();
      expect(horizontalY.dot(bearing)).toBeLessThan(-1 + 1e-9);
      expect(x!.dot(y!)).toBeCloseTo(0, 12);
      expect(z!.distanceTo(normal)).toBeLessThan(1e-12);
      if (azimuth === Math.PI / 4 || azimuth === (3 * Math.PI) / 4) {
        expect(Math.abs(horizontalY.dot(axes.east))).toBeCloseTo(
          Math.SQRT1_2,
          8
        );
        expect(Math.abs(horizontalY.dot(axes.north))).toBeCloseTo(
          Math.SQRT1_2,
          8
        );
      }
    }
  );
});
