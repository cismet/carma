import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";

import type { ModelCollectionState } from "../ModelCollection";
import {
  getDzbPrmShadowVisibility,
  loadDzbPrmGlbPartsIntoRoot,
} from "./shadow-texture-assets";

const existing: ModelCollectionState = {
  visible: true,
  opacity: 0.25,
  quality: "5m",
  bridge: "existing",
};

describe("BuGa shadow casters", () => {
  it("loads the packaged original environment and ordinary original insets", async () => {
    const root = new THREE.Group();
    const fetched = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { "content-encoding": "gzip" },
      })
    );
    const parse = vi
      .spyOn(GLTFLoader.prototype, "parse")
      .mockImplementation((_buffer, _path, onLoad) => {
        onLoad({ scene: new THREE.Group() } as GLTF);
      });
    const load = vi
      .spyOn(GLTFLoader.prototype, "load")
      .mockImplementation((_url, onLoad) => {
        onLoad({ scene: new THREE.Group() } as GLTF);
      });
    try {
      await loadDzbPrmGlbPartsIntoRoot({
        root,
        assetBaseUrl: "https://example.test/original/",
        visibility: getDzbPrmShadowVisibility(existing, false),
        isCancelled: () => false,
      });
      expect(fetched).toHaveBeenCalledWith(
        "https://example.test/original/environment.glb.gz"
      );
      expect(parse).toHaveBeenCalledTimes(1);
      expect(load.mock.calls.map(([url]) => url)).toEqual([
        "https://example.test/original/zoo.glb",
        "https://example.test/original/bridge-existing.glb",
        "https://example.test/original/station.glb",
      ]);
      expect(root.children).toHaveLength(4);
    } finally {
      fetched.mockRestore();
      parse.mockRestore();
      load.mockRestore();
    }
  });

  it("adds a pending model after an earlier load for the same root was cancelled", async () => {
    let complete!: (gltf: GLTF) => void;
    const load = vi
      .spyOn(GLTFLoader.prototype, "load")
      .mockImplementation((_url, onLoad) => {
        complete = onLoad;
      });
    try {
      const root = new THREE.Group();
      let cancelled = false;
      const options = {
        root,
        assetBaseUrl: "/cancelled-load-test/5m",
        visibility: {
          environment: false,
          zoo: false,
          station: false,
          bridge: true,
          bridgeExisting: false,
          catalogBridge: false,
        },
      };
      const previous = loadDzbPrmGlbPartsIntoRoot({
        ...options,
        isCancelled: () => cancelled,
      });
      cancelled = true;
      const current = loadDzbPrmGlbPartsIntoRoot({
        ...options,
        isCancelled: () => false,
      });
      complete({ scene: new THREE.Group() } as GLTF);
      await Promise.all([previous, current]);
      expect(load).toHaveBeenCalledTimes(1);
      expect(root.children).toHaveLength(1);
      expect(root.children[0].userData.dzbPrmGlbPartId).toBe("bridge");
    } finally {
      load.mockRestore();
    }
  });

  it("keeps Bestand as a receiver and adds the separate catalog bridge as a caster", () => {
    expect(getDzbPrmShadowVisibility(existing, true)).toMatchObject({
      environment: true,
      zoo: true,
      station: true,
      bridge: false,
      bridgeExisting: true,
      catalogBridge: true,
    });
  });

  it("removes only the catalog caster when its layer is removed", () => {
    expect(getDzbPrmShadowVisibility(existing, false)).toMatchObject({
      bridgeExisting: true,
      catalogBridge: false,
    });
  });

  it("does not cast from a hidden catalog layer", () => {
    expect(
      getDzbPrmShadowVisibility({ ...existing, bridge: "catalog" }, false)
    ).toMatchObject({
      bridgeExisting: false,
      catalogBridge: false,
    });
  });

  it("keeps both shadow sources when the main collection eye is off", () => {
    expect(
      getDzbPrmShadowVisibility({ ...existing, visible: false }, true)
    ).toMatchObject({
      environment: true,
      zoo: true,
      station: true,
      bridgeExisting: true,
      catalogBridge: true,
    });
  });
});
