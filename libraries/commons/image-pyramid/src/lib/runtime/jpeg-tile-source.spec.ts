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

describe("JPEG thumbnail cache revision", () => {
  const native = { width: 512 as DevicePixels, height: 512 as DevicePixels };
  const signal = () => new AbortController().signal;
  const tile = (level: number) => [{ level, col: 0, row: 0 }];

  it("keeps the coarsest loaded response revision when finer levels arrive or leave RAM", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(new Uint8Array(16), { headers: { ETag: '"coarse-v1"' } })
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array(32), { headers: { ETag: '"fine-v9"' } })
      );
    vi.stubGlobal("fetch", fetch);
    const source = new JpegTileSource(
      "https://images.test/1/image.jpg",
      native
    );
    expect(source.cacheRevision).toBeUndefined();
    await source.fetch(tile(6), signal());
    const revision = source.cacheRevision;
    expect(JSON.parse(revision!)).toEqual([
      "https://images.test/6/image.jpg",
      '"coarse-v1"',
      null,
      16,
    ]);
    await source.fetch(tile(1), signal());
    expect(source.cacheRevision).toBe(revision);
    source.trimCompressedTo(0);
    expect(source.hasBytes(tile(1)[0])).toBe(false);
    expect(source.cacheRevision).toBe(revision);
    source.dispose();
  });

  it("does not invent a revision when server validators are unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array(16), {
          headers: { "Content-Length": "16" },
        })
      )
    );
    const source = new JpegTileSource(
      "https://images.test/1/image.jpg",
      native
    );
    await source.fetch(tile(6), signal());
    expect(source.cacheRevision).toBeUndefined();
    source.dispose();
  });

  it("waits for the complete level instead of using a partial size probe", async () => {
    const modified = "Sat, 10 Oct 2026 08:00:00 GMT";
    const header = new Uint8Array([255, 216, 255, 192, 0, 8, 8, 2, 0, 2, 0, 0]);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(header, {
          status: 206,
          headers: {
            "Content-Range": "bytes 0-11/1024",
            "Last-Modified": modified,
          },
        })
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array(1024), {
          headers: { "Last-Modified": modified },
        })
      );
    vi.stubGlobal("fetch", fetch);
    const source = new JpegTileSource(
      "https://images.test/6/image.jpg",
      native,
      [6]
    );
    await source.open(signal());
    expect(source.cacheRevision).toBeUndefined();
    await source.fetch(tile(6), signal());
    expect(JSON.parse(source.cacheRevision!)).toEqual([
      "https://images.test/6/image.jpg",
      null,
      modified,
      1024,
    ]);
    source.dispose();
  });
});

describe("JPEG fetch-local allowance", () => {
  it("checks a late oversized response against the captured low budget after promotion", async () => {
    const header = new Uint8Array([255, 216, 255, 192, 0, 8, 8, 2, 0, 2, 0, 0]);
    let finish!: (value: Response) => void;
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(header, {
          status: 206,
          headers: { "Content-Range": "bytes 0-11/1024" },
        })
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          })
      );
    vi.stubGlobal("fetch", fetch);
    const source = new JpegTileSource(
      "https://images.test/6/captured.jpg",
      { width: 512 as DevicePixels, height: 512 as DevicePixels },
      [6]
    );
    const signal = new AbortController().signal;
    await source.open(signal);
    const budget = { remainingBytes: 1024 };
    source.prefetchBudget = budget;
    const pending = source.fetch([{ level: 6, col: 0, row: 0 }], signal, "low");
    source.prefetchBudget = undefined;
    finish(
      new Response(new Uint8Array(2048), {
        headers: { "Content-Length": "2048" },
      })
    );
    await expect(pending).rejects.toBeInstanceOf(ImagePrefetchBudgetExceeded);
    expect(source.hasBytes({ level: 6, col: 0, row: 0 })).toBe(false);
    expect(budget.remainingBytes).toBe(0);
    source.dispose();
  });

  it("allows an explicitly unbudgeted request while a low source has exhausted its allowance", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(new Uint8Array(16)));
    vi.stubGlobal("fetch", fetch);
    const source = new JpegTileSource("https://images.test/6/unlimited.jpg", {
      width: 512 as DevicePixels,
      height: 512 as DevicePixels,
    });
    const budget = { remainingBytes: 0 };
    source.prefetchBudget = budget;
    const tile = { level: 6, col: 0, row: 0 };
    await source.fetch(
      [tile],
      new AbortController().signal,
      "high",
      undefined,
      { prefetchBudget: undefined }
    );
    expect(source.hasBytes(tile)).toBe(true);
    expect(budget.remainingBytes).toBe(0);
    expect(fetch).toHaveBeenCalledOnce();
    source.dispose();
  });
});
