// @vitest-environment node
import { describe, expect, test } from "vitest";
import { Matrix4, Vector3 } from "three";
import { MercatorCoordinate } from "maplibre-gl";
import { degToRadNumeric } from "@carma-units";
import { cartographicToEcef, ecefToEnuMatrix } from "./geodetic";
import { getCameraLocalMercatorFit } from "./camera-local-mercator-fit";

const ROOT = [7.15, 51.26] as const;
const FAR = [7.2496096, 51.314393] as const;
const rootEnu = ecefToEnuMatrix(
  cartographicToEcef(degToRadNumeric(ROOT[0]), degToRadNumeric(ROOT[1]), 0)
);
const rootScenePoint = (point: readonly [number, number], height = 0) => {
  const enu = cartographicToEcef(
    degToRadNumeric(point[0]),
    degToRadNumeric(point[1]),
    height
  ).applyMatrix4(rootEnu);
  return new Vector3(enu.x, enu.z, -enu.y);
};
const exactMercator = (point: readonly [number, number], height = 0) => {
  const root = MercatorCoordinate.fromLngLat([...ROOT], 0);
  const fit = MercatorCoordinate.fromLngLat([...point], height);
  const meter = root.meterInMercatorCoordinateUnits();
  return new Vector3(
    (fit.x - root.x) / meter,
    fit.z / meter,
    (fit.y - root.y) / meter
  );
};

describe("camera-local Mercator fit", () => {
  test("metric-corrected east and north match Mercator near the far anchor", () => {
    const transform = getCameraLocalMercatorFit(ROOT, FAR, {
      correctEllipsoidMetric: true,
    });
    for (const point of [
      FAR,
      [FAR[0] + 0.0001, FAR[1]],
      [FAR[0], FAR[1] + 0.0001],
    ] as const) {
      expect(
        rootScenePoint(point)
          .applyMatrix4(transform)
          .distanceTo(exactMercator(point))
      ).toBeLessThan(0.01);
    }
  });
  test("root fit is identity", () => {
    const actual = getCameraLocalMercatorFit(ROOT, ROOT).elements;
    new Matrix4().elements.forEach((value, index) =>
      expect(actual[index]).toBeCloseTo(value, 7)
    );
  });
  test.each([true, false])(
    "far zero-height anchor matches Mercator (scale %s)",
    (correctScale) => {
      const transformed = rootScenePoint(FAR).applyMatrix4(
        getCameraLocalMercatorFit(ROOT, FAR, { correctScale })
      );
      // Shared mean radius and MapLibre's rounded mean radius differ by 2.86 cm
      // over Earth's radius: less than 0.1 mm for these local scene coordinates.
      const expected = exactMercator(FAR);
      expect(transformed.x).toBeCloseTo(expected.x, 3);
      expect(transformed.y).toBeCloseTo(0, 7);
      expect(transformed.z).toBeCloseTo(expected.z, 3);
    }
  );
  test.each([true, false])(
    "local unit up is vertical with requested scale %s",
    (correctScale) => {
      const transform = getCameraLocalMercatorFit(ROOT, FAR, { correctScale });
      const zero = rootScenePoint(FAR).applyMatrix4(transform);
      const up = rootScenePoint(FAR, 1).applyMatrix4(transform).sub(zero);
      const scale = correctScale
        ? Math.cos(degToRadNumeric(ROOT[1])) / Math.cos(degToRadNumeric(FAR[1]))
        : 1;
      expect(up.x).toBeCloseTo(0, 7);
      expect(up.z).toBeCloseTo(0, 7);
      expect(up.y).toBeCloseTo(scale, 7);
    }
  );
  test("invalid coordinates fail closed", () => {
    expect(() => getCameraLocalMercatorFit(ROOT, [0, 90])).toThrow(RangeError);
    expect(() => getCameraLocalMercatorFit(ROOT, [NaN, 0])).toThrow(RangeError);
    expect(() => getCameraLocalMercatorFit([179, 0], [-179, 0])).toThrow(
      RangeError
    );
  });
});
