import { afterEach, describe, expect, it, vi } from "vitest";
import type { DevicePixels } from "@carma-units";
import { JpegTileSource } from "./jpeg-tile-source";
import { ImagePrefetchBudgetExceeded } from "./image-tile-source";
afterEach(() => vi.unstubAllGlobals());
describe("JPEG speculative request allowance", () => {
  it("does not request a whole JPEG of unknown size while speculative", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const source = new JpegTileSource("https://images.test/1/image.jpg", {
      width: 1024 as DevicePixels,
      height: 1024 as DevicePixels,
    });
    source.prefetchBudget = { remainingBytes: 1024 * 1024 };
    await expect(
      source.fetch(
        [{ level: 1, col: 0, row: 0 }],
        new AbortController().signal,
        "low"
      )
    ).rejects.toBeInstanceOf(ImagePrefetchBudgetExceeded);
    expect(fetch).not.toHaveBeenCalled();
    source.prefetchBudget = undefined;
    fetch.mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));
    await source.fetch(
      [{ level: 1, col: 0, row: 0 }],
      new AbortController().signal,
      "high"
    );
    expect(fetch).toHaveBeenCalledOnce();
    expect(source.compressedBytes).toBe(3);
    source.dispose();
  });
});
