import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dispatchDroppedAsset,
  registerDroppedAssetHandler,
} from "./dropped-asset-handlers";
const releases: (() => void)[] = [];
afterEach(() => releases.splice(0).forEach((release) => release()));

describe("optional dropped-asset dispatch", () => {
  it("leaves legacy GeoJSON, 3D files and ordinary URLs to existing drop handlers", async () => {
    const imported = vi.fn(async () => undefined);
    releases.push(
      registerDroppedAssetHandler({
        accepts: (asset) => !!asset.file?.name.endsWith(".avif"),
        import: imported,
      })
    );
    for (const asset of [
      { file: { name: "features.geojson" } as File },
      { file: { name: "mesh.glb" } as File },
      { url: "https://data.example.test/features.json" },
    ])
      expect(await dispatchDroppedAsset(asset)).toBe(false);
    expect(imported).not.toHaveBeenCalled();
  });

  it("dispatches the original asset to one registered handler and unregisters cleanly", async () => {
    const asset = { file: { name: "image.avif" } as File },
      first = vi.fn(async () => undefined),
      second = vi.fn(async () => undefined);
    const release = registerDroppedAssetHandler({
      accepts: () => true,
      import: first,
    });
    releases.push(release);
    releases.push(
      registerDroppedAssetHandler({ accepts: () => true, import: second })
    );
    expect(await dispatchDroppedAsset(asset)).toBe(true);
    expect(first).toHaveBeenCalledWith(asset);
    expect(second).not.toHaveBeenCalled();
    release();
    expect(await dispatchDroppedAsset(asset)).toBe(true);
    expect(second).toHaveBeenCalledWith(asset);
  });

  it("reports an accepted but invalid AVIF instead of falling through into legacy import", async () => {
    const error = new Error("missing calibration"),
      fallback = vi.fn(async () => undefined);
    releases.push(
      registerDroppedAssetHandler({
        accepts: () => true,
        import: async () => {
          throw error;
        },
      })
    );
    releases.push(
      registerDroppedAssetHandler({ accepts: () => true, import: fallback })
    );
    await expect(
      dispatchDroppedAsset({ file: { name: "broken.avif" } as File })
    ).rejects.toBe(error);
    expect(fallback).not.toHaveBeenCalled();
  });
});
