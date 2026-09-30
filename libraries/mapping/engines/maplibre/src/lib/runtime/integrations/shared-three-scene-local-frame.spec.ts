// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Map as MaplibreMap } from "maplibre-gl";
import * as THREE from "three";

import { createSharedSceneLocalFrame } from "./shared-three-scene-local-frame";

describe("shared scene local frame", () => {
  it.each([
    [7.1824596, 51.3317778],
    [7.1032505, 51.2539949],
  ])("keeps sunlight orientation rigid after a pan to %s, %s", (lng, lat) => {
    const origin = [7.1560145, 51.2553208] as const;
    let center = { lng: origin[0] as number, lat: origin[1] as number };
    const map = {
      getCenter: () => center,
      getZoom: () => 18.334,
      getPitch: () => 60,
      getCanvas: () => ({ clientWidth: 1920 }),
    } as unknown as MaplibreMap;
    const group = new THREE.Group();
    group.matrixAutoUpdate = false;
    const state = createSharedSceneLocalFrame(group);
    const initial = state.refit(map, origin, true)!;
    center = { lng, lat };
    const moved = state.refit(map, origin)!;

    expect(moved.revision).toBe(initial.revision + 1);
    expect(moved.sceneFromLocalReference).toBe(initial.sceneFromLocalReference);
    // Geometry retains the full metric-corrected fit and its shared mounting.
    expect(group.matrix.equals(moved.referenceToCurrent)).toBe(true);
    const reconstructed = moved.referenceToCurrent
      .clone()
      .multiply(initial.sceneFromLocalReference);
    moved.sceneFromLocal.elements.forEach((value, index) => {
      expect(reconstructed.elements[index]).toBeCloseTo(value, 9);
    });

    // A scale/shear-free orientation is required by the atmosphere shader.
    const orientation = moved.sceneFromLocalRotation;
    const orthogonality = orientation.clone().transpose().multiply(orientation);
    new THREE.Matrix4().elements.forEach((value, index) => {
      expect(orthogonality.elements[index]).toBeCloseTo(value, 12);
    });
    expect(orientation.determinant()).toBeCloseTo(1, 12);
    expect(orientation.elements.slice(12, 15)).toEqual([0, 0, 0]);
  });
});
