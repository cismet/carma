import type { SceneState } from "@carma-mapping/engines/cesium/api";
import { describe, expect, it } from "vitest";
import { projectViewSyncTargetToLeaflet } from "../adapters/leafletAdapter";
import { projectViewSyncTargetToMapLibre } from "../adapters/maplibreAdapter";
import { readViewStateFromSceneState } from "./targetState";

describe("targetState helpers", () => {
  it("reads an object-centric target from scene-state and projects it", () => {
    const sceneState = {
      metadata: {
        frameNumber: 4,
        timestampMs: 1000,
        source: "framework",
      },
      camera: {
        worldPosition: { x: 0, y: 0, z: 1200 },
        cartographic: {
          longitude: 0.12,
          latitude: 0.92,
          altitude: 1200,
        },
        bearingRad: 1.4,
        pitchRad: -0.6,
        rollRad: 0.1,
        cameraModel: {
          intrinsics: {
            fov: 1.0,
          },
        },
      },
      orbitPoint: {
        worldPosition: { x: 0, y: 0, z: 400 },
        cartographic: {
          longitude: 0.11,
          latitude: 0.91,
          altitude: 400,
        },
        source: "screen-center-globe",
      },
    } as unknown as SceneState;

    const target = readViewStateFromSceneState(sceneState);

    expect(target).not.toBeNull();
    expect(target?.altitude).toBe(400);
    expect(target?.range).toBe(800);

    const mapLibreProjection = projectViewSyncTargetToMapLibre(target!);
    const leafletProjection = projectViewSyncTargetToLeaflet(target!, {
      includeBearing: true,
    });

    expect(mapLibreProjection?.lng).toBeCloseTo(6.3025, 4);
    expect(mapLibreProjection?.lat).toBeCloseTo(52.1392, 4);
    expect(mapLibreProjection?.zoom).toBeGreaterThan(16);
    expect(mapLibreProjection?.pitch).toBeCloseTo(55.6225, 4);

    expect(leafletProjection?.center.lng).toBeCloseTo(6.3025, 4);
    expect(leafletProjection?.center.lat).toBeCloseTo(52.1392, 4);
    expect(leafletProjection?.zoom).toBeGreaterThan(17);
    expect(leafletProjection?.bearingDeg).toBeCloseTo(80.2141, 4);
  });

  it("prefers object-centric cameraModel pose over raw camera heading/pitch", () => {
    const sceneState = {
      metadata: {
        frameNumber: 5,
        timestampMs: 1001,
        source: "framework",
      },
      camera: {
        worldPosition: { x: 100, y: 200, z: 1200 },
        bearingRad: 0.3,
        pitchRad: -0.2,
        cameraModel: {
          pose: {
            anchor: {
              longitude: 0.11,
              latitude: 0.91,
              altitude: 400,
            },
            bearing: 1.4,
            pitch: 0.9707963267948966,
            range: 900,
          },
        },
      },
      orbitPoint: {
        worldPosition: { x: 0, y: 0, z: 400 },
        cartographic: {
          longitude: 0.11,
          latitude: 0.91,
          altitude: 400,
        },
        source: "screen-center-globe",
      },
    } as unknown as SceneState;

    const target = readViewStateFromSceneState(sceneState);

    expect(target).not.toBeNull();
    expect(target?.bearing).toBeCloseTo(1.4, 8);
    expect(target?.pitch).toBeCloseTo(0.9707963268, 8);
    expect(target?.range).toBeCloseTo(900, 8);
  });

  it("derives canonical maplibre zoom from scene viewport when available", () => {
    const sceneState = {
      metadata: {
        frameNumber: 6,
        timestampMs: 1002,
        source: "framework",
      },
      camera: {
        worldPosition: { x: 0, y: 0, z: 1200 },
        bearingRad: 0,
        pitchRad: -Math.PI / 2,
        cameraModel: {
          intrinsics: {
            fov: 1.0,
          },
        },
      },
      orbitPoint: {
        worldPosition: { x: 0, y: 0, z: 0 },
        cartographic: {
          longitude: 0.11,
          latitude: 0.91,
          altitude: 400,
        },
        source: "screen-center-globe",
      },
    } as unknown as SceneState;

    const withoutScene = readViewStateFromSceneState(sceneState);
    const withScene = readViewStateFromSceneState(sceneState, {
      canvas: {
        clientWidth: 1600,
        clientHeight: 900,
      },
    });

    expect(withoutScene?.zoom).toBeUndefined();
    expect(withScene?.zoom).toBeDefined();
    expect(Number.isFinite(withScene?.zoom)).toBe(true);
  });

  it("prefers live scene vertical fov over stored intrinsics fov when available", () => {
    const sceneState = {
      metadata: {
        frameNumber: 7,
        timestampMs: 1003,
        source: "framework",
      },
      camera: {
        worldPosition: { x: 0, y: 0, z: 1200 },
        bearingRad: 0,
        pitchRad: -Math.PI / 2,
        cameraModel: {
          intrinsics: {
            fov: 1.6,
          },
        },
      },
      orbitPoint: {
        worldPosition: { x: 0, y: 0, z: 0 },
        cartographic: {
          longitude: 0.11,
          latitude: 0.91,
          altitude: 400,
        },
        source: "screen-center-globe",
      },
    } as unknown as SceneState;

    const withoutScene = readViewStateFromSceneState(sceneState);
    const withScene = readViewStateFromSceneState(sceneState, {
      canvas: {
        clientWidth: 1600,
        clientHeight: 900,
      },
      camera: {
        frustum: {
          fov: 1.6,
          fovy: 0.9,
          aspectRatio: 1600 / 900,
        },
      },
    });

    expect(withoutScene?.fovVertical).toBeCloseTo(1.6, 8);
    expect(withScene?.fovVertical).toBeCloseTo(0.9, 8);
    expect(withoutScene?.zoom).toBeUndefined();
    expect(withScene?.zoom).toBeDefined();
  });

  it("keeps canonical zoom stable across viewport aspect ratios when longer-edge fov is unchanged", () => {
    const sceneState = {
      metadata: {
        frameNumber: 8,
        timestampMs: 1004,
        source: "framework",
      },
      camera: {
        worldPosition: { x: 0, y: 0, z: 1200 },
        bearingRad: 0,
        pitchRad: -Math.PI / 2,
        cameraModel: {
          intrinsics: {
            fov: 0.9,
            fovHorizontal: 1.2,
          },
        },
      },
      orbitPoint: {
        worldPosition: { x: 0, y: 0, z: 0 },
        cartographic: {
          longitude: 0.11,
          latitude: 0.91,
          altitude: 400,
        },
        source: "screen-center-globe",
      },
    } as unknown as SceneState;

    const wideViewport = readViewStateFromSceneState(sceneState, {
      canvas: {
        clientWidth: 1600,
        clientHeight: 900,
      },
      camera: {
        frustum: {
          fov: 1.2,
          fovy: 0.9,
          aspectRatio: 1600 / 900,
        },
      },
    });

    const tallViewport = readViewStateFromSceneState(sceneState, {
      canvas: {
        clientWidth: 900,
        clientHeight: 1600,
      },
      camera: {
        frustum: {
          fov: 1.2,
          fovy: 1.2,
          aspectRatio: 900 / 1600,
        },
      },
    });

    expect(wideViewport?.zoom).toBeDefined();
    expect(tallViewport?.zoom).toBeDefined();
    expect(wideViewport?.zoom).toBeCloseTo(tallViewport?.zoom ?? 0, 6);
  });
});
