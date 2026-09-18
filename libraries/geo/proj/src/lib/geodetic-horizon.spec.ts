import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import {
  cartographicToEcef,
  projectEllipsoidHorizon,
  WGS84_A,
  WGS84_B,
} from "./geodetic";

const input = {
  longitude: 0.12,
  latitude: 0.89,
  height: 1200,
  bearing: 0.7,
  pitch: Math.PI / 2,
  verticalFov: 0.6,
  aspect: 1.7,
};

describe("exact WGS84 horizon projection", () => {
  it("has no external limb at or below the ellipsoid", () => {
    for (const height of [0, -10, NaN])
      expect(projectEllipsoidHorizon({ ...input, height })).toBeNull();
  });

  it.each([0, 0.6, Math.PI / 2])(
    "projects only positive-distance tangent rays at pitch %s",
    (pitch) => {
      const result = projectEllipsoidHorizon({ ...input, pitch })!;
      const { longitude: lon, latitude: lat, bearing } = input;
      const up = new Vector3(
        Math.cos(lat) * Math.cos(lon),
        Math.cos(lat) * Math.sin(lon),
        Math.sin(lat)
      );
      const east = new Vector3(-Math.sin(lon), Math.cos(lon), 0);
      const north = new Vector3().crossVectors(up, east);
      const heading = north
        .clone()
        .multiplyScalar(Math.cos(bearing))
        .addScaledVector(east, Math.sin(bearing));
      const right = east
        .clone()
        .multiplyScalar(Math.cos(bearing))
        .addScaledVector(north, -Math.sin(bearing));
      const forward = heading
        .clone()
        .multiplyScalar(Math.sin(pitch))
        .addScaledVector(up, -Math.cos(pitch));
      const screenUp = heading
        .clone()
        .multiplyScalar(Math.cos(pitch))
        .addScaledVector(up, Math.sin(pitch));
      const scale = new Vector3(1 / WGS84_A, 1 / WGS84_A, 1 / WGS84_B);
      const q = cartographicToEcef(lon, lat, input.height).multiply(scale);
      const c = q.lengthSq() - 1;
      expect(result.segments.flat().length).toBeGreaterThan(100);
      for (const { x, y } of result.segments.flat()) {
        const d = forward
          .clone()
          .addScaledVector(
            right,
            (2 * x - 1) * Math.tan(input.verticalFov / 2) * input.aspect
          )
          .addScaledVector(
            screenUp,
            (1 - 2 * y) * Math.tan(input.verticalFov / 2)
          )
          .normalize()
          .multiply(scale);
        const a = d.lengthSq();
        const b = q.dot(d);
        expect(-b / a).toBeGreaterThan(0);
        expect(Math.abs(b * b - a * c) / (a * c)).toBeLessThan(1e-8);
        expect(
          q
            .clone()
            .addScaledVector(d, -b / a)
            .lengthSq()
        ).toBeCloseTo(1, 12);
      }
    }
  );

  it("matches the equatorial eastward analytic tangent depression", () => {
    const result = projectEllipsoidHorizon({
      ...input,
      latitude: 0,
      bearing: Math.PI / 2,
    })!;
    expect(result.centerDepression).toBeCloseTo(
      Math.acos(WGS84_A / (WGS84_A + input.height)),
      11
    );
    const high = projectEllipsoidHorizon({ ...input, height: 12000 })!;
    expect(high.centerDepression).toBeGreaterThan(result.centerDepression);
  });

  it("preserves depression while changing projection aspect and FOV", () => {
    const base = projectEllipsoidHorizon(input)!;
    const wide = projectEllipsoidHorizon({
      ...input,
      aspect: input.aspect * 2,
    })!;
    const tele = projectEllipsoidHorizon({ ...input, verticalFov: 0.3 })!;
    expect(wide.centerDepression).toBe(base.centerDepression);
    expect(tele.centerDepression).toBe(base.centerDepression);
    const p = base.segments[0][0];
    expect(wide.segments[0][0].x - 0.5).toBeCloseTo((p.x - 0.5) / 2, 10);
    expect(tele.segments[0][0].y - 0.5).toBeCloseTo(
      ((p.y - 0.5) * Math.tan(0.3)) / Math.tan(0.15),
      10
    );
  });

  it("resolves the ellipsoid's directional curvature", () => {
    const north = projectEllipsoidHorizon({
      ...input,
      latitude: 0,
      bearing: 0,
    })!;
    const east = projectEllipsoidHorizon({
      ...input,
      latitude: 0,
      bearing: Math.PI / 2,
    })!;
    expect(north.centerDepression).toBeGreaterThan(east.centerDepression);
  });
});
