import { describe, expect, it } from "vitest";
import {
  TILESET_HIERARCHY,
  createTilesetHierarchyPageReader,
  packTilesetHierarchyPage,
  type TilesetDescriptor,
} from "./tileset-hierarchy-page";

const source = (): TilesetDescriptor => ({
  asset: { version: "1.0", extras: { revision: 42 } },
  geometricError: 32,
  root: {
    boundingVolume: { box: [1, 2, 3, 4, 0, -0, 0, 5, 0, 0, 0, 6] },
    refine: "REPLACE",
    geometricError: 16,
    transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1000000.000001, 0, 0, 1],
    content: {
      uri: "parent.b3dm",
      boundingVolume: { box: [1, 2, 3, 4, 0, -0, 0, 5, 0, 0, 0, 6] },
    },
    children: [
      {
        boundingVolume: { sphere: [4, 5, 6, 20] },
        geometricError: 8,
        content: { uri: "unknown/subtree.json" },
        extras: { label: "Überführung" },
      },
      {
        boundingVolume: { region: [0.1, 0.2, 0.3, 0.4, -20, 300] },
        refine: "ADD",
        children: [],
        content: { url: "legacy.b3dm" },
      },
    ],
  },
});
const decode = (page: ReturnType<typeof packTilesetHierarchyPage>) => {
  const reader = createTilesetHierarchyPageReader(page);
  while (reader.read()) {
    /* exercise incremental API */
  }
  return reader.finish();
};

describe("native-compatible sparse hierarchy pages", () => {
  it("losslessly preserves native fields, unknown subtrees, metadata, transforms and negative zero", () => {
    const original = source();
    expect(decode(structuredClone(packTilesetHierarchyPage(original)))).toEqual(
      original
    );
    expect(original.root).not.toHaveProperty("parent");
  });
  it("stores duplicate content/tile volumes once and omits their zero components", () => {
    const page = packTilesetHierarchyPage(source());
    expect(page.volumeIds[0]).toBe(page.contentVolumeIds[0]);
    expect(page.volumeKinds.length).toBe(3);
    expect(page.volumeValues.length).toBeLessThan(12 + 12 + 4 + 6);
  });
  it("does not permit publication of a partly reconstructed child set", () => {
    const reader = createTilesetHierarchyPageReader(
      packTilesetHierarchyPage(source())
    );
    expect(reader.read()).toBe(true);
    expect(() => reader.finish()).toThrow();
    expect(reader.read()).toBe(true);
    expect(reader.read()).toBe(true);
    expect(reader.read()).toBe(false);
    expect(reader.finish().root.children).toHaveLength(2);
  });
  it("rejects schema mismatch, cyclic/forward parent links and invalid volume data", () => {
    const page = packTilesetHierarchyPage(source());
    expect(() =>
      decode({ ...page, version: "old" as typeof TILESET_HIERARCHY.version })
    ).toThrow();
    page.parents[1] = 1;
    expect(() => decode(page)).toThrow();
    page.parents[1] = 0;
    page.volumeValues[0] = NaN;
    expect(() => decode(page)).toThrow();
  });
  it("rejects truncated URI offsets and transforms", () => {
    const page = packTilesetHierarchyPage(source());
    page.transformOffsets[0] = page.transforms.length;
    expect(() => decode(page)).toThrow();
    page.transformOffsets[0] = 0;
    page.stringOffsets[1] = 0xffffffff;
    expect(() => decode(page)).toThrow();
  });
});
