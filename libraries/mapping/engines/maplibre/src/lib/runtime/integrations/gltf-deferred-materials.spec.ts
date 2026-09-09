import { BufferGeometry, Group, Mesh, MeshBasicMaterial, Texture } from "three";
import type {
  GLTF,
  GLTFParser,
} from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, it, vi } from "vitest";
import { createDeferredGltfMaterials } from "./gltf-deferred-materials";

const fixture = (definitions: object[] = [{}]) => {
  const parser = {
    json: {
      materials: definitions,
      meshes: [{ primitives: [{}] }],
      textures: [{}],
    },
    associations: new Map(),
    cache: { remove: vi.fn() },
    textureCache: {},
    sourceCache: {},
    loadMaterial: vi.fn(
      async () => new MeshBasicMaterial({ map: new Texture() })
    ),
    assignFinalMaterial: vi.fn(),
  };
  const deferred = createDeferredGltfMaterials(parser as unknown as GLTFParser);
  const scene = new Group();
  const load = async () => {
    for (let index = 0; index < definitions.length; index++) {
      const material = await deferred.plugin.loadMaterial!(index);
      if (material) scene.add(new Mesh(new BufferGeometry(), material));
    }
    await deferred.plugin.afterRoot!({ scene } as GLTF);
  };
  return { parser, deferred, scene, load };
};

describe("deferred opaque GLTF materials", () => {
  it("does not load images for casters and promotes once without changing geometry", async () => {
    const f = fixture();
    await f.load();
    const mesh = f.scene.children[0] as Mesh;
    const geometry = mesh.geometry,
      material = mesh.material as MeshBasicMaterial;
    expect(f.parser.loadMaterial).not.toHaveBeenCalled();
    expect(material.colorWrite).toBe(false);
    expect(material.depthWrite).toBe(false);
    const pending = f.deferred.promote();
    expect(f.deferred.promote()).toBe(pending);
    await pending;
    expect(mesh.geometry).toBe(geometry);
    expect(mesh.material).not.toBe(material);
    expect(f.deferred.isReady()).toBe(true);
    expect(f.parser.loadMaterial).toHaveBeenCalledTimes(1);
  });
  it.each([
    { alphaMode: "MASK" },
    { alphaMode: "BLEND" },
    { extensions: { KHR_materials_transmission: {} } },
  ])(
    "keeps mixed coverage-sensitive payloads native: %j",
    async (definition) => {
      const f = fixture([{}, definition]);
      await f.load();
      expect(f.deferred.skippedMaterialCount()).toBe(0);
      expect(f.deferred.isReady()).toBe(true);
    }
  );
  it("preserves all placeholders on one failed material, cleans partial results and retries", async () => {
    const f = fixture([{}, {}]);
    await f.load();
    const before = f.scene.children.map((object) => (object as Mesh).material);
    const material = new MeshBasicMaterial({ map: new Texture() });
    const disposal = vi.spyOn(material, "dispose"),
      textureDisposal = vi.spyOn(material.map!, "dispose");
    f.parser.loadMaterial
      .mockResolvedValueOnce(material)
      .mockRejectedValueOnce(new Error("image failed"));
    await expect(f.deferred.promote()).rejects.toThrow("image failed");
    expect(f.scene.children.map((object) => (object as Mesh).material)).toEqual(
      before
    );
    expect(disposal).toHaveBeenCalledOnce();
    expect(textureDisposal).toHaveBeenCalledOnce();
    await f.deferred.promote();
    expect(f.deferred.isReady()).toBe(true);
  });
  it("rejects the native loader's missing-texture success rather than showing an untextured tile", async () => {
    const f = fixture([
      { pbrMetallicRoughness: { baseColorTexture: { index: 0 } } },
    ]);
    await f.load();
    f.parser.loadMaterial.mockResolvedValueOnce(new MeshBasicMaterial());
    await expect(f.deferred.promote()).rejects.toThrow("texture unavailable");
    expect(f.deferred.isReady()).toBe(false);
    expect(f.parser.cache.remove).toHaveBeenCalledWith("texture:0");
  });
  it("disposes late completion without publishing after eviction", async () => {
    const f = fixture();
    await f.load();
    let resolve!: (value: MeshBasicMaterial) => void;
    f.parser.loadMaterial.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const pending = f.deferred.promote();
    const rejection = expect(pending).rejects.toThrow("disposed");
    f.deferred.dispose();
    const material = new MeshBasicMaterial({ map: new Texture() });
    const disposal = vi.spyOn(material.map!, "dispose");
    resolve(material);
    await rejection;
    expect(disposal).toHaveBeenCalledOnce();
    expect(f.deferred.isReady()).toBe(false);
  });
});
