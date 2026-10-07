// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DevicePixels } from "@carma-units";
import { AvifPyramidPreviewSource } from "./avif-pyramid-preview-source";
const cellDecoder = vi.hoisted(() => ({ parse: vi.fn(), makeTile: vi.fn() }));
vi.mock("../../core/utils/avif-grid-index", () => ({
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
const fixture = (largeMdat = false) => {
  const bytes = new Uint8Array(20000),
    view = new DataView(bytes.buffer),
    write = (at: number, size: number, type: string) => {
      view.setUint32(at, size);
      bytes.set(new TextEncoder().encode(type), at + 4);
    };
  write(0, 24, "ftyp");
  bytes.set(new TextEncoder().encode("avif"), 8);
  write(24, largeMdat ? 9000 : 32, "meta");
  const mdatAt = largeMdat ? 9024 : 56;
  write(mdatAt, largeMdat ? 1 : 12000 - mdatAt, "mdat");
  if (largeMdat) view.setBigUint64(mdatAt + 8, BigInt(12000 - mdatAt));
  write(12000, 8000, "uuid");
  bytes.set(
    new Uint8Array(
      "9264b9097b6840af91dcb95a8d3a1b80"
        .match(/../g)!
        .map((x) => parseInt(x, 16))
    ),
    12008
  );
  const index = {
    schema: 1,
    format: "avif-independent-pyramid",
    baseLevel: 1,
    sourceSensorDimensions: [1024, 768],
    levels: {
      1: {
        offset: 0,
        length: 12000,
        width: 512,
        height: 384,
        scale: 0.5,
        cellsIndex: { offset: 19000, length: 984 },
      },
      2: { offset: 16120, length: 1024, width: 256, height: 192, scale: 0.25 },
      3: { offset: 17144, length: 512, width: 128, height: 96, scale: 0.125 },
    },
  };
  bytes.set(new TextEncoder().encode(JSON.stringify(index)), 12024);
  bytes.set(new TextEncoder().encode("pyridx01"), 19984);
  view.setBigUint64(19992, 12024n);
  return { bytes, index };
};
const reply = (
  bytes: Uint8Array,
  at: number,
  version = oldVersion,
  visibleRange = false,
  total = 20000
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
      visibleRange
    );
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
};
afterEach(() => vi.unstubAllGlobals());
describe("positive bounded calibrated AVIF metadata", () => {
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
    ).toEqual(["bytes=0-8191", "bytes=12000-16119"]);
    expect(fetch.mock.calls.every(([, o]) => o?.cache === "no-cache")).toBe(
      true
    );
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
    ).toEqual(["bytes=0-8191", "bytes=9024-9039", "bytes=12000-16119"]);
    source.close();
  });
  it.each([200, 404, 410])(
    "refuses HTTP%s before reading a full/error body and without retry",
    async (status) => {
      const response = new Response(new Uint8Array(20000), { status }),
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
        .mockResolvedValue(new Response(new Uint8Array(8193), { status: 206 }))
    );
    await expect(
      new AvifPyramidPreviewSource("https://images.test/photo.avif").select(
        windowOf(),
        native,
        new AbortController().signal
      )
    ).rejects.toThrow("exceeds requested budget");
  });
  it("checks camera calibration and performs no GET for an already-aborted request", async () => {
    const fetch = mockFile(),
      source = new AvifPyramidPreviewSource("https://images.test/photo.avif");
    await expect(
      source.select(
        windowOf(),
        { ...native, width: 2048 as DevicePixels },
        new AbortController().signal
      )
    ).rejects.toThrow("camera calibration");
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
      obsolete = reply(file.bytes.slice(12000, 16120), 12000, newVersion),
      cancel = vi.spyOn(obsolete.body!, "cancel"),
      reader = vi.spyOn(obsolete.body!, "getReader");
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(reply(file.bytes.slice(0, 8192), 0))
      .mockResolvedValueOnce(obsolete)
      .mockResolvedValueOnce(reply(file.bytes.slice(0, 8192), 0, newVersion))
      .mockResolvedValueOnce(
        reply(file.bytes.slice(12000, 16120), 12000, newVersion)
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
      first = reply(new Uint8Array(512), 17144, newVersion, true),
      second = reply(new Uint8Array(512), 17144, newVersion, true, 20001);
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
        reply(file.bytes.slice(0, 8192), 0, oldVersion, true)
      )
      .mockResolvedValueOnce(
        reply(file.bytes.slice(12000, 16120), 12000, oldVersion, true)
      )
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(
        reply(file.bytes.slice(0, 8192), 0, newVersion, true)
      )
      .mockResolvedValueOnce(
        reply(file.bytes.slice(12000, 16120), 12000, newVersion, true)
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
    other.bytes[12008] = 0;
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
  file.bytes.fill(0, 12024, 16120);
  file.bytes.set(new TextEncoder().encode(JSON.stringify(file.index)), 12024);
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
  const decoded: { level: number; bitmap: ImageBitmap }[] = [];
  const makeBitmap = (level: number) => {
    const size = dimensions(level),
      bitmap = { ...size, close: vi.fn() } as unknown as ImageBitmap;
    decoded.push({ level, bitmap });
    return bitmap;
  };
  const decode = vi.fn(async (blob: Blob) =>
    makeBitmap(new Uint8Array(await blob.arrayBuffer())[0])
  );
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
  return { source, decode, decoded, canvas, network, makeBitmap };
};
describe("worker-owned whole pyramid cell retention", () => {
  it("warms coarse to fine without whole-photo RGBA/canvas and skips resident cells", async () => {
    const view = warmFixture(),
      progress = vi.fn(),
      signal = new AbortController().signal;
    view.source.setActiveCacheBudget();
    expect(view.decode).not.toHaveBeenCalled();
    expect(view.canvas).not.toHaveBeenCalled();
    await view.source.warmAllLevels(native, signal, { onProgress: progress });
    expect(view.decoded.map((entry) => entry.level)).toEqual([3, 2, 1]);
    expect(view.canvas).not.toHaveBeenCalled();
    expect(view.source.isFullyDecoded).toBe(true);
    expect(view.source.coverage.map((entry) => entry.complete)).toEqual([
      true,
      true,
      true,
    ]);
    expect(progress.mock.calls.at(-1)?.[0]).toMatchObject({
      level: 1,
      decodedCells: 1,
      totalCells: 1,
      completedLevels: 3,
      totalLevels: 3,
    });
    const selected = await view.source.select(windowOf(), native, signal);
    expect(view.source.hasCached(selected.image, [0, 0, 128, 96])).toBe(true);
    const calls = view.network.mock.calls.length;
    await view.source.warmAllLevels(native, signal);
    expect(view.decode).toHaveBeenCalledTimes(3);
    expect(view.network).toHaveBeenCalledTimes(calls);
    expect(view.source.residentBytes).toBeGreaterThan(
      (512 * 384 + 256 * 192 + 128 * 96) * 4
    );
    expect(view.source.residentBytes).toBeLessThan(768 * 1024 * 1024);
    view.source.close();
    expect(view.source.residentBytes).toBe(0);
  });
  it("evicts coverage on park and can restore the active admission budget without allocation", async () => {
    const view = warmFixture(),
      signal = new AbortController().signal;
    view.source.setActiveCacheBudget();
    await view.source.warmAllLevels(native, signal);
    view.source.park(64 * 1024);
    expect(view.source.isFullyDecoded).toBe(false);
    expect(
      view.source.coverage.every((entry) => entry.decodedCells === 0)
    ).toBe(true);
    expect(view.source.residentBytes).toBeLessThanOrEqual(64 * 1024);
    view.decoded.forEach((entry) =>
      expect(entry.bitmap.close).toHaveBeenCalledOnce()
    );
    view.source.setActiveCacheBudget();
    expect(view.decode).toHaveBeenCalledTimes(3);
    await view.source.warmAllLevels(native, signal);
    expect(view.source.isFullyDecoded).toBe(true);
    expect(view.decode).toHaveBeenCalledTimes(6);
    view.source.close();
  });
  it("retains coherent completed cells but stops later levels on background abort", async () => {
    const view = warmFixture(),
      controller = new AbortController();
    view.source.setActiveCacheBudget();
    await expect(
      view.source.warmAllLevels(native, controller.signal, {
        onProgress: () => controller.abort(),
      })
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(view.decoded.map((entry) => entry.level)).toEqual([3]);
    expect(view.source.isFullyDecoded).toBe(false);
    expect(
      view.source.coverage.find((entry) => entry.level === 3)?.complete
    ).toBe(true);
    view.source.close();
  });
  it("pauses for foreground work and rejects stale coverage after a source epoch change", async () => {
    const view = warmFixture();
    view.source.setActiveCacheBudget();
    let busy = true;
    const warm = view.source.warmAllLevels(
      native,
      new AbortController().signal,
      { shouldYield: () => busy, onProgress: () => view.source.close() }
    );
    await new Promise((resolve) => setTimeout(resolve, 1));
    expect(view.decode).not.toHaveBeenCalled();
    busy = false;
    await expect(warm).rejects.toMatchObject({ name: "AvifAssetChangedError" });
    expect(view.source.coverage).toEqual([]);
    expect(view.source.residentBytes).toBe(0);
  });
  it("shares a cell decode while ROI cancellation leaves the background consumer alive", async () => {
    const view = warmFixture();
    view.source.setActiveCacheBudget();
    let release: (bitmap: ImageBitmap) => void = () => {};
    view.decode.mockImplementationOnce(
      async () =>
        new Promise<ImageBitmap>((resolve) => {
          release = resolve;
        })
    );
    const warm = view.source.warmAllLevels(
      native,
      new AbortController().signal
    );
    await vi.waitFor(() => expect(view.decode).toHaveBeenCalledTimes(1));
    const signal = new AbortController(),
      selected = await view.source.select(windowOf(), native, signal.signal);
    const read = view.source.read(
      selected.image,
      [0, 0, 128, 96],
      signal.signal
    );
    const rejected = expect(read).rejects.toMatchObject({ name: "AbortError" });
    await new Promise((resolve) => setTimeout(resolve, 1));
    signal.abort();
    await rejected;
    release(view.makeBitmap(3));
    await warm;
    expect(view.decode).toHaveBeenCalledTimes(3);
    expect(view.source.isFullyDecoded).toBe(true);
    view.source.close();
  });
});
