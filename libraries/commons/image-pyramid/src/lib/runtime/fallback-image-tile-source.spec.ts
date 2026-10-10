import { afterEach, describe, expect, it, vi } from "vitest";
import type { DevicePixels } from "@carma-units";
import {
  AvifAssetChangedError,
  AvifHttpError,
  AvifRepresentationError,
  NativeAvifFormatError,
} from "./avif-source-errors";
import { AvifTileSource } from "./avif-tile-source";
import {
  FallbackImageTileSource,
  type ImageTileSourceFactory,
} from "./fallback-image-tile-source";
import { createImageTileSource } from "./image-level-stack-pool";
import {
  ImagePrefetchBudgetExceeded,
  type ImagePyramid,
  type ImageTileRef,
  type ImageTileSource,
} from "./image-tile-source";
import { JpegTileSource } from "./jpeg-tile-source";

const pyramid: ImagePyramid = {
  native: { width: 1024 as DevicePixels, height: 1024 as DevicePixels },
  levels: [],
};
const tile: ImageTileRef = { level: 1, col: 0, row: 0 };
const signal = () => new AbortController().signal;
let sourceNumber = 0;
const fixture = (kind: ImageTileSource["kind"] = "avif") => {
  const source: ImageTileSource = {
    kind,
    url: `https://example.invalid/fallback-${++sourceNumber}.${kind}`,
    priority: "high",
    open: vi.fn(async () => pyramid),
    hasBytes: vi.fn(() => true),
    fetch: vi.fn(async () => undefined),
    decode: vi.fn(async () => ({ width: 32, height: 32 } as ImageBitmap)),
    compressedBytes: 17,
    requestCount: 1,
    pause: vi.fn(),
    dispose: vi.fn(),
  };
  const factory: ImageTileSourceFactory = {
    kind,
    url: source.url,
    create: vi.fn(() => source),
  };
  return { source, factory };
};

afterEach(() => vi.restoreAllMocks());

