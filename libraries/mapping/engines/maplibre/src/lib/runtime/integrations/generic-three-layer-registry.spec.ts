// @vitest-environment node

import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import {
  genericThreeLayerHasShadeableContent,
  getGenericThreeLayers,
  notifyGenericThreeLayerContentChanged,
  registerGenericThreeLayer,
  subscribeGenericThreeLayers,
  unregisterGenericThreeLayer,
} from "./generic-three-layer-registry";

describe("generic Three.js layer registry", () => {
  it("publishes layer lifecycle and content changes", () => {
    const map = {} as never;
    const layer = { scene: new THREE.Scene() } as never;
    const listener = vi.fn();
    const unsubscribe = subscribeGenericThreeLayers(map, listener);

    registerGenericThreeLayer(map, layer);
    notifyGenericThreeLayerContentChanged(map);
    expect(getGenericThreeLayers(map)).toEqual([layer]);
    expect(listener).toHaveBeenCalledTimes(2);

    unregisterGenericThreeLayer(map, layer);
    expect(getGenericThreeLayers(map)).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
  });

  it("recognizes visible mesh geometry with a visible material", () => {
    const scene = new THREE.Scene();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial()
    );
    scene.add(mesh);
    const layer = { scene } as never;

    expect(genericThreeLayerHasShadeableContent(layer)).toBe(true);
    mesh.visible = false;
    expect(genericThreeLayerHasShadeableContent(layer)).toBe(false);
  });
});
