import { expect, it } from "vitest";
import { MercatorCoordinate } from "maplibre-gl";
import { cartographicToEcef, ecefToEnuOffset } from "@carma-geo/proj";
import { degToRadNumeric } from "@carma-units";

// Historical screenshot coordinates, not the subsequently moved story presets.
// See MESH_REFERENCE_DECISIONS.md / MESH-ERROR-BUDGET-20260915.
it("separates the rigid mount's horizontal residual from vertical sag in the historic top-down captures", () => {
  const origin = [7.16346125, 51.24111123] as [number, number];
  const phi = degToRadNumeric(origin[1]);
  const a = 6378137,
    e2 = 6.6943799901413165e-3,
    r = 6371008.8;
  const n = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
  const m = (a * (1 - e2)) / (1 - e2 * Math.sin(phi) ** 2) ** 1.5;
  const reference = MercatorCoordinate.fromLngLat(origin, 0);
  const units = reference.meterInMercatorCoordinateUnits();
  const root = cartographicToEcef(degToRadNumeric(origin[0]), phi, 0);
  const results = [
    {
      name: "Origin",
      lon: origin[0],
      lat: origin[1],
      mpp: 0.373,
      camera: 173090,
    },
    {
      name: "Cronenberg",
      lon: 7.12882,
      lat: 51.20541,
      mpp: 0.374,
      camera: 173230,
    },
    {
      name: "Cronenberg capture 2026-09-15",
      lon: 7.12825,
      lat: 51.20561,
      mpp: 0.3737217078065352,
      camera: 190358.6463828036,
    },
    {
      name: "Doenberg",
      lon: 7.1627,
      lat: 51.29902,
      mpp: 0.374,
      camera: 173230,
    },
  ].map((site) => {
    const rigid = ecefToEnuOffset(
      cartographicToEcef(
        degToRadNumeric(site.lon),
        degToRadNumeric(site.lat),
        0
      ),
      root
    );
    const exact = MercatorCoordinate.fromLngLat([site.lon, site.lat], 0);
    const planar = {
      east: (exact.x - reference.x) / units,
      north: -(exact.y - reference.y) / units,
    };
    const frozen = {
      east: r * Math.cos(phi) * degToRadNumeric(site.lon - origin[0]),
      north: r * degToRadNumeric(site.lat - origin[1]),
    };
    const affine = { east: (rigid.east * r) / n, north: (rigid.north * r) / m };
    const metric = {
      east: affine.east - rigid.east,
      north: affine.north - rigid.north,
    };
    const tangent = {
      east: frozen.east - affine.east,
      north: frozen.north - affine.north,
    };
    const mercator = {
      east: planar.east - frozen.east,
      north: planar.north - frozen.north,
    };
    const error = {
      east: planar.east - rigid.east,
      north: planar.north - rigid.north,
    };
    const rootMpp =
      (site.mpp * Math.cos(phi)) / Math.cos(degToRadNumeric(site.lat));
    expect(metric.east + tangent.east + mercator.east).toBeCloseTo(
      error.east,
      8
    );
    expect(metric.north + tangent.north + mercator.north).toBeCloseTo(
      error.north,
      8
    );
    const distance = Math.hypot(rigid.east, rigid.north);
    const sag = -rigid.up;
    const viewport = site.name.includes("2026-09-15")
      ? [1966, 889]
      : [1708, 809];
    const radius = (Math.hypot(...viewport) * site.mpp) / 2;
    const sagScreenBound = (radius * sag) / (site.camera - sag) / site.mpp;
    if (distance > 0) expect(sagScreenBound).toBeLessThan(0.03);
    return {
      site: site.name,
      distanceMeters: distance,
      deltaScalePercent:
        (Math.cos(phi) / Math.cos(degToRadNumeric(site.lat)) - 1) * 100,
      metricMismatchMeters: metric,
      localFrameNonlinearityMeters: tangent,
      latitudeScaleDriftMeters: mercator,
      exactMinusRigidMeters: error,
      screenVectorCssPixels: {
        x: error.east / rootMpp,
        y: -error.north / rootMpp,
      },
      totalCssPixels: Math.hypot(error.east, error.north) / rootMpp,
      pngPixelsPerCssPixel: 2,
      totalPngPixels: (Math.hypot(error.east, error.north) / rootMpp) * 2,
      verticalSagMeters: sag,
      verticalSagCssPixelBound: sagScreenBound,
    };
  });
  console.log("MESH_ERROR_BUDGET=" + JSON.stringify(results));
});