describe("FallbackImageTileSource", () => {
  it("keeps a successful primary and forwards tile work without opening fallbacks", async () => {
    const primary = fixture(),
      fallback = fixture("jpeg");
    const source = new FallbackImageTileSource(primary.factory, [
      fallback.factory,
    ]);
    expect(await source.open(signal())).toBe(pyramid);
    expect(source.kind).toBe("avif");
    expect(source.url).toBe(primary.source.url);
    expect(source.hasBytes(tile)).toBe(true);
    const requestSignal = signal(),
      ready = vi.fn();
    await source.fetch([tile], requestSignal, "low", ready);
    await source.decode(tile, requestSignal);
    expect(primary.source.fetch).toHaveBeenCalledWith(
      [tile],
      requestSignal,
      "low",
      ready
    );
    expect(primary.source.decode).toHaveBeenCalledWith(tile, requestSignal);
    expect(primary.source.open).toHaveBeenCalledTimes(1);
    expect(fallback.factory.create).not.toHaveBeenCalled();
    expect(source.compressedBytes).toBe(17);
    source.pause();
    source.dispose();
    source.dispose();
    expect(primary.source.pause).toHaveBeenCalledTimes(1);
    expect(primary.source.dispose).toHaveBeenCalledTimes(1);
  });

  it.each([404, 410])(
    "selects another representation on HTTP %s and keeps its bytes separate",
    async (status) => {
      const primary = fixture(),
        fallback = fixture("jpeg");
      vi.mocked(primary.source.open).mockRejectedValue(
        new AvifHttpError(status, primary.source.url)
      );
      const source = new FallbackImageTileSource(primary.factory, [
        fallback.factory,
      ]);
      await source.open(signal());
      expect(primary.source.dispose).toHaveBeenCalledTimes(1);
      expect(source.kind).toBe("jpeg");
      expect(source.url).toBe(fallback.source.url);
      expect(source.compressedBytes).toBe(17);
      expect(source.requestCount).toBe(2);
      await source.fetch([tile], signal());
      expect(primary.source.fetch).not.toHaveBeenCalled();
      expect(fallback.source.fetch).toHaveBeenCalledTimes(1);
      await source.open(signal());
      expect(primary.source.open).toHaveBeenCalledTimes(1);
      source.dispose();
    }
  );

  it("retries missing primary URLs on a new source after five minutes, without switching an existing selection", async () => {
    let now = 1000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const primary = fixture(),
      fallback = fixture("jpeg");
    vi.mocked(primary.source.open).mockRejectedValueOnce(
      new AvifHttpError(404, primary.source.url)
    );
    const first = new FallbackImageTileSource(primary.factory, [
      fallback.factory,
    ]);
    await first.open(signal());
    const second = new FallbackImageTileSource(primary.factory, [
      fallback.factory,
    ]);
    await second.open(signal());
    expect(primary.factory.create).toHaveBeenCalledTimes(1);
    expect(second.kind).toBe("jpeg");
    now += 5 * 60 * 1000;
    await first.open(signal());
    expect(first.kind).toBe("jpeg");
    const third = new FallbackImageTileSource(primary.factory, [
      fallback.factory,
    ]);
    await third.open(signal());
    expect(third.kind).toBe("avif");
    expect(primary.factory.create).toHaveBeenCalledTimes(2);
    first.dispose();
    second.dispose();
    third.dispose();
  });

  it.each([
    new DOMException("Canceled", "AbortError"),
    new NativeAvifFormatError("Bad native metadata"),
    new AvifRepresentationError("Compressed range representation"),
    new AvifAssetChangedError(),
    new ImagePrefetchBudgetExceeded(),
    new AvifHttpError(403, "https://example.invalid/denied.avif"),
    new Error("Unexpected parser error"),
  ])("does not switch representations for %s", async (error) => {
    const primary = fixture(),
      fallback = fixture("jpeg");
    vi.mocked(primary.source.open).mockRejectedValue(error);
    const source = new FallbackImageTileSource(
      primary.factory,
      [fallback.factory],
      { fallbackOnTransientError: true }
    );
    await expect(source.open(signal())).rejects.toBe(error);
    expect(fallback.factory.create).not.toHaveBeenCalled();
    source.dispose();
  });

  it.each([
    new AvifHttpError(503, "https://example.invalid/down.avif"),
    new TypeError("Failed to fetch"),
  ])(
    "only opts into transient fallback and never negative-caches %s",
    async (error) => {
      const primary = fixture(),
        fallback = fixture();
      vi.mocked(primary.source.open).mockRejectedValue(error);
      const strict = new FallbackImageTileSource(primary.factory, [
        fallback.factory,
      ]);
      await expect(strict.open(signal())).rejects.toBe(error);
      strict.dispose();
      const transient = new FallbackImageTileSource(
        primary.factory,
        [fallback.factory],
        { fallbackOnTransientError: true }
      );
      await transient.open(signal());
      expect(transient.url).toBe(fallback.source.url);
      transient.dispose();
      vi.mocked(primary.source.open).mockResolvedValue(pyramid);
      const retry = new FallbackImageTileSource(primary.factory, [
        fallback.factory,
      ]);
      await retry.open(signal());
      expect(retry.url).toBe(primary.source.url);
      retry.dispose();
    }
  );

  it("does not switch when a selected representation later fails a tile request", async () => {
    const primary = fixture(),
      fallback = fixture();
    const error = new AvifHttpError(404, primary.source.url);
    vi.mocked(primary.source.fetch).mockRejectedValue(error);
    const source = new FallbackImageTileSource(primary.factory, [
      fallback.factory,
    ]);
    await source.open(signal());
    await expect(source.fetch([tile], signal())).rejects.toBe(error);
    expect(source.url).toBe(primary.source.url);
    expect(fallback.factory.create).not.toHaveBeenCalled();
    source.dispose();
  });

  it("applies foreground promotion before opening the fallback and removes speculative budgets", async () => {
    const primary = fixture(),
      fallback = fixture();
    let fail!: (error: Error) => void;
    vi.mocked(primary.source.open).mockImplementation(
      () =>
        new Promise((_, reject) => {
          fail = reject;
        })
    );
    const source = new FallbackImageTileSource(primary.factory, [
      fallback.factory,
    ]);
    const budget = { remainingBytes: 100 };
    source.priority = "low";
    source.prefetchBudget = budget;
    const opening = source.open(signal());
    expect(primary.source.priority).toBe("low");
    expect(primary.source.prefetchBudget).toBe(budget);
    source.priority = "high";
    expect(primary.source.prefetchBudget).toBeUndefined();
    vi.mocked(fallback.source.open).mockImplementation(async () => {
      expect(fallback.source.priority).toBe("high");
      expect(fallback.source.prefetchBudget).toBeUndefined();
      return pyramid;
    });
    fail(new AvifHttpError(404, primary.source.url));
    await opening;
    await source.fetch([tile], signal());
    expect(vi.mocked(fallback.source.fetch).mock.calls[0][2]).toBe("high");
    source.dispose();
  });

  it("passes the same speculative allowance through a fallback without resetting consumed bytes", async () => {
    const primary = fixture(),
      fallback = fixture();
    const budget = { remainingBytes: 100 };
    vi.mocked(primary.source.open).mockImplementation(async () => {
      budget.remainingBytes -= 16;
      throw new AvifHttpError(404, primary.source.url);
    });
    vi.mocked(fallback.source.open).mockImplementation(async () => {
      expect(fallback.source.prefetchBudget).toBe(budget);
      expect(budget.remainingBytes).toBe(84);
      return pyramid;
    });
    const source = new FallbackImageTileSource(primary.factory, [
      fallback.factory,
    ]);
    source.priority = "low";
    source.prefetchBudget = budget;
    await source.open(signal());
    source.dispose();
  });

  it("shares an opening between callers and keeps another caller alive when one aborts", async () => {
    const primary = fixture(),
      fallback = fixture();
    let finish!: (value: ImagePyramid) => void;
    vi.mocked(primary.source.open).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const source = new FallbackImageTileSource(primary.factory, [
      fallback.factory,
    ]);
    const first = new AbortController();
    const a = source.open(first.signal),
      b = source.open(signal());
    first.abort();
    await expect(a).rejects.toMatchObject({ name: "AbortError" });
    finish(pyramid);
    await expect(b).resolves.toBe(pyramid);
    expect(primary.source.open).toHaveBeenCalledTimes(1);
    expect(fallback.factory.create).not.toHaveBeenCalled();
    source.dispose();
  });

  it("does not create sources for an already aborted caller and does not start fallbacks after disposal", async () => {
    const primary = fixture(),
      fallback = fixture();
    let fail!: (error: Error) => void;
    vi.mocked(primary.source.open).mockImplementation(
      () =>
        new Promise((_, reject) => {
          fail = reject;
        })
    );
    const source = new FallbackImageTileSource(primary.factory, [
      fallback.factory,
    ]);
    const aborted = new AbortController();
    aborted.abort();
    await expect(source.open(aborted.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(primary.factory.create).not.toHaveBeenCalled();
    const pending = source.open(signal());
    source.dispose();
    fail(new AvifHttpError(404, primary.source.url));
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fallback.factory.create).not.toHaveBeenCalled();
  });
});

describe("createImageTileSource fallback descriptors", () => {
  it.each(["jpeg", "avif"] as const)(
    "uses a separate %s fallback for a missing native URL",
    async (kind) => {
      const primary = `https://example.invalid/native-${++sourceNumber}.avif`,
        fallback = `https://example.invalid/legacy-${sourceNumber}.${kind}`;
      vi.spyOn(AvifTileSource.prototype, "open").mockImplementation(
        async function (this: AvifTileSource) {
          if (this.url === primary) throw new AvifHttpError(404, this.url);
          return pyramid;
        }
      );
      vi.spyOn(JpegTileSource.prototype, "open").mockResolvedValue(pyramid);
      const source = createImageTileSource({
        id: "photo",
        kind: "avif",
        url: primary,
        fallbacks: [
          {
            kind,
            url: fallback,
            nativeSize: pyramid.native,
            jpegLevels: [1, 2, 3],
          },
        ],
      });
      await source.open(signal());
      expect(source.kind).toBe(kind);
      expect(source.url).toBe(fallback);
      source.dispose();
    }
  );
});
