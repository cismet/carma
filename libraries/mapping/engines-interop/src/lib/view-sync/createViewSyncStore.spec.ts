import type { SceneStateSnapshot } from "@carma/types";
import { describe, expect, it } from "vitest";
import { createViewSyncStore } from "./core/createViewSyncStore";
import {
  projectViewSyncTargetToLeaflet,
  projectViewSyncTargetToMapLibre,
  readViewSyncTargetFromSceneState,
} from "./core/targetState";

describe("createViewSyncStore", () => {
  it("consolidates published target state from the active controller", () => {
    const store = createViewSyncStore();

    store.registerView({
      id: "cesium-main",
      engine: "cesium",
    });
    store.registerView({
      id: "maplibre-preview",
      engine: "maplibre",
      canControl: false,
    });

    const firstTarget = {
      anchor: {
        longitude: 0.1,
        latitude: 0.2,
        altitude: 250,
      },
      bearingPitchRange: {
        bearing: 1.2,
        pitch: 0.8,
        range: 800,
      },
      fovVertical: 1,
    } as const;

    store.publishViewState("cesium-main", firstTarget, {
      frameNumber: 12,
      claimControl: true,
      timestampMs: 100,
    });

    expect(store.getState().controllerId).toBe("cesium-main");
    expect(store.getState().target?.target).toEqual(firstTarget);

    const passiveTarget = {
      ...firstTarget,
      bearingPitchRange: {
        ...firstTarget.bearingPitchRange,
        bearing: 2.5,
      },
    } as const;

    store.publishViewState("maplibre-preview", passiveTarget, {
      frameNumber: 13,
      timestampMs: 110,
    });

    expect(store.getState().target?.sourceId).toBe("cesium-main");
    expect(store.getState().target?.target).toEqual(firstTarget);

    store.setController("maplibre-preview");
    expect(store.getState().controllerId).toBe("cesium-main");
  });
});

describe("view-sync target helpers", () => {
  it("reads an object-centric target from scene-state and projects it", () => {
    const sceneState = {
      frameNumber: 4,
      timestampMs: 1000,
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
        fovVertical: 1.0,
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
    } satisfies SceneStateSnapshot;

    const target = readViewSyncTargetFromSceneState(sceneState);

    expect(target).not.toBeNull();
    expect(target?.anchor.altitude).toBe(400);
    expect(target?.bearingPitchRange.range).toBe(800);

    const viewport = {
      widthPx: 1200,
      heightPx: 900,
    };

    const mapLibreProjection = projectViewSyncTargetToMapLibre({
      target: target!,
      viewport,
    });
    const leafletProjection = projectViewSyncTargetToLeaflet({
      target: target!,
      viewport,
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
      frameNumber: 5,
      timestampMs: 1001,
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
    } satisfies SceneStateSnapshot;

    const target = readViewSyncTargetFromSceneState(sceneState);

    expect(target).not.toBeNull();
    expect(target?.bearingPitchRange.bearing).toBeCloseTo(1.4, 8);
    expect(target?.bearingPitchRange.pitch).toBeCloseTo(0.9707963268, 8);
    expect(target?.bearingPitchRange.range).toBeCloseTo(900, 8);
  });
});
