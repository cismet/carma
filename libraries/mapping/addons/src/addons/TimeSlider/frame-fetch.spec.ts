import { describe, expect, it, vi } from "vitest";

import { createFrameCache, frameCacheKey } from "./frame-fetch";

const WMS = "https://example.test/geoserver/wms?SERVICE=WMS";

const okFetch = () =>
  vi.fn<Parameters<typeof fetch>, Promise<Response>>(
    async () => new Response(new Uint8Array(4), { headers: { "content-type": "image/png" } })
  );

describe("createFrameCache", () => {
  it("asks the http cache for any kept response", async () => {
    const fetchImpl = okFetch();
    const load = createFrameCache(fetchImpl);

    const blob = await load(`${WMS}&request=GetMap&srs=EPSG%3A3857&bbox=1%2C2%2C3%2C4`);

    expect(blob.size).toBe(4);
    expect(fetchImpl.mock.calls[0]?.[1]?.cache).toBe("force-cache");
  });

  it("requests a view that differs only in float noise under one url", async () => {
    const fetchImpl = okFetch();
    const load = createFrameCache(fetchImpl);

    await load(
      `${WMS}&request=GetMap&srs=EPSG%3A3857&bbox=795123.4567%2C6660000.001%2C797000%2C6662000&layers=a`
    );
    await load(
      `${WMS}&request=GetMap&srs=EPSG%3A3857&bbox=795123.45670000001%2C6660000.0009999999%2C797000.0000000001%2C6662000&layers=a`
    );

    const [first, second] = fetchImpl.mock.calls.map((call) => call[0]);
    expect(first).toBe(second);
    expect(first).toContain("bbox=795123.46%2C6660000.00%2C797000.00%2C6662000.00");
  });

  it("keeps the rest of the url as it was", () => {
    const key = frameCacheKey(
      `${WMS}&request=GetMap&srs=EPSG%3A3857&bbox=1%2C2%2C3%2C4&layers=starkregen%3AL_T50`
    );

    expect(key).toContain("SERVICE=WMS");
    expect(key).toContain("layers=starkregen%3AL_T50");
  });

  it("leaves a geographic bbox as it is", () => {
    const url = `${WMS}&request=GetMap&srs=EPSG%3A4326&bbox=7.1508%2C51.26%2C7.168%2C51.27`;

    expect(frameCacheKey(url)).toBe(url);
  });

  it("leaves a url without a bbox as it is", () => {
    expect(frameCacheKey(WMS)).toBe(WMS);
  });

  it("rejects on a failed request like a plain fetch", async () => {
    const load = createFrameCache(
      vi.fn(async () => new Response("", { status: 500 }))
    );

    await expect(load(`${WMS}&request=GetMap`)).rejects.toThrow("GetMap HTTP 500");
  });
});
