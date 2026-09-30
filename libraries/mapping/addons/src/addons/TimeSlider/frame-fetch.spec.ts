import { describe, expect, it, vi } from "vitest";

import {
  FRAME_LOG_PREFIX,
  createFrameCache,
  frameCacheKey,
  getSharedFrameCache,
  normalizeFrameScale,
} from "./frame-fetch";

const WMS = "https://example.test/geoserver/wms?SERVICE=WMS";
const GET_MAP = `${WMS}&request=GetMap&srs=EPSG%3A3857&bbox=1%2C2%2C3%2C4`;

/** signature, one byte of body, the IEND chunk: what the check looks at */
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0xff, 0xd9]);
const SERVICE_EXCEPTION =
  '<?xml version="1.0"?><ServiceExceptionReport><ServiceException>' +
  "Could not find layer</ServiceException></ServiceExceptionReport>";

const png = () =>
  new Response(PNG, { headers: { "content-type": "image/png" } });
const exception = () =>
  new Response(SERVICE_EXCEPTION, {
    headers: { "content-type": "application/vnd.ogc.se_xml" },
  });

type FetchMock = ReturnType<
  typeof vi.fn<Parameters<typeof fetch>, Promise<Response>>
>;

const fetchOf = (...answers: (() => Response | Promise<Response>)[]) => {
  let call = 0;
  return vi.fn<Parameters<typeof fetch>, Promise<Response>>(async () => {
    const answer = answers[Math.min(call, answers.length - 1)];
    call++;
    return answer();
  });
};

const cacheModes = (fetchImpl: FetchMock) =>
  fetchImpl.mock.calls.map((call) => call[1]?.cache);

/** no pauses between attempts, and the warnings caught */
const quick = () => ({ retryDelaysMs: [0, 0, 0], warn: vi.fn() });

