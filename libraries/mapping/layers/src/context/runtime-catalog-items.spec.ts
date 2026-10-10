// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  findRuntimeCatalogItem,
  mergeRuntimeCategoryConfigs,
  registerRuntimeCatalogItems,
  type RuntimeCatalogItem,
} from "./runtime-catalog-items";
const entry = (id: string, path?: string): RuntimeCatalogItem => ({
  categoryId: "objects",
  item: {
    id,
    title: id,
    description: "Local image",
    serviceName: "local",
    path,
  },
  activate: vi.fn(),
});
describe("runtime catalogue items", () => {
  it("groups local objects while preserving the input categories", () => {
    const existing = { Title: "Existing", layers: [entry("existing").item] };
    const configs = { objects: [existing] };
    const first = entry("one", "Own images"),
      second = entry("two", "Own images"),
      fallback = entry("three");
    const merged = mergeRuntimeCategoryConfigs(configs, [
      first,
      second,
      fallback,
    ]);
    expect(merged.objects).toEqual([
      existing,
      { Title: "Own images", layers: [first.item, second.item] },
      { Title: "Lokale Dateien", layers: [fallback.item] },
    ]);
    expect(configs.objects).toEqual([existing]);
    expect(merged.objects).not.toBe(configs.objects);
  });
  it("activates the same local item through ordinary and favorite identifiers", async () => {
    const value = entry("local-photo"),
      release = registerRuntimeCatalogItems([value]);
    try {
      expect(findRuntimeCatalogItem("local-photo")).toBe(value);
      await findRuntimeCatalogItem("fav_local-photo")!.activate();
      expect(value.activate).toHaveBeenCalledOnce();
      expect(findRuntimeCatalogItem("missing")).toBeUndefined();
    } finally {
      release();
    }
    expect(findRuntimeCatalogItem("local-photo")).toBeUndefined();
  });
  it("does not remove a newer replacement when an older registration releases", () => {
    const older = entry("replacement"),
      newer = entry("replacement");
    const releaseOld = registerRuntimeCatalogItems([older]),
      releaseNew = registerRuntimeCatalogItems([newer]);
    try {
      releaseOld();
      expect(findRuntimeCatalogItem("replacement")).toBe(newer);
    } finally {
      releaseOld();
      releaseNew();
    }
    expect(findRuntimeCatalogItem("replacement")).toBeUndefined();
  });
});
