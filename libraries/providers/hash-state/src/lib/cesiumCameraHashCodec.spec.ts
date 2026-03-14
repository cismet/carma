import { describe, expect, it } from "vitest";
import type { SceneStateSnapshot } from "@carma/types";
import {
  decodeCesiumCameraHashSnapshot,
  encodeCesiumCameraHashSnapshot,
  readCesiumMapLibreCompatHashParams,
  readCesiumMapLibreCameraCentricHashParams,
  readCesiumCameraHashSnapshotFromSceneState,
} from "./cesiumCameraHashCodec";

const RAD_TO_DEG = 180 / Math.PI;

describe("cesiumCameraHashCodec", () => {
  it("encodes and decodes camera hash snapshots", () => {
    const encoded = encodeCesiumCameraHashSnapshot({
      anchor: {
        lngDeg: 7.1543214,
        latDeg: 51.2567891,
        heightM: 432.12,
        source: "screen-center",
      },
      orientation: {
        headingDeg: 201.25,
        pitchDeg: -57.8,
        rollDeg: 0,
        fovDeg: 52.5,
        rangeM: 321.45,
      },
    });

    const decoded = decodeCesiumCameraHashSnapshot(encoded);
    expect(decoded).toEqual({
      anchor: {
        lngDeg: 7.1543214,
        latDeg: 51.2567891,
        heightM: 432.12,
        source: "screen-center",
      },
      orientation: {
        headingDeg: 201.25,
        pitchDeg: -57.8,
        rollDeg: 0,
        fovDeg: 52.5,
        rangeM: 321.45,
      },
    });
  });

  it("builds object-centric snapshot from scene-state using orbit point", () => {
    const sceneState: SceneStateSnapshot = {
      frameNumber: 42,
      timestampMs: 1234,
      camera: {
        worldPosition: { x: 1, y: 2, z: 3 },
        cartographic: {
          longitude: 0.12,
          latitude: 0.91,
          altitude: 900,
        },
        headingRad: 0.35,
        pitchRad: -1.05,
        rollRad: 0.02,
        fovRad: 0.8,
      },
      orbitPoint: {
        worldPosition: { x: 4, y: 5, z: 6 },
        cartographic: {
          longitude: 0.2,
          latitude: 0.8,
          altitude: 180,
        },
        source: "screen-center-depth",
      },
    };

    const snapshot = readCesiumCameraHashSnapshotFromSceneState({
      sceneState,
      anchorMode: "screen-center",
      fallbackHeightM: 200,
    });

    expect(snapshot).not.toBeNull();
    expect(snapshot?.anchor.source).toBe("screen-center");
    expect(snapshot?.anchor.heightM).toBe(180);
    expect(snapshot?.anchor.lngDeg ?? 0).toBeCloseTo(0.2 * RAD_TO_DEG, 7);
    expect(snapshot?.anchor.latDeg ?? 0).toBeCloseTo(0.8 * RAD_TO_DEG, 7);
    expect(snapshot?.orientation.headingDeg ?? 0).toBeCloseTo(
      0.35 * RAD_TO_DEG,
      7
    );
    expect(snapshot?.orientation.pitchDeg ?? 0).toBeCloseTo(
      -1.05 * RAD_TO_DEG,
      7
    );
    expect(snapshot?.orientation.rollDeg ?? 0).toBeCloseTo(0.02 * RAD_TO_DEG, 7);
    expect(snapshot?.orientation.fovDeg ?? 0).toBeCloseTo(0.8 * RAD_TO_DEG, 7);
  });

  it("projects snapshot to maplibre-compatible hash params with altitude", () => {
    const sceneState: SceneStateSnapshot = {
      frameNumber: 7,
      timestampMs: 1000,
      camera: {
        worldPosition: { x: 0, y: 0, z: 1000 },
        cartographic: {
          longitude: 0,
          latitude: 0,
          altitude: 1000,
        },
        headingRad: 0.2,
        pitchRad: -Math.PI / 3,
        rollRad: 0,
        fovRad: Math.PI / 3,
      },
      orbitPoint: {
        worldPosition: { x: 0, y: 0, z: 0 },
        cartographic: {
          longitude: 0,
          latitude: 0,
          altitude: 120,
        },
        source: "screen-center-depth",
      },
    };

    const snapshot = readCesiumCameraHashSnapshotFromSceneState({
      sceneState,
      anchorMode: "screen-center",
      fallbackHeightM: 200,
    });
    expect(snapshot).not.toBeNull();

    const mapLibreParams = readCesiumMapLibreCompatHashParams({
      snapshot: snapshot!,
      sceneState,
      scene: {
        canvas: {
          clientWidth: 1000,
          clientHeight: 1000,
        },
      },
      includeAltitude: true,
    });

    expect(mapLibreParams.lng).toBeCloseTo(0, 7);
    expect(mapLibreParams.lat).toBeCloseTo(0, 7);
    expect(mapLibreParams.altitude).toBe(120);
    expect(mapLibreParams.bearing ?? 0).toBeCloseTo(0.2 * RAD_TO_DEG, 7);
    expect(mapLibreParams.pitch).toBe(30);
    expect(mapLibreParams.zoom ?? 0).toBeCloseTo(17.05, 2);
  });

  it("projects maplibre camera-centric hash params from camera cartographic position", () => {
    const sceneState: SceneStateSnapshot = {
      frameNumber: 7,
      timestampMs: 1000,
      camera: {
        worldPosition: { x: 0, y: 0, z: 1000 },
        cartographic: {
          longitude: 0.3,
          latitude: 0.6,
          altitude: 1100,
        },
        headingRad: 0.2,
        pitchRad: -Math.PI / 3,
        rollRad: 0,
        fovRad: Math.PI / 3,
      },
      orbitPoint: {
        worldPosition: { x: 0, y: 0, z: 0 },
        cartographic: {
          longitude: 0.2,
          latitude: 0.8,
          altitude: 120,
        },
        source: "screen-center-depth",
      },
    };

    const snapshot = readCesiumCameraHashSnapshotFromSceneState({
      sceneState,
      anchorMode: "screen-center",
      fallbackHeightM: 200,
    });
    expect(snapshot).not.toBeNull();

    const mapLibreParams = readCesiumMapLibreCameraCentricHashParams({
      snapshot: snapshot!,
      sceneState,
      scene: {
        canvas: {
          clientWidth: 1000,
          clientHeight: 1000,
        },
      },
      includeAltitude: false,
    });

    expect(mapLibreParams.lng).toBeCloseTo(0.3 * RAD_TO_DEG, 7);
    expect(mapLibreParams.lat).toBeCloseTo(0.6 * RAD_TO_DEG, 7);
    expect(mapLibreParams).not.toHaveProperty("altitude");
    expect(mapLibreParams.bearing ?? 0).toBeCloseTo(0.2 * RAD_TO_DEG, 7);
    expect(mapLibreParams.pitch).toBe(30);
    expect(mapLibreParams.zoom ?? 0).toBeCloseTo(16.77, 2);
  });
});