describe("createFrameCache", () => {
  it("asks the http cache for any kept response", async () => {
    const fetchImpl = fetchOf(png);
    const load = createFrameCache(fetchImpl, quick());

    const blob = await load(GET_MAP);

    expect(blob.size).toBe(PNG.length);
    expect(cacheModes(fetchImpl)).toEqual(["force-cache"]);
  });

  it("requests a view that differs only in float noise under one url", async () => {
    const fetchImpl = fetchOf(png);
    const load = createFrameCache(fetchImpl, quick());

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

  it("scales width and height, whatever their case", () => {
    const key = frameCacheKey(
      `${GET_MAP}&width=5682&HEIGHT=3165&layers=a`,
      0.5
    );

    expect(key).toContain("width=2841");
    expect(key).toContain("HEIGHT=1583");
    expect(key).toContain("bbox=1.00%2C2.00%2C3.00%2C4.00");
  });

  it("scales a geographic request too", () => {
    const key = frameCacheKey(
      `${WMS}&request=GetMap&srs=EPSG%3A4326&bbox=7.1508%2C51.26%2C7.168%2C51.27&width=100&height=50`,
      0.5
    );

    expect(key).toContain("width=50");
    expect(key).toContain("height=25");
    expect(key).toContain("bbox=7.1508%2C51.26%2C7.168%2C51.27");
  });

  it("goes through the http cache the normal way without forceCache", async () => {
    const fetchImpl = fetchOf(exception, png);
    const load = createFrameCache(fetchImpl, { ...quick(), forceCache: false });

    await load(GET_MAP);

    expect(cacheModes(fetchImpl)).toEqual(["default", "reload"]);
  });

  it("asks the WMS for the scaled frame", async () => {
    const fetchImpl = fetchOf(png);
    const load = createFrameCache(fetchImpl, { ...quick(), scale: 0.5 });

    await load(`${GET_MAP}&width=400&height=200`);

    expect(fetchImpl.mock.calls[0]?.[0]).toContain("width=200&height=100");
  });

  it("takes a JPEG frame", async () => {
    const load = createFrameCache(
      fetchOf(
        () => new Response(JPEG, { headers: { "content-type": "image/jpeg" } })
      ),
      quick()
    );

    await expect(load(GET_MAP)).resolves.toBeInstanceOf(Blob);
  });

  it("retries a network error from the WMS, bypassing the cache", async () => {
    const fetchImpl = fetchOf(() => {
      throw new TypeError("Failed to fetch");
    }, png);
    const load = createFrameCache(fetchImpl, quick());

    const blob = await load(GET_MAP);

    expect(blob.size).toBe(PNG.length);
    expect(cacheModes(fetchImpl)).toEqual(["force-cache", "reload"]);
  });

  it("retries a failed request", async () => {
    const fetchImpl = fetchOf(
      () => new Response("", { status: 503 }),
      () => new Response("", { status: 502 }),
      png
    );
    const load = createFrameCache(fetchImpl, quick());

    await expect(load(GET_MAP)).resolves.toBeInstanceOf(Blob);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("reloads a kept WMS exception, so the cache entry is replaced", async () => {
    const fetchImpl = fetchOf(exception, png);
    const warn = vi.fn();
    const load = createFrameCache(fetchImpl, { retryDelaysMs: [0, 0, 0], warn });

    const blob = await load(GET_MAP);

    expect(blob.size).toBe(PNG.length);
    expect(cacheModes(fetchImpl)).toEqual(["force-cache", "reload"]);
    expect(fetchImpl.mock.calls[1]?.[0]).toBe(fetchImpl.mock.calls[0]?.[0]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("does not take a PNG that was cut short", async () => {
    const fetchImpl = fetchOf(
      () =>
        new Response(PNG.slice(0, 12), {
          headers: { "content-type": "image/png" },
        }),
      png
    );
    const load = createFrameCache(fetchImpl, quick());

    await load(GET_MAP);

    expect(cacheModes(fetchImpl)).toEqual(["force-cache", "reload"]);
  });

  it("does not take a body that says image/png but is none", async () => {
    const fetchImpl = fetchOf(
      () =>
        new Response(SERVICE_EXCEPTION, {
          headers: { "content-type": "image/png" },
        }),
      png
    );
    const load = createFrameCache(fetchImpl, quick());

    await load(GET_MAP);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("gives up after four attempts and says why", async () => {
    const fetchImpl = fetchOf(exception);
    const warn = vi.fn();
    const load = createFrameCache(fetchImpl, { retryDelaysMs: [0, 0, 0], warn });

    await expect(load(GET_MAP)).rejects.toThrow(
      "GetMap failed: content-type application/vnd.ogc.se_xml"
    );
    expect(cacheModes(fetchImpl)).toEqual([
      "force-cache",
      "reload",
      "reload",
      "reload",
    ]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      FRAME_LOG_PREFIX,
      "frame given up",
      expect.objectContaining({
        url: frameCacheKey(GET_MAP),
        status: 200,
        contentType: "application/vnd.ogc.se_xml",
        attempts: 4,
      })
    );
  });

  it("waits between attempts", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = fetchOf(() => new Response("", { status: 500 }), png);
      const load = createFrameCache(fetchImpl, {
        retryDelaysMs: [1000],
        warn: vi.fn(),
      });

      const pending = load(GET_MAP);
      await vi.advanceTimersByTimeAsync(999);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await expect(pending).resolves.toBeInstanceOf(Blob);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("normalizeFrameScale", () => {
  it("takes a fraction", () => {
    expect(normalizeFrameScale(0.5)).toBe(0.5);
  });

  it("means the full frame when missing, zero, one or more, or not a number", () => {
    expect(normalizeFrameScale(undefined)).toBe(1);
    expect(normalizeFrameScale(0)).toBe(1);
    expect(normalizeFrameScale(1)).toBe(1);
    expect(normalizeFrameScale(2)).toBe(1);
    expect(normalizeFrameScale(Number.NaN)).toBe(1);
  });
});

describe("getSharedFrameCache", () => {
  it("hands out one fetch per scale and cache mode", () => {
    expect(getSharedFrameCache(0.5, true)).toBe(getSharedFrameCache(0.5, true));
    expect(getSharedFrameCache(0.5, true)).not.toBe(
      getSharedFrameCache(0.5, false)
    );
    expect(getSharedFrameCache(0.5, true)).not.toBe(getSharedFrameCache());
  });
});
