import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { SharedThreeSceneRuntime } from "@carma-mapping/engines/maplibre";
import {
  getViewElevationRange,
  getVisibleSceneElevationRange,
} from "./shadow-scene-view-geometry";

describe("world elevation bounds independent of measurement overlays", () => {
  it("ignores high nested measurements while ordinary building changes still extend the world range", () => {
    const scene = new THREE.Scene();
    const building = new THREE.Mesh(
      new THREE.BoxGeometry(2, 10, 2),
      new THREE.MeshBasicMaterial()
    );
    building.position.y = 15;
    const measurements = new THREE.Group();
    measurements.userData.renderAsOverlay = true;
    const nested = new THREE.Group();
    const annotation = new THREE.Mesh(
      new THREE.BoxGeometry(2, 2000, 2),
      new THREE.MeshBasicMaterial()
    );
    annotation.position.y = 10_000;
    nested.add(annotation);
    measurements.add(nested);
    scene.add(building, measurements);
    try {
      expect(getVisibleSceneElevationRange(scene, 0)).toEqual([0, 20]);
      building.position.y = 50;
      expect(getVisibleSceneElevationRange(scene, 0)).toEqual([0, 55]);
      measurements.userData.renderAsOverlay = false;
      expect(getVisibleSceneElevationRange(scene, 0)).toEqual([0, 11_000]);
    } finally {
      annotation.geometry.dispose();
      annotation.material.dispose();
      building.geometry.dispose();
      building.material.dispose();
    }
  });

  it.each([false, true])(
    "ignores flagged runtime ranges even when providesTerrain=%s",
    (providesTerrain) => {
      const range = vi.fn(() => [-50_000, 50_000] as const);
      const runtime: SharedThreeSceneRuntime = {
        id: "measurements",
        root: new THREE.Group(),
        originLngLat: [0, 0],
        renderAsOverlay: true,
        providesTerrain,
        getViewElevationRange: range,
        update: () => {},
        dispose: () => {},
      };
      const ordinary: SharedThreeSceneRuntime = {
        id: "building",
        root: new THREE.Group(),
        originLngLat: [0, 0],
        getViewElevationRange: () => [-5, 40],
        update: () => {},
        dispose: () => {},
      };
      expect(
        getViewElevationRange(
          new THREE.Scene(),
          [runtime, ordinary],
          new THREE.PerspectiveCamera(),
          10
        )
      ).toEqual([-5, 40]);
      expect(range).not.toHaveBeenCalled();
    }
  );
});
