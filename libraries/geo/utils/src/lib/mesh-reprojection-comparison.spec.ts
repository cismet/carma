// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { cartographicToEcef, ecefToEnuMatrix } from "@carma-geo/proj";
import { compareMeshReprojection } from "./mesh-reprojection-comparison";
import {
  createMeshLocalProjection,
  createMeshMercatorLut,
  getMeshReprojectionCameraFit,
  MESH_PROJECTION_METHOD,
  MESH_PROJECTION_ACCURACY,
  MESH_PROJECTION_SAMPLING,
  MESH_REPROJECTION_MODE,
  sampleMeshMercatorLut,
} from "./mesh-mercator-lut";

const root = [7.163461249942009, 51.24111123027258] as const;
const options = { longitudeDegrees: root[0], latitudeDegrees: root[1] };
const points = Array.from(
  { length: 603 },
  (_, i) =>
    new Vector3(
      -23000 + Math.floor(i / 3) * 230,
      (i % 3) * 300,
      21000 * Math.sin(Math.floor(i / 3))
    )
);

describe("mesh reprojection comparison contract", () => {
  it.each(Object.entries(MESH_PROJECTION_ACCURACY))(
    "%s profile meets the position target at every cell's interior probes",
    async (_name, profile) => {
      const lut = await createMeshMercatorLut(
        { ...options, gridStepMeters: profile.gridStepMeters },
        async () => {}
      );
      const direct = createMeshLocalProjection(options);
      const p = new Vector3(),
        actual = new Vector3(),
        expected = new Vector3();
      let maximum = 0,
        roundedMaximum = 0;
      const offsets = [
        [0.5, 0.5],
        [0.2, 0.7],
        [0.8, 0.3],
        [0, 0],
        [1, 1],
      ];
      for (let row = 0; row < lut.size - 1; row++)
        for (let col = 0; col < lut.size - 1; col++)
          for (const [x, z] of offsets)
            for (const up of [0, 250, 500, 750, 1000]) {
              p.set(
                -24000 + (col + x) * lut.stepMeters,
                up,
                -24000 + (row + z) * lut.stepMeters
              );
              direct(p.x, p.y, p.z, expected);
              sampleMeshMercatorLut(lut, p, actual);
              maximum = Math.max(maximum, actual.distanceTo(expected));
              actual.set(
                Math.fround(actual.x),
                Math.fround(actual.y),
                Math.fround(actual.z)
              );
              roundedMaximum = Math.max(
                roundedMaximum,
                actual.distanceTo(expected)
              );
            }
      expect(roundedMaximum).toBeLessThan(profile.targetMeters);
      console.info(
        "PROFILE",
        _name,
        JSON.stringify({
          maximum,
          roundedMaximum,
          bytes:
            lut.baseDelta.byteLength + lut.heightDerivativeDelta.byteLength,
          points: (lut.size - 1) ** 2 * 25,
        })
      );
    }
  );
  it.each(Object.values(MESH_REPROJECTION_MODE))(
    "%s is finite at the root and across the local domain",
    async (mode) => {
      const result = await compareMeshReprojection(
        mode,
        options,
        root,
        points,
        async () => {}
      );
      expect(Number.isFinite(result.maximumErrorMeters)).toBe(true);
      expect(result.sampleCount).toBe(603);
      if (mode === MESH_REPROJECTION_MODE.ELLIPSOID_LUT)
        expect(result.maximumErrorMeters).toBeLessThan(0.01);
      if (mode === MESH_REPROJECTION_MODE.ELLIPSOID_EXACT)
        expect(result.maximumErrorMeters).toBe(0);
      console.info(
        mode,
        "max sample error mm",
        (result.maximumErrorMeters * 1000).toFixed(3)
      );
    }
  );
  it.each(Object.values(MESH_PROJECTION_METHOD))(
    "%s retains the anchor and has continuous LUT boundaries",
    async (method) => {
      const direct = createMeshLocalProjection({ ...options, method });
      expect(direct(0, 0, 0).length()).toBeLessThan(1e-6);
      const lut = await createMeshMercatorLut(
        { ...options, method },
        async () => {}
      );
      for (const east of [0, 250, 17500]) {
        const before = sampleMeshMercatorLut(
          lut,
          new Vector3(east - 1e-5, 300, 250)
        );
        const after = sampleMeshMercatorLut(
          lut,
          new Vector3(east + 1e-5, 300, 250)
        );
        expect(before.distanceTo(after)).toBeLessThan(3e-5);
      }
    }
  );
  it.each([{ camera: root }, { camera: [7.301936111, 51.23815] as const }])(
    "camera metric and AEQD preserve the horizontal fit anchor at $camera",
    ({ camera }) => {
      const rad = Math.PI / 180;
      const p = cartographicToEcef(
        camera[0] * rad,
        camera[1] * rad,
        0
      ).applyMatrix4(
        ecefToEnuMatrix(cartographicToEcef(root[0] * rad, root[1] * rad, 0))
      );
      p.set(p.x, p.z, -p.y);
      const expected = createMeshLocalProjection(options)(p.x, p.y, p.z);
      for (const mode of [
        MESH_REPROJECTION_MODE.CAMERA_METRIC,
        MESH_REPROJECTION_MODE.AEQD_CAMERA,
      ]) {
        const input =
          mode === MESH_REPROJECTION_MODE.AEQD_CAMERA
            ? createMeshLocalProjection({
                ...options,
                method: MESH_PROJECTION_METHOD.AEQD,
              })(p.x, p.y, p.z)
            : p.clone();
        expect(
          input
            .applyMatrix4(getMeshReprojectionCameraFit(mode, options, camera))
            .distanceTo(expected)
        ).toBeLessThan(0.0001);
      }
    }
  );
  it("direct reference allocates no lookup textures", async () => {
    const lut = await createMeshMercatorLut({
      ...options,
      sampling: MESH_PROJECTION_SAMPLING.EXACT,
    });
    expect(
      lut.baseDelta.byteLength + lut.heightDerivativeDelta.byteLength
    ).toBe(0);
    expect(
      sampleMeshMercatorLut(lut, points[99]).distanceTo(
        createMeshLocalProjection(options)(
          points[99].x,
          points[99].y,
          points[99].z
        )
      )
    ).toBe(0);
  });
  it("rejects invalid camera fits and propagates cancelled lookup construction", async () => {
    expect(() =>
      getMeshReprojectionCameraFit(
        MESH_REPROJECTION_MODE.AEQD_CAMERA,
        options,
        [NaN, 0]
      )
    ).toThrow("finite");
    expect(() =>
      getMeshReprojectionCameraFit(
        MESH_REPROJECTION_MODE.AEQD_CAMERA,
        options,
        [40, 51]
      )
    ).toThrow("domain");
    await expect(
      createMeshMercatorLut(options, async () => {
        throw new Error("cancelled");
      })
    ).rejects.toThrow("cancelled");
  });
});
