import { describe, expect, it, vi } from "vitest";
import type { RasterDemTerrainResource } from "@carma-commons/resources";
const source = vi.hoisted(() => ({
  getTileDataAvailable: vi.fn(() => true),
  requestTile: vi.fn(async () => ({})),
  sampleHeight: vi.fn(() => 150),
  release: vi.fn(),
}));
vi.mock("./raster-dem-terrain-tile-source", () => ({
  acquireRasterDemTerrainTileSource: async () => source,
}));
import { sampleCameraPathGroundHeights } from "./camera-flight-terrain";

describe("bounded camera flight elevation preparation", () => {
  const resource = { minzoom: 5, maxzoom: 16 } as RasterDemTerrainResource;
  it("resolves a point tile instead of an empty zero-area bbox", async () => {
    const result = await sampleCameraPathGroundHeights(
      resource,
      [[7.2, 51.27]],
      new AbortController().signal
    );
    expect(result).toEqual([150]);
    expect(source.requestTile).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 13,
        x: expect.any(Number),
        y: expect.any(Number),
      }),
      expect.any(AbortSignal),
      5
    );
    expect(source.release).toHaveBeenCalled();
  });
  it("releases its source on cancellation before requesting tiles", async () => {
    source.requestTile.mockClear();
    source.release.mockClear();
    const controller = new AbortController();
    controller.abort();
    await expect(
      sampleCameraPathGroundHeights(resource, [[7.2, 51.27]], controller.signal)
    ).rejects.toThrow();
    expect(source.requestTile).not.toHaveBeenCalled();
    expect(source.release).toHaveBeenCalledTimes(1);
  });
  it("fails visibly on absent terrain instead of inventing zero elevation", async () => {
    source.getTileDataAvailable.mockReturnValueOnce(false);
    await expect(
      sampleCameraPathGroundHeights(
        resource,
        [[7.2, 51.27]],
        new AbortController().signal
      )
    ).rejects.toThrow("outside");
  });
});
