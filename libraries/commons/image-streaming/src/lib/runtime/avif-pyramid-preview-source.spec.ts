// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DevicePixels } from "@carma-units";
import { AvifPyramidPreviewSource } from "./avif-pyramid-preview-source";
import { BoundedImageRangeCache } from "./bounded-image-range-cache";
const cellDecoder = vi.hoisted(() => ({ parse: vi.fn(), makeTile: vi.fn() }));
vi.mock("../core/avif-grid-index", () => ({
  parseAvifGridIndex: cellDecoder.parse,
  makeAvifTile: cellDecoder.makeTile,
}));
const native = { width: 1024 as DevicePixels, height: 768 as DevicePixels };
const windowOf = (width = 128, height = 96) => ({
  source: {
    x: 0 as DevicePixels,
    y: 0 as DevicePixels,
    width: native.width,
    height: native.height,
  },
  target: { width: width as DevicePixels, height: height as DevicePixels },
});
const oldVersion = "Tue, 06 Oct 2026 10:00:00 GMT",
  newVersion = "Tue, 06 Oct 2026 10:00:02 GMT";
const fixture = (largeMdat = false, metaBytes = largeMdat ? 20000 : 32) => {
  const uuidAt = largeMdat ? 32000 : 20000;
  const bytes = new Uint8Array(uuidAt + 8000),
    view = new DataView(bytes.buffer),
    write = (at: number, size: number, type: string) => {
      view.setUint32(at, size);
      bytes.set(new TextEncoder().encode(type), at + 4);
    };
  write(0, 24, "ftyp");
  bytes.set(new TextEncoder().encode("avif"), 8);
  write(24, metaBytes, "meta");
  const mdatAt = 24 + metaBytes;
  write(mdatAt, largeMdat ? 1 : uuidAt - mdatAt, "mdat");
  if (largeMdat) view.setBigUint64(mdatAt + 8, BigInt(uuidAt - mdatAt));
  write(uuidAt, 8000, "uuid");
  bytes.set(
    new Uint8Array(
      "9264b9097b6840af91dcb95a8d3a1b80"
        .match(/../g)!
        .map((x) => parseInt(x, 16))
    ),
    uuidAt + 8
  );
  const index = {
    schema: 1,
    format: "avif-independent-pyramid",
    baseLevel: 1,
    sourceSensorDimensions: [1024, 768],
    levels: {
      1: {
        offset: 0,
        length: uuidAt,
        width: 512,
        height: 384,
        scale: 0.5,
        cellsIndex: { offset: uuidAt + 7000, length: 984 },
      },
      2: {
        offset: uuidAt + 4120,
        length: 1024,
        width: 256,
        height: 192,
        scale: 0.25,
      },
      3: {
        offset: uuidAt + 5144,
        length: 512,
        width: 128,
        height: 96,
        scale: 0.125,
      },
    },
  };
  bytes.set(new TextEncoder().encode(JSON.stringify(index)), uuidAt + 24);
  bytes.set(new TextEncoder().encode("pyridx01"), uuidAt + 7984);
  view.setBigUint64(uuidAt + 7992, BigInt(uuidAt + 24));
  return { bytes, index };
};
const reply = (
  bytes: Uint8Array,
  at: number,
  version = oldVersion,
  visibleRange = false,
  total = 28000
) =>
  new Response(bytes, {
    status: 206,
    headers: {
      "Content-Length": String(bytes.length),
      "Last-Modified": version,
      ...(visibleRange
        ? { "Content-Range": `bytes ${at}-${at + bytes.length - 1}/${total}` }
        : {}),
    },
  });
