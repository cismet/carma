import { afterEach, describe, expect, it, vi } from "vitest";

import { createDzbPrmShadowFrameCache } from "./shadow-texture-capture";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("DZ_B_PRM shadow frame cache", () => {
  it("does not subtract an already cleared frame after decode fails", async () => {
    const cache = createDzbPrmShadowFrameCache();
    const canvas = document.createElement("canvas");
    vi.spyOn(canvas, "toBlob").mockImplementation((callback) => {
      callback(new Blob(["frame"]));
    });
    await cache.put("frame", {
      canvas,
      coordinates: [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
    });
    expect(cache.frameCount).toBe(1);

    let failDecode: (reason?: unknown) => void = () => undefined;
    vi.stubGlobal(
      "createImageBitmap",
      () =>
        new Promise<ImageBitmap>((_, reject) => {
          failDecode = reject;
        })
    );
    const pending = cache.get("frame");
    cache.clear();
    failDecode(new Error("decode failed"));

    await expect(pending).resolves.toBeNull();
    expect(cache.frameCount).toBe(0);
    expect(cache.byteLength).toBe(0);
  });
});
