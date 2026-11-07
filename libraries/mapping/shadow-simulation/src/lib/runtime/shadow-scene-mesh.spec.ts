import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { makeSceneMeshesShadeable } from "./shadow-scene-mesh";

describe("measurement overlay shadow exclusion", () => {
  it("keeps nested measurement material unmodified while ordinary buildings remain shadeable", () => {
    const scene = new THREE.Scene();
    const measurements = new THREE.Group();
    measurements.userData.renderAsOverlay = true;
    const nested = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({ color: "#e31145" });
    const compile = material.onBeforeCompile;
    const cacheKey = material.customProgramCacheKey;
    const annotation = new THREE.Mesh(new THREE.BoxGeometry(), material);
    annotation.castShadow = true;
    annotation.receiveShadow = true;
    nested.add(annotation);
    measurements.add(nested);
    const building = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshBasicMaterial()
    );
    scene.add(measurements, building);
    try {
      makeSceneMeshesShadeable(scene, true);
      expect(annotation.castShadow).toBe(false);
      expect(annotation.receiveShadow).toBe(false);
      expect(annotation.material).toBe(material);
      expect(material.onBeforeCompile).toBe(compile);
      expect(material.customProgramCacheKey).toBe(cacheKey);
      expect(material.shadowSide).toBeNull();
      expect(material.color.getHexString()).toBe("e31145");
      expect(building.castShadow).toBe(true);
      expect(building.receiveShadow).toBe(true);
      expect(building.material.shadowSide).toBe(THREE.DoubleSide);
    } finally {
      annotation.geometry.dispose();
      material.dispose();
      building.geometry.dispose();
      building.material.dispose();
    }
  });

  it("excludes instanced children added after the first scene pass through the same tagged ancestor", () => {
    const scene = new THREE.Scene();
    const measurements = new THREE.Group();
    measurements.userData.renderAsOverlay = true;
    scene.add(measurements);
    makeSceneMeshesShadeable(scene);
    const nested = new THREE.Group();
    const material = new THREE.MeshBasicMaterial();
    const compile = material.onBeforeCompile;
    const marker = new THREE.InstancedMesh(
      new THREE.BoxGeometry(),
      material,
      2
    );
    marker.castShadow = true;
    marker.receiveShadow = true;
    nested.add(marker);
    measurements.add(nested);
    try {
      makeSceneMeshesShadeable(scene);
      expect(marker.castShadow).toBe(false);
      expect(marker.receiveShadow).toBe(false);
      expect(marker.material).toBe(material);
      expect(material.onBeforeCompile).toBe(compile);
      expect(material.shadowSide).toBeNull();
    } finally {
      marker.geometry.dispose();
      material.dispose();
    }
  });
});
