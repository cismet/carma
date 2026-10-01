import { describe, expect, it } from "vitest";
import {
  BoxGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  ShaderMaterial,
} from "three";
import {
  restoreMeshBaseRenderRecord,
  snapshotMeshBaseRenderRecord,
} from "./mesh-base-render-record";
import {
  collectCachedMeshBase,
  meshBaseCacheKey,
  MESH_BASE_RENDER_FORMAT,
  meshBaseCacheIdentity,
  meshBaseIdentitySourceMatches,
  meshBaseManifestMatches,
  meshBaseCacheSourceUrl,
} from "./mesh-base-cache-protocol";

describe("persistent mesh base", () => {
  it("confirms complete cached families or a stored fallback, never a partial family", () => {
    type Node = { stored: boolean; children: Node[] | null };
    const first: Node = { stored: true, children: null },
      second: Node = { stored: false, children: null };
    const root: Node = { stored: false, children: [first, second] };
    const cut = () =>
      collectCachedMeshBase(
        root,
        (n) => n.stored,
        (n) => n.children,
        () => false
      );
    expect(cut()).toBeNull();
    root.stored = true;
    expect(cut()).toEqual([root]);
    second.stored = true;
    expect(cut()).toEqual([first, second]);
  });
  it("restores the original geometry, shared materials and local transforms without applying the tile transform twice", () => {
    const tile = new Matrix4().makeTranslation(123, 456, 789);
    const scene = new Group();
    scene.position.set(124, 458, 792);
    scene.updateMatrix();
    const geometry = new BoxGeometry(),
      material = new MeshStandardMaterial({ color: 0x236ac3, roughness: 0.3 });
    const first = new Mesh(geometry, material),
      second = first.clone();
    first.castShadow = true;
    first.receiveShadow = true;
    first.layers.set(3);
    second.position.set(4, 5, 6);
    second.updateMatrix();
    scene.add(first, second);
    const record = snapshotMeshBaseRenderRecord(scene, tile)!;
    expect(record.geometries).toHaveLength(1);
    expect(record.materials).toHaveLength(1);
    const restored = restoreMeshBaseRenderRecord(structuredClone(record));
    restored.updateMatrix();
    restored.matrix.premultiply(tile);
    expect(restored.matrix.elements).toEqual(scene.matrix.elements);
    const [a, b] = restored.children as Mesh[];
    expect(a.geometry.attributes.position.array).toEqual(
      geometry.attributes.position.array
    );
    expect(a.geometry.index!.array).toEqual(geometry.index!.array);
    expect(a.geometry).toBe(b.geometry);
    expect(a.material).toBe(b.material);
    expect((a.material as MeshStandardMaterial).color.getHex()).toBe(0x236ac3);
    expect(a.castShadow && a.receiveShadow).toBe(true);
    expect(a.layers.mask).toBe(first.layers.mask);
    expect(b.position.toArray()).toEqual([4, 5, 6]);
  });

  it("falls back for custom shaders and rejects an incompatible stored format", () => {
    expect(
      snapshotMeshBaseRenderRecord(
        new Mesh(new BoxGeometry(), new ShaderMaterial()),
        new Matrix4()
      )
    ).toBeNull();
    const record = snapshotMeshBaseRenderRecord(new Group(), new Matrix4())!;
    expect(() =>
      restoreMeshBaseRenderRecord({
        ...record,
        version: "old" as typeof record.version,
      })
    ).toThrow("Stale");
  });

  it("separates source revisions and loader builds while excluding camera fragments", () => {
    const sourceUrl = "https://tiles.test/model.json?v=2";
    expect(meshBaseCacheSourceUrl(sourceUrl + "#camera")).toBe(sourceUrl);
    expect(meshBaseCacheKey(sourceUrl, "revision-a", "a.b3dm")).not.toBe(
      meshBaseCacheKey(sourceUrl, "revision-b", "a.b3dm")
    );
    const identity = meshBaseCacheIdentity({
      sourceUrl,
      sourceRevision: "revision-a",
      buildId: "build-a",
    });
    expect(meshBaseIdentitySourceMatches(identity, sourceUrl + "#camera")).toBe(
      true
    );
    expect(meshBaseIdentitySourceMatches(identity, sourceUrl + "&v=3")).toBe(
      false
    );
    expect(meshBaseIdentitySourceMatches("legacy", sourceUrl)).toBe(false);
    const manifest = {
      format: MESH_BASE_RENDER_FORMAT,
      sourceUrl,
      sourceRevision: "a",
      buildId: "build-a",
      extentError: 42,
      residentBytes: 100,
      urls: ["a.b3dm"],
    };
    expect(meshBaseManifestMatches(manifest, manifest)).toBe(true);
    expect(
      meshBaseManifestMatches(
        { ...manifest, format: "legacy" as typeof MESH_BASE_RENDER_FORMAT },
        manifest
      )
    ).toBe(false);
    for (const change of [
      { sourceUrl: sourceUrl + "&v=3" },
      { sourceRevision: "b" },
      { buildId: "build-b" },
    ])
      expect(
        meshBaseManifestMatches(manifest, { ...manifest, ...change })
      ).toBe(false);
    expect(meshBaseManifestMatches({ ...manifest, urls: [] }, manifest)).toBe(
      false
    );
  });
});
