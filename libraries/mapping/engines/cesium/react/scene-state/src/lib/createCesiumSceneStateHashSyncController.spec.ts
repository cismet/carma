import { describe, expect, it, vi } from "vitest";
import { createCesiumSceneStateHashSyncController } from "./createCesiumSceneStateHashSyncController";
import type { SceneState } from "./types";

const createSceneState = ({
  altitude = 400,
  worldX = 100,
  worldY = 200,
  worldZ = 1200,
  bearingRad = 1.2,
  pitchRad = 0.8,
  rollRad = 0,
  fovRad = 1,
}: {
  altitude?: number;
  worldX?: number;
  worldY?: number;
  worldZ?: number;
  bearingRad?: number;
  pitchRad?: number;
  rollRad?: number;
  fovRad?: number;
} = {}): SceneState =>
  ({
    metadata: {
      frameNumber: 1,
      timestampMs: 1000,
      source: "framework",
    },
    camera: {
      worldPosition: {
        x: worldX,
        y: worldY,
        z: worldZ,
      },
      bearingRad,
      pitchRad,
      rollRad,
      cameraModel: {
        pose: {
          anchor: {
            longitude: 0.11,
            latitude: 0.91,
            altitude,
          },
          bearing: bearingRad,
          pitch: pitchRad,
          range: 900,
        },
        intrinsics: {
          fov: fovRad,
        },
      },
    },
    orbitPoint: {
      worldPosition: { x: 0, y: 0, z: 400 },
      cartographic: {
        longitude: 0.11,
        latitude: 0.91,
        altitude,
      },
      source: "screen-center-globe",
    },
  } as SceneState);

const readHashParams = (
  sceneState: SceneState | null | undefined
): Record<string, unknown> | null => {
  if (!sceneState) {
    return null;
  }

  return {
    lng: 7.2,
    lat: 51.2,
    altitude: sceneState.camera.cameraModel?.pose.anchor.altitude,
    zoom: 16,
    bearing: (sceneState.camera.bearingRad ?? 0) * (180 / Math.PI),
    pitch: 45,
  };
};

describe("createCesiumSceneStateHashSyncController", () => {
  it("buffers live scene-state changes and writes only on flush", () => {
    const writes: Array<{
      params: Record<string, unknown>;
      replace: boolean;
    }> = [];

    const controller = createCesiumSceneStateHashSyncController({
      minEnabledDurationMs: 0,
      minStableSamples: 1,
      readHashParams,
      writeCameraHash: (params, replace) => {
        writes.push({ params, replace });
      },
    });

    controller.onSceneStateChange(createSceneState({ altitude: 400 }));
    controller.onSceneStateChange(
      createSceneState({ altitude: 405, worldX: 110 })
    );

    expect(writes).toHaveLength(0);

    controller.flushPendingHash();

    expect(writes).toHaveLength(1);
    expect(writes[0]?.replace).toBe(true);
    expect(writes[0]?.params.altitude).toBe(405);
  });

  it("throttles repeated flushes until the configured interval elapsed", () => {
    let now = 1000;
    const writeCameraHash = vi.fn();

    const controller = createCesiumSceneStateHashSyncController({
      minEnabledDurationMs: 0,
      minStableSamples: 1,
      minUpdateIntervalMs: 100,
      nowMs: () => now,
      readHashParams,
      writeCameraHash,
    });

    const first = createSceneState({ altitude: 400, worldX: 100 });
    const second = createSceneState({ altitude: 420, worldX: 140 });

    controller.onSceneStateChange(first);
    controller.flushPendingHash();

    expect(writeCameraHash).toHaveBeenCalledTimes(1);
    expect(writeCameraHash).toHaveBeenLastCalledWith(
      expect.objectContaining({ altitude: 400 }),
      true
    );

    now = 1050;
    controller.onSceneStateChange(second);
    controller.flushPendingHash();

    expect(writeCameraHash).toHaveBeenCalledTimes(1);

    now = 1101;
    controller.flushPendingHash(second);

    expect(writeCameraHash).toHaveBeenCalledTimes(2);
    expect(writeCameraHash).toHaveBeenLastCalledWith(
      expect.objectContaining({ altitude: 420 }),
      true
    );
  });

  it("can publish scene state immediately for explicit post-transition writes", () => {
    let now = 1000;
    const writeCameraHash = vi.fn();

    const controller = createCesiumSceneStateHashSyncController({
      minEnabledDurationMs: 500,
      minStableSamples: 5,
      minUpdateIntervalMs: 100,
      nowMs: () => now,
      readHashParams,
      writeCameraHash,
    });

    const settledSceneState = createSceneState({ altitude: 410, worldX: 120 });

    expect(
      controller.publishSceneState(settledSceneState, { force: true })
    ).toBe(true);
    expect(writeCameraHash).toHaveBeenCalledTimes(1);
    expect(writeCameraHash).toHaveBeenLastCalledWith(
      expect.objectContaining({ altitude: 410 }),
      true
    );
  });
});
