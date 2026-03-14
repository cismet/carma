/* eslint-disable carma/allowlist-cesium-api-(allowlist) */
import { describe, expect, it } from "vitest";
import { Cartesian3, Cartographic, Ellipsoid } from "../cesium";
import {
  getCartographicAndHeadingPitchRangeFromPoints,
  getPointsFromCartographicAndHeadingPitchRange,
} from "./Transforms";

const toCartesian = (
  longitudeDeg: number,
  latitudeDeg: number,
  heightM: number
): Cartesian3 =>
  Cartographic.toCartesian(
    Cartographic.fromDegrees(longitudeDeg, latitudeDeg, heightM),
    Ellipsoid.WGS84,
    new Cartesian3()
  );

describe("Transforms CartographicHeadingPitchRange round-trip", () => {
  it("round-trips camera/reference points (urban-scale)", () => {
    const cameraPosition = toCartesian(7.1504, 51.2562, 980);
    const referencePoint = toCartesian(7.1548, 51.2586, 210);

    const encoded = getCartographicAndHeadingPitchRangeFromPoints(
      cameraPosition,
      referencePoint
    );
    expect(encoded).not.toBeNull();

    const decoded = getPointsFromCartographicAndHeadingPitchRange(encoded!);
    expect(decoded).not.toBeNull();

    expect(
      Cartesian3.distance(decoded!.referencePointECEF, referencePoint)
    ).toBeLessThan(0.001);
    expect(Cartesian3.distance(decoded!.cameraPositionECEF, cameraPosition)).toBeLessThan(
      0.05
    );
  });

  it("round-trips camera/reference points (long-range)", () => {
    const cameraPosition = toCartesian(7.102, 51.224, 1450);
    const referencePoint = toCartesian(7.241, 51.319, 170);

    const encoded = getCartographicAndHeadingPitchRangeFromPoints(
      cameraPosition,
      referencePoint
    );
    expect(encoded).not.toBeNull();

    const decoded = getPointsFromCartographicAndHeadingPitchRange(encoded!);
    expect(decoded).not.toBeNull();

    expect(
      Cartesian3.distance(decoded!.referencePointECEF, referencePoint)
    ).toBeLessThan(0.001);
    expect(Cartesian3.distance(decoded!.cameraPositionECEF, cameraPosition)).toBeLessThan(
      0.2
    );
  });
});
