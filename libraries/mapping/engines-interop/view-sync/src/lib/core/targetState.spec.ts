import type { SceneState } from "./scene-state/sceneState";
import { describe, expect, it } from "vitest";
import {
  projectViewSyncTargetToLeaflet,
} from "../adapters/leafletAdapter";
import {
  projectViewSyncTargetToMapLibre,
} from "../adapters/maplibreAdapter";
import {
  readViewStateFromSceneState,
} from "./targetState";

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
});
