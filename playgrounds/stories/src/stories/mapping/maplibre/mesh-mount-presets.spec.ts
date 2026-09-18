import { Matrix4, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import {
  MESH_MOUNT_BOUNDS,
  MESH_MOUNT_COMPARISON_VIEWS,
  MESH_MOUNT_EDGE_FRACTION,
  MESH_MOUNT_MODEL_PROBES,
  MESH_MOUNT_MODEL_RESIDUALS,
  MESH_MOUNT_PRESETS,
  MESH_MOUNT_REFERENCE_FOV_DEGREES,
  MESH_MOUNT_ROOT,
  MESH_MOUNT_VIEW,
  getMeshMountProjectionDiagnostics,
} from "./mesh-mount-presets";

describe("mesh mount metadata presets", () => {
  it("uses the root transform translation, not the OBB center or a map preset", () => {
    const root = MESH_MOUNT_PRESETS[MESH_MOUNT_VIEW.ROOT];
    expect(root.ecef).toEqual([3970046.914097, 498961.576644, 4950543.333325]);
    expect(root.lngLat[0]).toBeCloseTo(7.16346125, 7);
    expect(root.lngLat[1]).toBeCloseTo(51.24111123, 7);
    expect(root.wgs84HeightMeters).toBeCloseTo(207.6, 2);
    expect(root.northOfRootMeters).toBeCloseTo(0, 8);
    expect(root.mercatorScaleFromRoot).toBe(1);
  });

  it("uses the north half-axis, not the differently ordered height half-axis", () => {
    const inverse = new Matrix4().fromArray(MESH_MOUNT_ROOT.transform).invert();
    const north = MESH_MOUNT_MODEL_PROBES[MESH_MOUNT_VIEW.NORTH];
    const south = MESH_MOUNT_MODEL_PROBES[MESH_MOUNT_VIEW.SOUTH];
    const northLocal = new Vector3()
      .fromArray(north.ecef)
      .applyMatrix4(inverse);
    const southLocal = new Vector3()
      .fromArray(south.ecef)
      .applyMatrix4(inverse);
    expect(northLocal.y).toBeCloseTo(
      MESH_MOUNT_ROOT.box[1] + 8620.49609375 * MESH_MOUNT_EDGE_FRACTION,
      6
    );
    expect(southLocal.y).toBeCloseTo(
      MESH_MOUNT_ROOT.box[1] - 8620.49609375 * MESH_MOUNT_EDGE_FRACTION,
      6
    );
    expect(northLocal.z).toBeCloseTo(MESH_MOUNT_ROOT.box[2], 6);
    expect(southLocal.z).toBeCloseTo(MESH_MOUNT_ROOT.box[2], 6);
    expect(north.northOfRootMeters).toBeGreaterThan(8000);
    expect(south.northOfRootMeters).toBeLessThan(-8000);
    expect(north.mercatorScaleFromRoot).toBeGreaterThan(1);
    expect(south.mercatorScaleFromRoot).toBeLessThan(1);
  });

  it("separates sourced neighbourhood views from the mathematical OBB probes", () => {
    const north = MESH_MOUNT_PRESETS[MESH_MOUNT_VIEW.NORTH];
    const south = MESH_MOUNT_PRESETS[MESH_MOUNT_VIEW.SOUTH];
    expect(north.lngLat[0]).toBeCloseTo(7.2496096, 7);
    expect(north.lngLat[1]).toBeCloseTo(51.314393, 7);
    expect(south.lngLat[0]).toBeCloseTo(7.12825, 7);
    expect(south.lngLat[1]).toBeCloseTo(51.20561, 7);
    expect(north.locationSource).toContain("51.314393,7.2496096");
    expect(south.locationSource).toContain("kuladig.de");
    expect(north.lngLat).not.toEqual(
      MESH_MOUNT_MODEL_PROBES[MESH_MOUNT_VIEW.NORTH].lngLat
    );
    expect(south.lngLat).not.toEqual(
      MESH_MOUNT_MODEL_PROBES[MESH_MOUNT_VIEW.SOUTH].lngLat
    );
  });

  it("keeps all view presets inside the transformed geographic root envelope", () => {
    const [west, south, east, north] = MESH_MOUNT_BOUNDS;
    for (const preset of Object.values(MESH_MOUNT_PRESETS)) {
      expect(preset.lngLat[0]).toBeGreaterThan(west);
      expect(preset.lngLat[0]).toBeLessThan(east);
      expect(preset.lngLat[1]).toBeGreaterThan(south);
      expect(preset.lngLat[1]).toBeLessThan(north);
    }
    expect(north - south).toBeGreaterThan(0.15);
    expect(east - west).toBeGreaterThan(0.3);
  });

  it("orders the requested sites Center/North, Stoffelsberg/South", () => {
    expect(MESH_MOUNT_COMPARISON_VIEWS).toEqual([
      MESH_MOUNT_VIEW.ROOT,
      MESH_MOUNT_VIEW.NORTH,
      MESH_MOUNT_VIEW.FAR,
      MESH_MOUNT_VIEW.SOUTH,
    ]);
    const far = MESH_MOUNT_PRESETS[MESH_MOUNT_VIEW.FAR];
    expect(far.lngLat[0]).toBeCloseTo(7.301936111, 7);
    expect(far.lngLat[1]).toBeCloseTo(51.23815, 7);
    expect(far.lngLat).not.toEqual(
      MESH_MOUNT_MODEL_PROBES[MESH_MOUNT_VIEW.FAR].lngLat
    );
  });

  it.each([
    [MESH_MOUNT_VIEW.ROOT, 0, 0],
    [MESH_MOUNT_VIEW.NORTH, 2.061747, 5.695818],
    [MESH_MOUNT_VIEW.SOUTH, 10.852445, 4.83407],
  ] as const)(
    "records the %s coordinate-model residual, not a measured mesh error",
    (view, horizontalMeters, upMeters) => {
      expect(MESH_MOUNT_MODEL_RESIDUALS[view].horizontalMeters).toBeCloseTo(
        horizontalMeters,
        5
      );
      expect(MESH_MOUNT_MODEL_RESIDUALS[view].upMeters).toBeCloseTo(
        upMeters,
        5
      );
    }
  );
});

describe("mesh mount narrow-perspective reference", () => {
  const viewport = { width: 1600, height: 800, groundMetersPerPixel: 0.375 };

  it("retains the ground footprint while moving the camera out for narrow FOV", () => {
    const narrow = getMeshMountProjectionDiagnostics({
      ...viewport,
      verticalFovDegrees: MESH_MOUNT_REFERENCE_FOV_DEGREES,
    });
    const normal = getMeshMountProjectionDiagnostics({
      ...viewport,
      verticalFovDegrees: 36.87,
    });
    expect(narrow.footprintWidthMeters).toBe(normal.footprintWidthMeters);
    expect(narrow.footprintHeightMeters).toBe(normal.footprintHeightMeters);
    expect(narrow.cameraHeightMeters).toBeGreaterThan(170000);
    expect(normal.cameraHeightMeters).toBeLessThan(451);
    expect(narrow.reliefParallaxBoundMeters).toBeGreaterThan(0);
    expect(narrow.reliefParallaxBoundMeters).toBeLessThan(2);
    expect(normal.reliefParallaxBoundMeters).toBeNull();
  });

  it("bounds radial relief displacement without claiming true orthography", () => {
    const result = getMeshMountProjectionDiagnostics({
      ...viewport,
      verticalFovDegrees: 0.5,
      reliefEnvelopeMeters: 300,
    });
    const cornerRadius = Math.hypot(600, 300) / 2;
    for (const height of [-300, 0, 200, 300]) {
      const displacement =
        (cornerRadius * Math.abs(height)) /
        (result.cameraHeightMeters - height);
      expect(displacement).toBeLessThanOrEqual(
        result.reliefParallaxBoundMeters! + 1e-10
      );
    }
    expect(result.reliefParallaxBoundPixels).toBeCloseTo(
      result.reliefParallaxBoundMeters! / viewport.groundMetersPerPixel,
      10
    );
  });
});
