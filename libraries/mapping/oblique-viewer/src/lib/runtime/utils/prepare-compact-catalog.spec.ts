import { beforeEach, describe, expect, it, vi } from "vitest";
import { Matrix3, Matrix4, Vector3 } from "three";
import {
  createRasterEcefProjector,
  ecefToCartographic,
  ecefToEnuMatrix,
  getGcg2016HeightAnomalies,
  getProj4Converter,
} from "@carma-geo/proj";
import { radToDegNumeric } from "@carma-units";
import type { CompactCatalog } from "../../core/utils/compact-catalog";
import { calculateUTMConvergence } from "../../core/utils/utmConvergence";
import { prepareCompactCatalog } from "./prepare-compact-catalog";
vi.mock("@carma-geo/proj", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getGcg2016HeightAnomalies: vi.fn(),
}));
const anomaly = vi.mocked(getGcg2016HeightAnomalies);
const project = createRasterEcefProjector();
const fixture = (range: number | null = 800) => {
  const eye = project(7.2, 51.25, 1042, new Vector3());
  const r = new Matrix3().setFromMatrix4(ecefToEnuMatrix(eye)).elements;
  const rows: [number, number, number][] = [
    [r[0], r[3], r[6]],
    [r[1], r[4], r[7]],
    [r[2], r[5], r[8]],
  ];
  const catalog = {
    schemaVersion: 1,
    seriesId: "physical-camera",
    conventions: { horizontalCrs: "EPSG:25832", verticalDatum: "dhhn2016" },
    cameras: {
      c: {
        sourceId: "c",
        widthPx: 101,
        heightPx: 81,
        focalLengthMm: 10,
        imageMmToPixelAffine: [
          [10, 0, 47],
          [0, -10, 43],
        ],
        mountRotationDeg: 0,
      },
    },
    images: {
      photo: {
        cameraId: "c",
        cameraEcefMeters: eye.toArray(),
        rotationMatrixRows: rows,
        sensorGroundRangeMeters: range,
      },
    },
  } as CompactCatalog;
  return { catalog, eye, rows };
};
beforeEach(() => {
  vi.resetAllMocks();
  anomaly.mockImplementation(async (coordinates) => coordinates.map(() => 42));
});
describe("physical compact catalogue preparation", () => {
  it("uses calibrated sensor-center ECEF ray, with independent geoid correction at eye and hit", async () => {
    const { catalog, eye, rows } = fixture();
    anomaly.mockResolvedValueOnce([42, 43]);
    const original = JSON.stringify(catalog),
      result = await prepareCompactCatalog(catalog);
    const direction = new Vector3(...rows[0])
      .multiplyScalar(0.3)
      .addScaledVector(new Vector3(...rows[1]), 0.3)
      .addScaledVector(new Vector3(...rows[2]), -10)
      .normalize();
    const expected = eye.clone().addScaledVector(direction, 800),
      center = result.centers.get("photo")!;
    expect(new Vector3(...center.ecefMeters).distanceTo(expected)).toBeLessThan(
      1e-8
    );
    const cartographic = ecefToCartographic(expected);
    expect(center.heightMeters).toBeCloseTo(cartographic.altitude - 43, 7);
    expect(center.longitude).toBeCloseTo(
      radToDegNumeric(cartographic.longitude),
      10
    );
    expect(center.latitude).toBeCloseTo(
      radToDegNumeric(cartographic.latitude),
      10
    );
    expect(
      Math.abs(result.metadata.images.photo.positionM[2] - 1000)
    ).toBeLessThan(1e-6);
    expect(JSON.stringify(catalog)).toBe(original);
    expect(anomaly).toHaveBeenCalledTimes(1);
    expect(anomaly.mock.calls[0][0]).toHaveLength(2);
    const xy = getProj4Converter("EPSG:4326", "EPSG:25832").forward([
      7.2, 51.25,
    ]);
    expect(result.metadata.images.photo.positionM[0]).toBeCloseTo(xy[0], 6);
    expect(result.metadata.images.photo.positionM[1]).toBeCloseTo(xy[1], 6);
    expect(
      project(
        center.longitude,
        center.latitude,
        center.heightMeters + 43,
        new Vector3()
      ).distanceTo(expected)
    ).toBeLessThan(1e-6);
  });
  it("cancels the old projector convergence factor while preserving physical ECEF orientation", async () => {
    const { catalog, eye, rows } = fixture();
    const result = await prepareCompactCatalog(catalog);
    const r = result.metadata.images.photo.rotationMatrixRows;
    const recovered = new Matrix3()
      .set(...r[0], ...r[1], ...r[2])
      .multiply(
        new Matrix3().setFromMatrix4(
          new Matrix4().makeRotationZ(calculateUTMConvergence(7.2, 51.25))
        )
      )
      .multiply(new Matrix3().setFromMatrix4(ecefToEnuMatrix(eye)));
    const expected = new Matrix3().set(...rows[0], ...rows[1], ...rows[2]);
    recovered.elements.forEach((v, i) =>
      expect(v).toBeCloseTo(expected.elements[i], 12)
    );
  });
  it("does not invent a center or request a ground correction for a missing DEM range", async () => {
    const { catalog } = fixture(null);
    const result = await prepareCompactCatalog(catalog);
    expect(result.centers.size).toBe(0);
    expect(anomaly.mock.calls[0][0]).toHaveLength(1);
    expect(result.metadata.images.photo.sensorGroundRangeMeters).toBeNull();
  });
  it("honors cancellation before preparation and after the asynchronous geoid read", async () => {
    const first = new AbortController();
    first.abort();
    await expect(
      prepareCompactCatalog(fixture().catalog, first.signal)
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(anomaly).not.toHaveBeenCalled();
    let resolve!: (v: number[]) => void;
    anomaly.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        })
    );
    const second = new AbortController(),
      pending = prepareCompactCatalog(fixture().catalog, second.signal);
    second.abort();
    resolve([42, 42]);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
