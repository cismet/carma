import { afterEach, describe, expect, it, vi } from "vitest";

import { acquireRasterDemTerrainTileSource } from "./raster-dem-terrain-tile-source";
import {
  buildGridTile,
  decodeRasterDemHeight,
} from "../../core/raster-dem-tile";

const pendingTileId = { level: 1, x: 1, y: 1 };
const successfulResponse = () =>
  ({ ok: true, blob: async () => new Blob() } as Response);

const createPendingSource = async (name: string) => {
  const pixels = new Uint8ClampedArray(2 * 2 * 4).fill(128);
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ width: 2, height: 2, close: vi.fn() }))
  );
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      getContext() {
        return { drawImage: vi.fn(), getImageData: () => ({ data: pixels }) };
      }
    }
  );
  const requests: {
    signal: AbortSignal;
    resolve: (response: Response) => void;
    reject: (error: unknown) => void;
  }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url: string, { signal }: { signal: AbortSignal }) =>
        new Promise<Response>((resolve, reject) => {
          // Deliberately allow late replies after abort to exercise stale
          // completion guards as well as ordinary cooperative cancellation.
          requests.push({ signal, resolve, reject });
        })
    )
  );
  const source = await acquireRasterDemTerrainTileSource({
    id: name,
    url: `https://example.test/${name}/{z}/{x}/{y}.png`,
    tileSize: 2,
    minzoom: 0,
    maxzoom: 2,
    encoding: "terrarium",
    bounds: [-180, -85, 180, 85],
  });
  return { source, requests };
};