const mockFile = (file = fixture(), visibleRange = false) => {
  const fetch = vi.fn(async (_url: unknown, options?: RequestInit) => {
    expect(options?.method).not.toBe("HEAD");
    const range = new Headers(options?.headers).get("Range")!;
    expect(range).toMatch(/^bytes=\d+-\d+$/);
    const [start, end] = range.slice(6).split("-").map(Number);
    return reply(
      file.bytes.slice(start, Math.min(end + 1, file.bytes.length)),
      start,
      oldVersion,
      visibleRange,
      file.bytes.length
    );
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
};
const readEncodedRange = (
  source: AvifPyramidPreviewSource,
  offset: number,
  length: number,
  signal: AbortSignal
) => (source as unknown as {
  range(offset: number, length: number, signal: AbortSignal): Promise<Uint8Array>;
}).range(offset, length, signal);
afterEach(() => vi.unstubAllGlobals());
describe("bounded local AVIF range assembly", () => {
  it("joins adjacent RAM spans without requesting their combined extent again", async () => {
    const file = fixture();
    file.bytes.set([41, 42, 43, 44], 12000);
    const network = mockFile(file);
    const source = new AvifPyramidPreviewSource("https://images.test/ram-parts.avif");
    const signal = new AbortController().signal;
    await source.getDimensions(signal);
    source.park(0);
    source.setActiveCacheBudget(1024);
    await readEncodedRange(source, 12000, 2, signal);
    await readEncodedRange(source, 12002, 2, signal);
    network.mockClear();
    expect(await readEncodedRange(source, 12000, 4, signal)).toEqual(new Uint8Array([41, 42, 43, 44]));
    expect(network).not.toHaveBeenCalled();
    source.close();
  });
  it("combines resident bytes with verified persistent partial spans", async () => {
    const file = fixture();
    file.bytes.set([41, 42, 43, 44], 12000);
    const network = mockFile(file);
    const source = new AvifPyramidPreviewSource("https://images.test/disk-parts.avif");
    const signal = new AbortController().signal;
    await source.getDimensions(signal);
    source.park(0);
    source.setActiveCacheBudget(1024);
    await readEncodedRange(source, 12000, 2, signal);
    const now = Date.now();
    const known = vi.spyOn(BoundedImageRangeCache.prototype, "knownRanges").mockImplementation((version) => version === oldVersion ? {
      ranges: [{ offset: 12002, length: 2 }], checkedAt: now, validUntil: now + 60_000,
    } : undefined);
    const get = vi.spyOn(BoundedImageRangeCache.prototype, "get").mockImplementation(async (offset, length, version) =>
      offset === 12002 && length === 2 && version === oldVersion
        ? new Uint8Array([43, 44]) : undefined
    );
    network.mockClear();
    try {
      expect(await readEncodedRange(source, 12000, 4, signal)).toEqual(new Uint8Array([41, 42, 43, 44]));
      expect(get).toHaveBeenCalledWith(12002, 2, oldVersion, signal);
      expect(network).not.toHaveBeenCalled();
    } finally {
      get.mockRestore(); known.mockRestore(); source.close();
    }
  });
  it("fetches only the missing span when a persistent inventory outlives its data", async () => {
    const file = fixture();
    file.bytes.set([41, 42, 43, 44], 12000);
    const network = mockFile(file);
    const source = new AvifPyramidPreviewSource("https://images.test/evicted-parts.avif");
    const signal = new AbortController().signal;
    await source.getDimensions(signal);
    source.park(0);
    source.setActiveCacheBudget(1024);
    await readEncodedRange(source, 12000, 2, signal);
    const now = Date.now();
    const known = vi.spyOn(BoundedImageRangeCache.prototype, "knownRanges").mockReturnValue({
      ranges: [{ offset: 12002, length: 2 }], checkedAt: now, validUntil: now + 60_000,
    });
    const get = vi.spyOn(BoundedImageRangeCache.prototype, "get").mockResolvedValue(undefined);
    network.mockClear();
    try {
      expect(await readEncodedRange(source, 12000, 4, signal)).toEqual(new Uint8Array([41, 42, 43, 44]));
      expect(network).toHaveBeenCalledOnce();
      expect(new Headers(network.mock.calls[0][1]?.headers).get("Range")).toBe("bytes=12002-12003");
    } finally {
      get.mockRestore(); known.mockRestore(); source.close();
    }
  });
  it("rejects an assembled result when a missing-span response changes the asset version", async () => {
    const file = fixture();
    file.bytes.set([41, 42, 43, 44], 12000);
    const network = mockFile(file);
    const source = new AvifPyramidPreviewSource("https://images.test/changed-parts.avif");
    const signal = new AbortController().signal;
    await source.getDimensions(signal);
    source.park(0);
    source.setActiveCacheBudget(1024);
    await readEncodedRange(source, 12000, 2, signal);
    network.mockClear();
    network.mockImplementation(async () => reply(
      new Uint8Array([53, 54]), 12002, newVersion, false, file.bytes.length
    ));
    await expect(readEncodedRange(source, 12000, 4, signal)).rejects.toMatchObject({ name: "AvifAssetChangedError" });
    expect(source.memoryMetrics.rangeBytes).toBe(0);
    source.close();
  });
});
describe("positive bounded calibrated AVIF metadata", () => {
  it("uses plain AVIF Range GETs even for cached addresses with the obsolete query", async () => {
    const fetch = mockFile();
    const source = new AvifPyramidPreviewSource(
      "https://images.test/photo.avif?pyramid=2024-attribution-v2&token=public"
    );
    await source.select(windowOf(), native, new AbortController().signal);
    expect(
      fetch.mock.calls.every(
        ([url]) => url === "https://images.test/photo.avif?token=public"
      )
    ).toBe(true);
    source.close();
  });

  it("initializes image-only L0 sample pyramids without assuming public L1", async () => {
    const file = fixture();
    const index = {
      ...file.index,
      baseLevel: 0,
      levels: {
        0: { ...file.index.levels[1], width: 1024, height: 768, scale: 1 },
        2: file.index.levels[2],
        3: file.index.levels[3],
      },
    };
    file.bytes.fill(0, 20024, 24120);
    file.bytes.set(new TextEncoder().encode(JSON.stringify(index)), 20024);
    mockFile(file);
    const source = new AvifPyramidPreviewSource(
        "https://images.test/fullres.avif"
      ),
      signal = new AbortController().signal;
    expect(await source.getDimensions(signal)).toEqual(native);
    expect(
      (await source.select(windowOf(1024, 768), native, signal)).image.level
    ).toBe(0);
    source.close();
  });

  it("reads a broad coarse level in one range and reuses its full bitmap for smaller crops", async () => {
    const file = fixture();
    const level = file.index.levels[3] as (typeof file.index.levels)[3] & {
      cellsIndex: { offset: number; length: number };
    };
    level.cellsIndex = { offset: 27000, length: 984 };
    file.bytes.fill(0, 20024, 24120);
    file.bytes.set(new TextEncoder().encode(JSON.stringify(file.index)), 20024);
    const fetch = mockFile(file);
    const bitmap = {
      width: 128,
      height: 96,
      close: vi.fn(),
    } as unknown as ImageBitmap;
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => bitmap)
    );
    const draw = vi.fn();
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        constructor(public width: number, public height: number) {}
        getContext() {
          return {
            drawImage: draw,
            reset: vi.fn(),
            getImageData: (_x: number, _y: number, w: number, h: number) => ({
              data: new Uint8ClampedArray(w * h * 4),
            }),
          };
        }
      }
    );
    const source = new AvifPyramidPreviewSource(
      "https://images.test/coarse.avif"
    );
    const signal = new AbortController().signal;
    const selected = await source.select(windowOf(), native, signal, 8);
    fetch.mockClear();
    expect(
      (await source.read(selected.image, [0, 0, 128, 96], signal)).length
    ).toBe(128 * 96 * 4);
    expect(fetch).toHaveBeenCalledOnce();
    expect(new Headers(fetch.mock.calls[0][1]?.headers).get("Range")).toBe(
      "bytes=25144-25655"
    );
    expect(cellDecoder.parse).not.toHaveBeenCalled();
    expect(source.hasCached(selected.image, [10, 20, 30, 40])).toBe(true);
    // Whole-level native decode does not parse or populate the tile grid.
    expect(source.hasLocallyAvailable(selected.image, [10, 20, 30, 40])).toBe(true);
    expect(source.hasLocallyAvailable(selected.image, [10, 20, 129, 40])).toBe(false);
    fetch.mockClear();
    await source.read(selected.image, [10, 20, 30, 40], signal);
    expect(fetch).not.toHaveBeenCalled();
    expect(draw).toHaveBeenLastCalledWith(bitmap, 10, 20, 20, 20, 0, 0, 20, 20);
    expect(source.coverage.find((entry) => entry.level === 3)?.complete).toBe(
      true
    );
    source.close();
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it("finds the actual appended UUID/index without HEAD or suffix and keeps metadata/header warm", async () => {
    const fetch = mockFile(),
      source = new AvifPyramidPreviewSource("https://images.test/photo.avif"),
      signal = new AbortController().signal;
    const selected = await source.select(windowOf(512, 384), native, signal, 8);
    expect(selected.image.level).toBe(3);
    expect(selected.refinements.map((p) => p.level)).toEqual([2, 1]);
    await source.select(windowOf(), native, signal);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(
      fetch.mock.calls.map(([, o]) => new Headers(o?.headers).get("Range"))
    ).toEqual(["bytes=0-16383", "bytes=20000-24119"]);
    expect(fetch.mock.calls.map(([, options]) => options?.cache)).toEqual([
      "no-cache",
      "default",
    ]);
    source.close();
  });
  it("keeps L4 for one-pixel output rounding but promotes a genuinely undersampled viewport", async () => {
    const file = fixture();
    const index = {
      ...file.index,
      levels: {
        ...file.index.levels,
        4: { offset: 25656, length: 128, width: 64, height: 48, scale: 0.0625 },
      },
    };
    file.bytes.fill(0, 20024, 24120);
    file.bytes.set(new TextEncoder().encode(JSON.stringify(index)), 20024);
    mockFile(file);
    const source = new AvifPyramidPreviewSource("https://images.test/rounding.avif"),
      signal = new AbortController().signal,
      window = { source: { x: 0 as DevicePixels, y: 0 as DevicePixels, width: 1000 as DevicePixels, height: 745 as DevicePixels }, target: { width: 63 as DevicePixels, height: 47 as DevicePixels } };
    // L4 contributes 62.5 x 46.5625 pixels: rounding each target axis up is sufficient.
    expect((await source.select(window, native, signal, 1)).image.level).toBe(4);
    expect((await source.select({ ...window, target: { ...window.target, width: 64 as DevicePixels } }, native, signal, 1)).image.level).toBe(3);
    // Tiny requests must still have enough source samples, never a zero-pixel threshold.
    const tiny = { source: { ...window.source, width: 1 as DevicePixels, height: 1 as DevicePixels }, target: { width: 1 as DevicePixels, height: 1 as DevicePixels } };
    expect((await source.select(tiny, native, signal, 1)).image.level).toBe(1);
    const two = { source: { ...tiny.source, width: 4 as DevicePixels, height: 4 as DevicePixels }, target: { width: 2 as DevicePixels, height: 2 as DevicePixels } };
    expect((await source.select(two, native, signal, 1)).image.level).toBe(2);
    expect((await source.select(two, native, signal, 8)).image.level).toBe(4);
    source.close();
  });
  it("covers a typical 12KiB metadata box and mdat header in the first probe without an extra header roundtrip", async () => {
    const fetch = mockFile(fixture(false, 12389)),
      source = new AvifPyramidPreviewSource("https://images.test/typical.avif");
    await source.select(windowOf(), native, new AbortController().signal);
    expect(
      fetch.mock.calls.map(([, options]) =>
        new Headers(options?.headers).get("Range")
      )
    ).toEqual(["bytes=0-16383", "bytes=20000-24119"]);
    source.close();
  });
  it("skips a large meta box with a targeted 64-bit mdat header without reading its payload", async () => {
    const fetch = mockFile(fixture(true), true),
      source = new AvifPyramidPreviewSource("https://images.test/large.avif");
    expect(
      (await source.select(windowOf(), native, new AbortController().signal))
        .image.level
    ).toBe(3);
    expect(
      fetch.mock.calls.map(([, o]) => new Headers(o?.headers).get("Range"))
    ).toEqual(["bytes=0-16383", "bytes=20024-20039", "bytes=32000-36119"]);
    source.close();
  });
  it.each([200, 404, 410])(
    "refuses HTTP%s before reading a full/error body and without retry",
    async (status) => {
      const response = new Response(new Uint8Array(28000), { status }),
        read = vi.spyOn(response.body!, "getReader"),
        cancel = vi.spyOn(response.body!, "cancel");
      const fetch = vi.fn().mockResolvedValue(response);
      vi.stubGlobal("fetch", fetch);
      await expect(
        new AvifPyramidPreviewSource("https://images.test/missing.avif").select(
          windowOf(),
          native,
          new AbortController().signal
        )
      ).rejects.toThrow(`refusing ${status}`);
      expect(read).not.toHaveBeenCalled();
      expect(cancel).toHaveBeenCalledOnce();
      expect(fetch).toHaveBeenCalledOnce();
    }
  );
  it("stops an oversized 206 stream at the initial header budget", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(new Uint8Array(16385), { status: 206 }))
    );
    await expect(
      new AvifPyramidPreviewSource("https://images.test/photo.avif").select(
        windowOf(),
        native,
        new AbortController().signal
      )
    ).rejects.toThrow("exceeds requested budget");
  });
  it("checks source dimensions and performs no GET for an already-aborted request", async () => {
    const fetch = mockFile(),
      source = new AvifPyramidPreviewSource("https://images.test/photo.avif");
    await expect(
      source.select(
        windowOf(),
        { ...native, width: 2048 as DevicePixels },
        new AbortController().signal
      )
    ).rejects.toThrow("source dimensions");
    const controller = new AbortController();
    controller.abort();
    await expect(
      source.select(windowOf(), native, controller.signal)
    ).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(2);
    source.close();
  });
  it("retries exactly once when Last-Modified changes between initial header and UUID metadata", async () => {
    const file = fixture(),
      obsolete = reply(file.bytes.slice(20000, 24120), 20000, newVersion),
      cancel = vi.spyOn(obsolete.body!, "cancel"),
      reader = vi.spyOn(obsolete.body!, "getReader");
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(reply(file.bytes.slice(0, 16384), 0))
      .mockResolvedValueOnce(obsolete)
      .mockResolvedValueOnce(reply(file.bytes.slice(0, 16384), 0, newVersion))
      .mockResolvedValueOnce(
        reply(file.bytes.slice(20000, 24120), 20000, newVersion)
      );
    vi.stubGlobal("fetch", fetch);
    const source = new AvifPyramidPreviewSource(
        "https://images.test/photo.avif"
      ),
      signal = new AbortController().signal;
    expect((await source.select(windowOf(), native, signal)).image.level).toBe(
      3
    );
    expect(cancel).toHaveBeenCalledOnce();
    expect(reader).not.toHaveBeenCalled();
    await source.select(windowOf(), native, signal);
    expect(fetch).toHaveBeenCalledTimes(4);
    source.close();
  });
  it("stops continuous version/total replacement after one retry before reading pixel bodies", async () => {
    const file = fixture(),
      first = reply(new Uint8Array(512), 25144, newVersion, true),
      second = reply(new Uint8Array(512), 25144, newVersion, true, 28001);
    const cancelled = [
        vi.spyOn(first.body!, "cancel"),
        vi.spyOn(second.body!, "cancel"),
      ],
      readers = [
        vi.spyOn(first.body!, "getReader"),
        vi.spyOn(second.body!, "getReader"),
      ];
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        reply(file.bytes.slice(0, 16384), 0, oldVersion, true)
      )
      .mockResolvedValueOnce(
        reply(file.bytes.slice(20000, 24120), 20000, oldVersion, true)
      )
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(
        reply(file.bytes.slice(0, 16384), 0, newVersion, true)
      )
      .mockResolvedValueOnce(
        reply(file.bytes.slice(20000, 24120), 20000, newVersion, true)
      )
      .mockResolvedValueOnce(second);
    vi.stubGlobal("fetch", fetch);
    const source = new AvifPyramidPreviewSource(
        "https://images.test/photo.avif"
      ),
      signal = new AbortController().signal,
      page = (await source.select(windowOf(), native, signal)).image;
    await expect(source.read(page, [0, 0, 1, 1], signal)).rejects.toMatchObject(
      { name: "AvifAssetChangedError" }
    );
    expect(fetch).toHaveBeenCalledTimes(6);
    cancelled.forEach((c) => expect(c).toHaveBeenCalledOnce());
    readers.forEach((r) => expect(r).not.toHaveBeenCalled());
    source.close();
  });
  it("rejects unsafe BMFF sizes and unsupported UUID before decoding", async () => {
    const file = fixture();
    new DataView(file.bytes.buffer).setUint32(0, 0);
    mockFile(file);
    await expect(
      new AvifPyramidPreviewSource("https://images.test/bad.avif").select(
        windowOf(),
        native,
        new AbortController().signal
      )
    ).rejects.toThrow("box size");
    const other = fixture();
    other.bytes[other.index.levels[1].length + 8] = 0;
    mockFile(other);
    await expect(
      new AvifPyramidPreviewSource("https://images.test/other.avif").select(
        windowOf(),
        native,
        new AbortController().signal
      )
    ).rejects.toThrow("Unsupported AVIF pyramid UUID");
  });
});

