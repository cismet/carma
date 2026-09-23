import { describe, expect, it, vi } from "vitest";

import { createRasterCache, rasterCacheKey } from "./raster-cache";

const okFetch = (length: number) =>
  vi.fn<Parameters<typeof fetch>, Promise<Response>>(
    async () => new Response(new Uint8Array(length).buffer)
  );

describe("createRasterCache", () => {
  it("asks the http cache for any kept response", async () => {
    const fetchImpl = okFetch(10);
    const load = createRasterCache(fetchImpl);

    const buffer = await load("https://example.test/u.tif");

    expect(buffer.byteLength).toBe(10);
    expect(fetchImpl.mock.calls[0]?.[1]?.cache).toBe("force-cache");
  });

  it("requests a view box that differs only in float noise under one url", async () => {
    const fetchImpl = okFetch(10);
    const load = createRasterCache(fetchImpl);

    await load(
      "https://example.test/gdalProcessor?BBOX=7.1508%2C51.2615%2C7.168%2C51.2516&LAYERS=u"
    );
    await load(
      "https://example.test/gdalProcessor?BBOX=7.150799999998981%2C51.26150000000002%2C7.168%2C51.2516&LAYERS=u"
    );

    const [first, second] = fetchImpl.mock.calls.map((call) => call[0]);
    expect(first).toBe(second);
    expect(first).toContain("BBOX=7.15080%2C51.26150%2C7.16800%2C51.25160");
  });

  it("leaves a url without a BBOX as it is", () => {
    expect(rasterCacheKey("https://example.test/u.tif")).toBe(
      "https://example.test/u.tif"
    );
  });

  it("passes the abort signal on", async () => {
    const fetchImpl = okFetch(10);
    const controller = new AbortController();

    await createRasterCache(fetchImpl)("https://example.test/u", controller.signal);

    expect(fetchImpl.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });

  it("rejects on a failed request like a plain fetch", async () => {
    const load = createRasterCache(
      vi.fn(async () => new Response("", { status: 500 }))
    );

    await expect(load("https://example.test/u")).rejects.toThrow(
      "gdalProcessor HTTP 500"
    );
  });
});