describe("raster DEM terrain tile source", () => {
  it("preserves asymmetric row/column samples including Terrarium blue-channel fractions", () => {
    const pixels = new Uint8ClampedArray(4 * 3 * 4);
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 4; x++)
        pixels.set([128, 100 + y * 10, x * 31, 255], (y * 4 + x) * 4);
    }
    const tile = buildGridTile(
      { level: 15, x: 17023, y: 10926 },
      { width: 4, height: 3, pixels },
      4,
      1
    );
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 4; x++) {
        expect(tile.heightMeters[(y + 1) * 6 + x + 1]).toBe(
          100 + y * 10 + (x * 31) / 256
        );
      }
    }
  });
  it("includes every coarse edge breakpoint in the neighboring finer edge", () => {
    const raster = {
      width: 4,
      height: 4,
      pixels: new Uint8ClampedArray(4 * 4 * 4).fill(128),
    };
    const coarse = buildGridTile({ level: 1, x: 1, y: 0 }, raster, 4, 1);
    const fine = buildGridTile({ level: 2, x: 2, y: 2 }, raster, 4, 1);
    const fineEdge = [...fine.northIndices].map((i) => fine.u[i]);
    for (const index of coarse.southIndices) {
      const childCoordinate = coarse.u[index] * 2;
      if (childCoordinate > 1) continue;
      expect(
        fineEdge.some((value) => Math.abs(value - childCoordinate) < 1e-6)
      ).toBe(true);
    }
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("keeps a prefetched tile loading when foreground adopts it without a signal", async () => {
    const { source, requests } = await createPendingSource("adopt-prefetch");
    const prefetch = new AbortController();
    const cancelled = source.requestTile(pendingTileId, prefetch.signal);
    const foreground = source.requestTile(pendingTileId);
    const reason = new Error("zoomend");
    const cancellation = expect(cancelled).rejects.toBe(reason);
    prefetch.abort(reason);
    await cancellation;
    expect(requests).toHaveLength(1);
    expect(requests[0].signal.aborted).toBe(false);
    requests[0].resolve(successfulResponse());
    const tile = await foreground;
    expect(await source.requestTile(pendingTileId)).toBe(tile);
    expect(requests).toHaveLength(1);
    source.release();
  });

  it("cancels only each caller until the final consumer aborts", async () => {
    const { source, requests } = await createPendingSource("last-consumer");
    const first = new AbortController();
    const second = new AbortController();
    const firstRequest = source.requestTile(pendingTileId, first.signal);
    const secondRequest = source.requestTile(pendingTileId, second.signal);
    const firstReason = new Error("first left");
    const secondReason = new Error("second left");
    const firstCancellation = expect(firstRequest).rejects.toBe(firstReason);
    const secondCancellation = expect(secondRequest).rejects.toBe(secondReason);
    second.abort(secondReason);
    await secondCancellation;
    expect(requests[0].signal.aborted).toBe(false);
    first.abort(firstReason);
    await firstCancellation;
    expect(requests[0].signal.reason).toBe(firstReason);
    requests[0].reject(firstReason);
    source.release();
  });

  it("does not lose a replacement request when a cancelled load finishes late", async () => {
    const { source, requests } = await createPendingSource("replace-cancelled");
    const controller = new AbortController();
    const cancelled = source.requestTile(pendingTileId, controller.signal);
    const cancellation = expect(cancelled).rejects.toThrow();
    controller.abort();
    await cancellation;
    const replacement = source.requestTile(pendingTileId);
    requests[0].resolve(successfulResponse());
    await new Promise((resolve) => setTimeout(resolve, 0));
    const adopted = source.requestTile(pendingTileId);
    expect(requests).toHaveLength(2);
    requests[1].resolve(successfulResponse());
    expect(await adopted).toBe(await replacement);
    source.release();
  });

  it("lets a different error variant retain the shared decode after zoomend", async () => {
    const { source, requests } = await createPendingSource("variant-adoption");
    const controller = new AbortController();
    const prefetch = source.requestTile(pendingTileId, controller.signal, 1);
    const foreground = source.requestTile(pendingTileId, undefined, 0.1);
    const cancellation = expect(prefetch).rejects.toThrow();
    controller.abort();
    await cancellation;
    expect(requests[0].signal.aborted).toBe(false);
    requests[0].resolve(successfulResponse());
    const fine = await foreground;
    expect(await source.requestTile(pendingTileId, undefined, 0.1)).toBe(fine);
    expect(requests).toHaveLength(1);
    expect(createImageBitmap).toHaveBeenCalledOnce();
    source.release();
  });

  it("releases dependent error variants when all their consumers cancel", async () => {
    const { source, requests } = await createPendingSource("variant-cancel");
    const first = new AbortController();
    const second = new AbortController();
    const coarse = source.requestTile(pendingTileId, first.signal, 1);
    const fine = source.requestTile(pendingTileId, second.signal, 0.1);
    const coarseCancellation = expect(coarse).rejects.toThrow();
    const fineCancellation = expect(fine).rejects.toThrow();
    first.abort();
    expect(requests[0].signal.aborted).toBe(false);
    second.abort();
    await Promise.all([coarseCancellation, fineCancellation]);
    expect(requests[0].signal.aborted).toBe(true);
    requests[0].reject(requests[0].signal.reason);
    source.release();
  });

  it("rejects every waiting consumer when the shared source is released", async () => {
    const { source, requests } = await createPendingSource("release-pending");
    const first = source.requestTile(pendingTileId);
    const second = source.requestTile(
      pendingTileId,
      new AbortController().signal
    );
    const third = source.requestTile(pendingTileId, undefined, 0.1);
    const cancellations = [first, second, third].map((promise) =>
      expect(promise).rejects.toThrow()
    );
    source.release();
    await Promise.all(cancellations);
    expect(requests[0].signal.aborted).toBe(true);
    requests[0].resolve(successfulResponse());
    await expect(source.requestTile(pendingTileId)).rejects.toThrow();
  });

  it("retains transient retries after the speculative consumer cancels", async () => {
    vi.useFakeTimers();
    const { source, requests } = await createPendingSource("adopt-retry");
    const controller = new AbortController();
    const prefetch = source.requestTile(pendingTileId, controller.signal);
    const foreground = source.requestTile(pendingTileId);
    const cancellation = expect(prefetch).rejects.toThrow();
    controller.abort();
    await cancellation;
    requests[0].reject(new TypeError("network error"));
    await vi.runAllTimersAsync();
    expect(requests).toHaveLength(2);
    requests[1].resolve(successfulResponse());
    await foreground;
    source.release();
  });

  it("preserves confirmed server errors for all consumers without retrying", async () => {
    const { source, requests } = await createPendingSource("confirmed-error");
    const first = source.requestTile(pendingTileId);
    const second = source.requestTile(pendingTileId, undefined, 0.1);
    const rejections = [first, second].map((promise) =>
      expect(promise).rejects.toMatchObject({ statusCode: 404 })
    );
    requests[0].resolve({ ok: false, status: 404 } as Response);
    await Promise.all(rejections);
    expect(requests).toHaveLength(1);
    source.release();
  });

  it("decodes Terrarium elevations", () => {
    expect(decodeRasterDemHeight(128, 0, 0)).toBe(0);
    expect(decodeRasterDemHeight(128, 100, 128)).toBe(100.5);
  });

  it("keeps mesh-error variants separate while reusing one decoded source", async () => {
    const size = 16;
    const pixels = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y += 1)
      for (let x = 0; x < size; x += 1)
        pixels.set([128, 100, ((x + y) % 2) * 2, 255], (y * size + x) * 4);
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: size, height: size, close: vi.fn() }))
    );
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        getContext() {
          return { drawImage: vi.fn(), getImageData: () => ({ data: pixels }) };
        }
      }
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, blob: async () => new Blob() }))
    );
    const source = await acquireRasterDemTerrainTileSource({
      id: "error-variants",
      url: "https://example.test/error/{z}/{x}/{y}.png",
      tileSize: size,
      minzoom: 0,
      maxzoom: 2,
      encoding: "terrarium",
      bounds: [-180, -85, 180, 85],
    });
    const id = { level: 1, x: 1, y: 1 };
    const [coarse, fine] = await Promise.all([
      source.requestTile(id, undefined, 0.01),
      source.requestTile(id, undefined, 0.001),
    ]);
    expect(coarse.rasterStride).toBe(4);
    expect(fine.rasterStride).toBe(1);
    expect(fine.maximumMeshErrorMeters).toBeLessThanOrEqual(0.001);
    expect(await source.requestTile(id, undefined, 0.001)).toBe(fine);
    expect(await source.requestTile(id, undefined, 0.01)).toBe(coarse);
    expect(fetch).toHaveBeenCalledOnce();
    expect(createImageBitmap).toHaveBeenCalledOnce();
    const second = await acquireRasterDemTerrainTileSource({
      id: "error-variants",
      url: "https://example.test/error/{z}/{x}/{y}.png",
      tileSize: size,
      minzoom: 0,
      maxzoom: 2,
      encoding: "terrarium",
      bounds: [-180, -85, 180, 85],
    });
    source.release();
    source.release();
    expect(await second.requestTile(id, undefined, 0.001)).toBe(fine);
    expect(fetch).toHaveBeenCalledOnce();
    second.release();
    await expect(second.requestTile(id)).rejects.toThrow();
    const restored = await acquireRasterDemTerrainTileSource({
      id: "error-variants",
      url: "https://example.test/error/{z}/{x}/{y}.png",
      tileSize: size,
      minzoom: 0,
      maxzoom: 2,
      encoding: "terrarium",
      bounds: [-180, -85, 180, 85],
    });
    expect(await restored.requestTile(id, undefined, 0.001)).not.toBe(fine);
    expect(fetch).toHaveBeenCalledTimes(2);
    restored.release();
  });

  it("uses XYZ tile bounds and builds a skirtless height grid", async () => {
    const pixels = new Uint8ClampedArray([
      128, 100, 0, 255, 128, 101, 0, 255, 128, 102, 0, 255, 128, 103, 0, 255,
    ]);
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 2, height: 2, close }))
    );
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        constructor(readonly width: number, readonly height: number) {}
        getContext() {
          return {
            drawImage: vi.fn(),
            getImageData: () => ({ data: pixels }),
          };
        }
      }
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        blob: async () => new Blob(),
      }))
    );
    const source = await acquireRasterDemTerrainTileSource(
      {
        id: "test-grid",
        url: "https://example.test/{z}/{x}/{y}.png",
        tileSize: 2,
        minzoom: 0,
        maxzoom: 2,
        encoding: "terrarium",
        bounds: [-180, -85, 180, 85],
      },
      { meshSegments: 2 }
    );

    const tile = await source.requestTile({ level: 1, x: 1, y: 1 });

    expect(fetch).toHaveBeenCalledWith("https://example.test/1/1/1.png", {
      signal: expect.any(AbortSignal),
    });
    expect(tile.bounds.west).toBe(0);
    expect(tile.bounds.east).toBe(180);
    expect(tile.heightMeters).toHaveLength(16);
    expect(tile.indices).toHaveLength(54);
    expect(tile.westIndices).toEqual(new Uint32Array([0, 4, 8, 12]));
    // Native samples stay at pixel centers; only the outer ring is stitched.
    expect([...tile.u.slice(4, 8)]).toEqual([0, 0.25, 0.75, 1]);
    expect([
      tile.heightMeters[5],
      tile.heightMeters[6],
      tile.heightMeters[9],
      tile.heightMeters[10],
    ]).toEqual([100, 101, 102, 103]);
    const firstPixelLatitude =
      (Math.atan(Math.sinh(Math.PI * (1 - (2 * 1.25) / 2))) * 180) / Math.PI;
    expect(source.sampleHeight(45, firstPixelLatitude)).toBeCloseTo(100, 8);
    expect(tile.minimumHeightMeters).toBe(100);
    expect(tile.maximumHeightMeters).toBe(103);
    expect(close).toHaveBeenCalledOnce();
  });
});
