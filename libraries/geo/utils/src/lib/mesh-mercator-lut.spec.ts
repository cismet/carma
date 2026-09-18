// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { MercatorCoordinate } from "maplibre-gl";
import { degToRad, radToDeg, type Degrees } from "@carma-units";
import {
  cartographicToEcef,
  ecefToCartographic,
  enuOffsetToEcef,
} from "@carma-geo/proj";
import {
  createMeshMercatorLut,
  projectMeshLocalToMercatorExact,
  sampleMeshMercatorLut,
} from "./mesh-mercator-lut";

const options = { longitudeDegrees: 7.18, latitudeDegrees: 51.26 };
describe("local ECEF to Mercator LUT", () => {
  it("matches MapLibre normalized coordinates and its metre scale", () => {
    const root = MercatorCoordinate.fromLngLat([
      options.longitudeDegrees,
      options.latitudeDegrees,
    ]);
    const ecefRoot = cartographicToEcef(
      degToRad(options.longitudeDegrees as Degrees),
      degToRad(options.latitudeDegrees as Degrees),
      0
    );
    const point = new Vector3(17000, 300, -21000);
    const carto = ecefToCartographic(
      enuOffsetToEcef(point.x, -point.z, point.y, ecefRoot)
    );
    const expected = MercatorCoordinate.fromLngLat(
      [radToDeg(carto.longitude), radToDeg(carto.latitude)],
      carto.altitude
    );
    const unit = root.meterInMercatorCoordinateUnits();
    const projected = projectMeshLocalToMercatorExact(options, point);
    expect(
      projected.distanceTo(
        new Vector3(
          (expected.x - root.x) / unit,
          expected.z / unit,
          (expected.y - root.y) / unit
        )
      )
    ).toBeLessThan(0.00001);
  });
  it("keeps sampled points in the 48 km domain within one centimetre", async () => {
    let yields = 0;
    const lut = await createMeshMercatorLut(options, async () => {
      yields++;
    });
    let maximumError = 0;
    for (let i = 0; i < 401; i++) {
      const point = new Vector3(
        -24000 + ((i * 1597) % 48001),
        (i % 7) * 100,
        -24000 + ((i * 2903) % 48001)
      );
      maximumError = Math.max(
        maximumError,
        sampleMeshMercatorLut(lut, point).distanceTo(
          projectMeshLocalToMercatorExact(options, point)
        )
      );
    }
    console.info(
      "Mercator LUT maximum 3D error metres",
      maximumError,
      "bytes",
      lut.baseDelta.byteLength * 2
    );
    expect(maximumError).toBeLessThan(0.01);
    expect(yields).toBeGreaterThan(0);
    expect(() => sampleMeshMercatorLut(lut, new Vector3(24001, 0, 0))).toThrow(
      RangeError
    );
    expect(() => sampleMeshMercatorLut(lut, new Vector3(0, -1, 0))).toThrow(
      RangeError
    );
    expect(
      sampleMeshMercatorLut(lut, new Vector3(24000, 600, 24000)).distanceTo(
        projectMeshLocalToMercatorExact(options, new Vector3(24000, 600, 24000))
      )
    ).toBeLessThan(0.01);
  });
  it("rejects global extents and projection-pole domains", async () => {
    await expect(
      createMeshMercatorLut({ ...options, halfExtentMeters: 1000000 })
    ).rejects.toThrow(RangeError);
    await expect(
      createMeshMercatorLut({ ...options, latitudeDegrees: 90 })
    ).rejects.toThrow(RangeError);
  });
  it("preserves in-place interpolation at interior points and domain edges", async () => {
    const lut = await createMeshMercatorLut(options, async () => {});
    for (const coordinates of [
      [0, 0, 0],
      [123.25, 350, -456.75],
      [-24000, 1000, -24000],
      [24000, 1000, 24000],
    ]) {
      const point = new Vector3().fromArray(coordinates);
      const expected = sampleMeshMercatorLut(lut, point);
      expect(sampleMeshMercatorLut(lut, point, point)).toBe(point);
      expect(point.toArray()).toEqual(expected.toArray());
    }
    for (const invalid of [NaN, Infinity, -Infinity]) {
      for (let axis = 0; axis < 3; axis++) {
        expect(() =>
          sampleMeshMercatorLut(lut, new Vector3().setComponent(axis, invalid))
        ).toThrow(RangeError);
      }
    }
  });
});
