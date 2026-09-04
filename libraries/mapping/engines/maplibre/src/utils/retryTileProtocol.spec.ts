import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchTileWithRetry,
  stripRetryTileProtocol,
  withRetryTileProtocol,
} from "./retryTileProtocol";

const response = (status: number, body = new ArrayBuffer(4)): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "Cache-Control": "max-age=60" }),
    arrayBuffer: () => Promise.resolve(body),
  } as unknown as Response);

describe("retry tile protocol", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("wraps and unwraps tile URLs", () => {
    const url = "https://tiles.test/{z}/{x}/{y}.png";
    expect(withRetryTileProtocol(url)).toBe(`carma-retry://${url}`);
    expect(withRetryTileProtocol(withRetryTileProtocol(url))).toBe(
      `carma-retry://${url}`
    );
    expect(stripRetryTileProtocol(`carma-retry://${url}`)).toBe(url);
  });

  it("retries a broken transfer and an overloaded host until the tile arrives", async () => {
    const body = new ArrayBuffer(8);
    const fetchImpl = vi
      .fn<[string, RequestInit], Promise<Response>>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(200, body));

    const pending = fetchTileWithRetry(
      { url: "carma-retry://https://tiles.test/1/2/3.png" },
      new AbortController(),
      fetchImpl as unknown as typeof fetch
    );
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result.data).toBe(body);
    expect(result.cacheControl).toBe("max-age=60");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls[0][0]).toBe("https://tiles.test/1/2/3.png");
  });

  it("gives up at once when the server refuses the tile", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(404));

    await expect(
      fetchTileWithRetry(
        { url: "carma-retry://https://tiles.test/1/2/3.png" },
        new AbortController(),
        fetchImpl as unknown as typeof fetch
      )
    ).rejects.toMatchObject({ status: 404 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("stops retrying when MapLibre aborts the request", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn().mockResolvedValue(response(503));

    const pending = fetchTileWithRetry(
      { url: "carma-retry://https://tiles.test/1/2/3.png" },
      controller,
      fetchImpl as unknown as typeof fetch
    );
    const settled = pending.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(10);
    controller.abort(new Error("stale"));
    await expect(settled).resolves.toMatchObject({ message: "stale" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
