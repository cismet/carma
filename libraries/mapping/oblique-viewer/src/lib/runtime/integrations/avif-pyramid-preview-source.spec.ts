// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DevicePixels } from "@carma-units";
import { AvifPyramidPreviewSource } from "./avif-pyramid-preview-source";
const native = { width: 1024 as DevicePixels, height: 768 as DevicePixels };
const windowOf = (width: number, height: number) => ({
  source: {
    x: 0 as DevicePixels,
    y: 0 as DevicePixels,
    width: native.width,
    height: native.height,
  },
  target: { width: width as DevicePixels, height: height as DevicePixels },
});
const index = {
  schema: 1,
  format: "avif-independent-pyramid",
  baseLevel: 1,
  sourceSensorDimensions: [1024, 768],
  levels: {
    1: { offset: 0, length: 4096, width: 512, height: 384, scale: 0.5 },
    2: { offset: 4096, length: 4096, width: 256, height: 192, scale: 0.25 },
    3: { offset: 8192, length: 1024, width: 128, height: 96, scale: 0.125 },
  },
};
function mockMetadata() {
  const footer = new Uint8Array(16);
  footer.set(new TextEncoder().encode("pyridx01"));
  new DataView(footer.buffer).setBigUint64(8, 12000n);
  const metadata = new Uint8Array(4096);
  metadata.set(new TextEncoder().encode(JSON.stringify(index)));
  const fetch = vi.fn(
    async (_url: RequestInfo | URL, options?: RequestInit) => {
      if (options?.method === "HEAD")
        return new Response(null, {
          status: 200,
          headers: { "Content-Length": "20000" },
        });
      const range = new Headers(options?.headers).get("Range");
      if (range !== "bytes=19984-19999" && range !== "bytes=12000-16095")
        throw Error(`Unexpected range ${range}`);
      const bytes = range === "bytes=19984-19999" ? footer : metadata;
      return new Response(bytes, {
        status: 206,
        headers: {
          "Content-Length": String(bytes.length),
          "Content-Range":
            range === "bytes=19984-19999"
              ? "bytes 19984-19999/20000"
              : "bytes 12000-16095/20000",
        },
      });
    }
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
afterEach(() => vi.unstubAllGlobals());
describe("calibrated bounded AVIF pyramid preview", () => {
  it("selects coarse then only physically needed refinements and reuses metadata", async () => {
    const fetch = mockMetadata(),
      source = new AvifPyramidPreviewSource("https://images.test/photo.avif"),
      signal = new AbortController().signal;
    const selected = await source.select(windowOf(512, 384), native, signal, 8);
    expect(selected.image.level).toBe(3);
    expect(selected.refinements.map((page) => page.level)).toEqual([2, 1]);
    const coarse = await source.select(windowOf(128, 96), native, signal, 1);
    expect(coarse.image.level).toBe(3);
    expect(coarse.refinements).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(new Headers(fetch.mock.calls[1][1]?.headers).get("Range")).toBe(
      "bytes=19984-19999"
    );
    source.close();
  });
  it("rejects a full response before reading its body", async () => {
    const full = new Response(new Uint8Array(20000), { status: 200 });
    const arrayBuffer = vi.spyOn(full, "arrayBuffer");
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { headers: { "Content-Length": "20000" } })
      )
      .mockResolvedValueOnce(full);
    vi.stubGlobal("fetch", fetch);
    await expect(
      new AvifPyramidPreviewSource("https://images.test/photo.avif").select(
        windowOf(128, 96),
        native,
        new AbortController().signal
      )
    ).rejects.toThrow("requires HTTP 206");
    expect(arrayBuffer).not.toHaveBeenCalled();
  });
  it("rejects camera calibration mismatch and already-aborted requests", async () => {
    const fetch = mockMetadata(),
      source = new AvifPyramidPreviewSource("https://images.test/photo.avif");
    await expect(
      source.select(
        windowOf(128, 96),
        { ...native, width: 2048 as DevicePixels },
        new AbortController().signal
      )
    ).rejects.toThrow("camera calibration");
    const controller = new AbortController();
    controller.abort();
    await expect(
      source.select(windowOf(128, 96), native, controller.signal)
    ).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(3);
    source.close();
  });
  it("stops a 206 body that exceeds its requested range even without a declared length", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { headers: { "Content-Length": "20000" } })
      )
      .mockResolvedValueOnce(new Response(new Uint8Array(32), { status: 206 }));
    vi.stubGlobal("fetch", fetch);
    await expect(
      new AvifPyramidPreviewSource("https://images.test/photo.avif").select(
        windowOf(128, 96),
        native,
        new AbortController().signal
      )
    ).rejects.toThrow("exceeds requested budget");
  });
});