const warmFixture = () => {
  const file = fixture();
  const dimensions = (level: number) => ({
    width: 1024 / 2 ** level,
    height: 768 / 2 ** level,
  });
  delete (file.index.levels[1] as { cellsIndex?: unknown }).cellsIndex;
  file.bytes.fill(0, 20024, 24120);
  file.bytes.set(new TextEncoder().encode(JSON.stringify(file.index)), 20024);
  for (const [key, entry] of Object.entries(file.index.levels)) {
    const level = Number(key);
    file.bytes[entry.offset + 16] = level;
    if (level > 1) {
      const header = new DataView(
        file.bytes.buffer,
        entry.offset,
        entry.length
      );
      header.setUint32(0, 24);
      file.bytes.set(new TextEncoder().encode("ftyp"), entry.offset + 4);
      header.setUint32(24, 32);
      file.bytes.set(new TextEncoder().encode("meta"), entry.offset + 28);
      header.setUint32(56, entry.length - 56);
      file.bytes.set(new TextEncoder().encode("mdat"), entry.offset + 60);
    }
  }
  cellDecoder.parse.mockImplementation((header: Uint8Array) => {
    const level = header[16],
      { width, height } = dimensions(level),
      ispe = new Uint8Array(20),
      view = new DataView(ispe.buffer);
    view.setUint32(12, width);
    view.setUint32(16, height);
    return {
      dimensions: { width, height },
      cells: [],
      primary: {
        id: level,
        type: "av01",
        properties: [{ type: "ispe", bytes: Array.from(ispe) }],
        ranges: [{ offset: 100, length: 4 }],
      },
    };
  });
  cellDecoder.makeTile.mockImplementation(
    (_grid: unknown, item: { id: number }) => new Uint8Array([item.id])
  );
  const decoded: { level: number; cellId?: number; bitmap: ImageBitmap }[] = [];
  const makeBitmap = (level: number, cellId?: number) => {
    const size = dimensions(level),
      bitmap = { ...size, close: vi.fn() } as unknown as ImageBitmap;
    decoded.push({ level, cellId, bitmap });
    return bitmap;
  };
  const decode = vi.fn(async (blob: Blob) => {
    const encoded = new Uint8Array(await blob.arrayBuffer());
    const id = encoded.length > 1 ? encoded[16] : encoded[0];
    return makeBitmap(id > 3 ? 1 : id, id > 3 ? id : undefined);
  });
  vi.stubGlobal("createImageBitmap", decode);
  const canvas = vi.fn();
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      width: number;
      height: number;
      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        canvas(width, height);
      }
      getContext() {
        return {
          drawImage: vi.fn(),
          getImageData: (
            _x: number,
            _y: number,
            width: number,
            height: number
          ) => ({
            width,
            height,
            data: new Uint8ClampedArray(width * height * 4),
          }),
          reset: vi.fn(),
        };
      }
    }
  );
  const network = mockFile(file);
  const source = new AvifPyramidPreviewSource(
    "https://images.test/warm.avif",
    8 * 1024 * 1024
  );
  return { source, decode, decoded, canvas, network, makeBitmap, file };
};
describe("bounded AVIF display and encoded prewarming", () => {
  it("recognizes RAM payload coverage synchronously without treating it as decoded", async () => {
    const view = warmFixture();
    const signal = new AbortController().signal;
    const { image } = await view.source.select(
      windowOf(128, 96), native, signal
    );
    const bounds: [number, number, number, number] = [0, 0, 128, 96];
    expect(view.source.hasLocallyAvailable(image, bounds)).toBe(false);
    await view.source.prewarm(windowOf(), native, signal);
    const requests = view.network.mock.calls.length;
    const decodes = view.decode.mock.calls.length;
    expect(view.source.hasLocallyAvailable(image, bounds)).toBe(true);
    expect(view.source.hasCached(image, bounds)).toBe(false);
    expect(view.source.hasLocallyAvailable(image, [0, 0, 129, 96])).toBe(false);
    expect(view.source.hasLocallyAvailable(image, [0, 0, 0, 96])).toBe(false);
    expect(view.source.hasLocallyAvailable(image, [0.5, 0, 128, 96])).toBe(false);
    expect(
      view.source.hasLocallyAvailable(
        { ...image, entry: { ...image.entry } }, bounds
      )
    ).toBe(false);
    expect(view.network).toHaveBeenCalledTimes(requests);
    expect(view.decode).toHaveBeenCalledTimes(decodes);
    view.source.close();
  });
  it("does not mistake previously fetched but evicted payloads for local data", async () => {
    const view = warmFixture();
    const signal = new AbortController().signal;
    view.source.setActiveCacheBudget(0);
    await view.source.prewarm(windowOf(), native, signal);
    const { image } = await view.source.select(windowOf(130, 96), native, signal);
    const requests = view.network.mock.calls.length;
    expect(
      view.source.levelReadiness.find((page) => page.level === 2)
        ?.previouslyFetchedCells[0]
    ).toBe(1);
    expect(view.source.hasLocallyAvailable(image, [0, 0, 256, 192])).toBe(false);
    expect(view.network).toHaveBeenCalledTimes(requests);
    view.source.close();
  });
  it("accepts only a fresh persistent inventory for the current asset version", async () => {
    const view = warmFixture();
    const signal = new AbortController().signal;
    view.source.setActiveCacheBudget(0);
    await view.source.prewarm(windowOf(), native, signal);
    const { image } = await view.source.select(windowOf(130, 96), native, signal);
    const requests = view.network.mock.calls.length;
    const now = Date.now();
    const decodes = view.decode.mock.calls.length;
    const inventory = {
      ranges: [{ offset: image.entry.offset + 100, length: 4 }],
      checkedAt: now,
      validUntil: now + 60_000,
    };
    const knownRanges = vi.spyOn(
      BoundedImageRangeCache.prototype, "knownRanges"
    );
    try {
      knownRanges.mockImplementation((version) =>
        version === oldVersion ? inventory : undefined
      );
      expect(view.source.hasLocallyAvailable(image, [0, 0, 256, 192])).toBe(true);
      expect(view.source.hasCached(image, [0, 0, 256, 192])).toBe(false);
      knownRanges.mockReturnValue({ ...inventory, validUntil: now - 1 });
      expect(view.source.hasLocallyAvailable(image, [0, 0, 256, 192])).toBe(false);
      knownRanges.mockImplementation((version) =>
        version === newVersion ? inventory : undefined
      );
      expect(view.source.hasLocallyAvailable(image, [0, 0, 256, 192])).toBe(false);
      expect(view.network).toHaveBeenCalledTimes(requests);
      expect(view.decode).toHaveBeenCalledTimes(decodes);
    } finally {
      knownRanges.mockRestore();
      view.source.close();
    }
  });
  it("refreshes local availability before selecting encoded display data without fetching or decoding", async () => {
    const view = warmFixture();
    const signal = new AbortController().signal;
    view.source.setActiveCacheBudget(0);
    await view.source.prewarm(windowOf(), native, signal);
    const { image } = await view.source.select(windowOf(130, 96), native, signal);
    const now = Date.now();
    const inventory = {
      ranges: [{ offset: image.entry.offset + 100, length: 4 }],
      checkedAt: now,
      validUntil: now + 60_000,
    };
    const known = vi.spyOn(BoundedImageRangeCache.prototype, "knownRanges").mockReturnValue(undefined);
    const refresh = vi.spyOn(BoundedImageRangeCache.prototype, "ensureKnownRanges").mockImplementation(async () => {
      known.mockImplementation((version) => version === oldVersion ? inventory : undefined);
    });
    const requests = view.network.mock.calls.length, decodes = view.decode.mock.calls.length;
    try {
      expect(view.source.hasLocallyAvailable(image, [0, 0, 256, 192])).toBe(false);
      await view.source.ensureLocalAvailability(signal);
      expect(refresh).toHaveBeenCalledWith(signal);
      expect(view.source.hasLocallyAvailable(image, [0, 0, 256, 192])).toBe(true);
      expect(view.network).toHaveBeenCalledTimes(requests);
      expect(view.decode).toHaveBeenCalledTimes(decodes);
    } finally {
      refresh.mockRestore(); known.mockRestore(); view.source.close();
    }
  });
  it("honors physical density rounding and prewarms only bounded overview and visible detail pixels", async () => {
    const view = warmFixture(),
      signal = new AbortController().signal;
    expect(
      (await view.source.select(windowOf(128, 96), native, signal)).image.level
    ).toBe(3);
    expect(
      (await view.source.select(windowOf(129, 96), native, signal)).image.level
    ).toBe(3);
    expect(
      (await view.source.select(windowOf(130, 96), native, signal)).image.level
    ).toBe(2);
    const progress = vi.fn();
    await view.source.prewarm(windowOf(), native, signal, {
      onProgress: progress,
    });
    expect(progress.mock.calls[0][0].level).toBe(2);
    expect(new Set(progress.mock.calls.map(([p]) => p.level))).toEqual(
      new Set([1, 2, 3])
    );
    expect(view.decoded.map((entry) => entry.level)).toEqual([1, 2]);
    const memory = view.source.memoryMetrics;
    expect(memory.overviewBytes).toBe(512 * 384 * 4);
    expect(memory.decodedBytes - memory.overviewBytes).toBeLessThanOrEqual(256 * 192 * 4);
    expect(memory.largestDecodedTilePixels).toBeLessThanOrEqual(1024 * 1024);
    expect(memory.residentBytes + memory.decodeCanvasBytes).toBeLessThanOrEqual(8 * 1024 * 1024);
    view.source.close();
  });
  it("coalesces adjacent AVIF cell payloads without decoding them or warming them twice", async () => {
    const view = warmFixture(),
      parse = cellDecoder.parse.getMockImplementation()!;
    const ispe = new Uint8Array(20),
      data = new DataView(ispe.buffer);
    data.setUint32(12, 256);
    data.setUint32(16, 384);
    view.file.bytes[75] = 1;
    cellDecoder.parse.mockImplementation((header: Uint8Array) =>
      header[16] !== 1
        ? parse(header)
        : {
            dimensions: { width: 512, height: 384 },
            primary: { id: 1, ranges: [{ offset: 72, length: 4 }] },
            cells: [10, 11].map((id, n) => ({
              id,
              properties: [{ type: "ispe", bytes: Array.from(ispe) }],
              ranges: [{ offset: 12000 + n * 4, length: 4 }],
            })),
          }
    );
    view.source.setActiveCacheBudget(0);
    const signal = new AbortController().signal;
    await view.source.ensureOverview(signal);
    view.network.mockClear();
    view.decode.mockClear();
    await view.source.prewarm(windowOf(), native, signal);
    const ranges = view.network.mock.calls.map(([, options]) =>
      new Headers(options?.headers).get("Range")
    );
    expect(
      ranges.filter((range) => range === "bytes=12000-12007")
    ).toHaveLength(1);
    expect(ranges).not.toContain("bytes=12000-12003");
    expect(ranges).not.toContain("bytes=12004-12007");
    expect(view.decode).not.toHaveBeenCalled();
    expect(view.source.memoryMetrics.decodedBytes).toBe(view.source.memoryMetrics.overviewBytes);
    view.source.close();
  });
  it("preserves encoded prewarming under a zero decoded-cache budget", async () => {
    const view = warmFixture(),
      signal = new AbortController().signal;
    view.source.setActiveCacheBudget(0);
    await view.source.prewarm(windowOf(), native, signal);
    expect(view.network).toHaveBeenCalled();
    expect(view.decode).toHaveBeenCalledOnce();
    expect(view.source.memoryMetrics).toMatchObject({
      rangeBytes: 0,
      decodedBytes: 512 * 384 * 4,
      overviewBytes: 512 * 384 * 4,
    });
    view.source.park(0);
    expect(view.source.residentBytes).toBe(0);
    view.source.close();
  });
  it("retains a displayed tile for repeat reads, then releases it on park", async () => {
    const view = warmFixture(),
      signal = new AbortController().signal;
    const { image } = await view.source.select(windowOf(), native, signal);
    await view.source.read(image, [0, 0, 128, 96], signal);
    await view.source.read(image, [0, 0, 128, 96], signal);
    expect(view.decode).toHaveBeenCalledOnce();
    expect(view.source.memoryMetrics).toMatchObject({
      decodedTileCount: 1,
      decodedPixels: 128 * 96,
    });
    view.source.park(0);
    expect(view.source.residentBytes).toBe(0);
    expect(view.decoded[0].bitmap.close).toHaveBeenCalledOnce();
    view.source.close();
  });
  it("stops background ranges promptly when canceled", async () => {
    const view = warmFixture(),
      controller = new AbortController();
    view.source.setActiveCacheBudget(0);
    const progress = vi.fn(() => controller.abort());
    await expect(
      view.source.prewarm(windowOf(), native, controller.signal, {
        onProgress: progress,
      })
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(progress).toHaveBeenCalledOnce();
    expect(view.decode).toHaveBeenCalledOnce();
    expect(view.source.memoryMetrics.decodedBytes).toBe(view.source.memoryMetrics.overviewBytes);
    view.source.close();
  });
  it("yields to foreground work and rejects a stale source generation", async () => {
    const view = warmFixture();
    let busy = true;
    const progress = vi.fn(() => view.source.close());
    const warming = view.source.prewarm(
      windowOf(),
      native,
      new AbortController().signal,
      { shouldYield: () => busy, onProgress: progress }
    );
    await new Promise((resolve) => setTimeout(resolve, 8));
    expect(progress).not.toHaveBeenCalled();
    busy = false;
    await expect(warming).rejects.toMatchObject({
      name: "AvifAssetChangedError",
    });
    expect(view.source.residentBytes).toBe(0);
  });
  it("shares a tile decode while one viewport consumer cancels", async () => {
    const view = warmFixture(),
      signal = new AbortController(),
      second = new AbortController();
    const { image } = await view.source.select(
      windowOf(),
      native,
      signal.signal
    );
    let release: (bitmap: ImageBitmap) => void = () => {};
    view.decode.mockImplementationOnce(
      () =>
        new Promise<ImageBitmap>((resolve) => {
          release = resolve;
        })
    );
    const first = view.source.read(image, [0, 0, 128, 96], signal.signal);
    const rejected = expect(first).rejects.toMatchObject({
      name: "AbortError",
    });
    await vi.waitFor(() => expect(view.decode).toHaveBeenCalledOnce());
    const next = view.source.read(image, [0, 0, 128, 96], second.signal);
    await new Promise((resolve) => setTimeout(resolve, 1));
    signal.abort();
    await rejected;
    release(view.makeBitmap(3));
    await expect(next).resolves.toHaveLength(128 * 96 * 4);
    expect(view.decode).toHaveBeenCalledOnce();
    view.source.close();
  });
});
