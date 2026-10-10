// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DevicePixels } from "@carma-units";
import { AvifPyramidPreviewSource } from "./avif-pyramid-preview-source";
import { BoundedImageRangeCache } from "./bounded-image-range-cache";
import { parseAvifGridIndex } from "../core/avif-grid-index";
import { NativeAvifFormatError } from "./avif-source-errors";
import type { NativeAvifByteSource } from "./native-avif-byte-source";
import { nativePreviewFixture } from "./native-preview-test-fixture";
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
const legacyFixture = (
  largeMdat = false,
  metaBytes = largeMdat ? 20000 : 32
) => {
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
const fixture = nativePreviewFixture;
const streamingReply = (
  file: { bytes: Uint8Array; layout?: { previewPrefixEnd: number } },
  version = oldVersion
) => {
  const prefix = file.layout?.previewPrefixEnd ?? file.bytes.length;
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(file.bytes.slice(0, prefix));
        controller.enqueue(file.bytes.slice(prefix));
        controller.close();
      },
    }),
    {
      status: 200,
      headers: {
        "Content-Length": String(file.bytes.length),
        "Last-Modified": version,
      },
    }
  );
};
const isBootstrapRange = (range: string | null) =>
  range === null || /^bytes=0-\d+$/.test(range);
const fileReply = (
  file: { bytes: Uint8Array; layout?: { previewPrefixEnd: number } },
  options?: RequestInit,
  version = oldVersion,
  visibleRange = false
) => {
  expect(options?.method).not.toBe("HEAD");
  const range = new Headers(options?.headers).get("Range");
  // A deliberately ignored bootstrap Range keeps the existing streaming-200
  // cancellation and byte-bound tests. All enhancements retain their 206 paths.
  if (range === null || isBootstrapRange(range))
    return streamingReply(file, version);
  const spans = range
    .slice(6)
    .split(",")
    .map((part) => part.split("-").map(Number));
  if (spans.length === 1) {
    const [start, end] = spans[0];
    return reply(
      file.bytes.slice(start, end + 1),
      start,
      version,
      visibleRange,
      file.bytes.length
    );
  }
  const body: BlobPart[] = [];
  for (const [start, end] of spans)
    body.push(
      `--native-test\r\nContent-Type: image/avif\r\nContent-Range: bytes ${start}-${end}/${file.bytes.length}\r\n\r\n`,
      file.bytes.slice(start, end + 1),
      "\r\n"
    );
  body.push("--native-test--\r\n");
  return new Response(new Blob(body), {
    status: 206,
    headers: {
      "Content-Type": "multipart/byteranges; boundary=native-test",
      "Last-Modified": version,
    },
  });
};
const mockFile = (
  file: {
    bytes: Uint8Array;
    layout?: { previewPrefixEnd: number };
  } = fixture(),
  visibleRange = false
) => {
  const fetch = vi.fn(async (_url: unknown, options?: RequestInit) =>
    fileReply(file, options, oldVersion, visibleRange)
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
};
const readEncodedRange = (
  source: AvifPyramidPreviewSource,
  offset: number,
  length: number,
  signal: AbortSignal
) =>
  (
    source as unknown as {
      range(
        offset: number,
        length: number,
        signal: AbortSignal
      ): Promise<Uint8Array>;
    }
  ).range(offset, length, signal);
afterEach(() => {
  vi.unstubAllGlobals();
});
describe("bounded local AVIF range assembly", () => {
  it("joins adjacent RAM spans without requesting their combined extent again", async () => {
    const file = fixture(),
      offset = file.layout.index.cells[0].ranges[3].offset;
    file.bytes.set([41, 42, 43, 44], offset);
    const network = mockFile(file);
    const source = new AvifPyramidPreviewSource(
      "https://images.test/ram-parts.avif"
    );
    const signal = new AbortController().signal;
    await source.getDimensions(signal);
    source.park(0);
    source.setActiveCacheBudget(1024);
    await readEncodedRange(source, offset, 2, signal);
    await readEncodedRange(source, offset + 2, 2, signal);
    network.mockClear();
    expect(await readEncodedRange(source, offset, 4, signal)).toEqual(
      new Uint8Array([41, 42, 43, 44])
    );
    expect(network).not.toHaveBeenCalled();
    source.close();
  });
  it("combines resident bytes with verified persistent partial spans", async () => {
    const file = fixture(),
      offset = file.layout.index.cells[0].ranges[3].offset;
    file.bytes.set([41, 42, 43, 44], offset);
    const network = mockFile(file);
    const source = new AvifPyramidPreviewSource(
      "https://images.test/disk-parts.avif"
    );
    const signal = new AbortController().signal;
    await source.getDimensions(signal);
    source.park(0);
    source.setActiveCacheBudget(1024);
    await readEncodedRange(source, offset, 2, signal);
    const now = Date.now();
    const known = vi
      .spyOn(BoundedImageRangeCache.prototype, "knownRanges")
      .mockImplementation((version) =>
        version === oldVersion
          ? {
              ranges: [{ offset: offset + 2, length: 2 }],
              checkedAt: now,
              validUntil: now + 60_000,
            }
          : undefined
      );
    const get = vi
      .spyOn(BoundedImageRangeCache.prototype, "get")
      .mockImplementation(async (requestedOffset, length, version) =>
        requestedOffset === offset + 2 && length === 2 && version === oldVersion
          ? new Uint8Array([43, 44])
          : undefined
      );
    network.mockClear();
    try {
      expect(await readEncodedRange(source, offset, 4, signal)).toEqual(
        new Uint8Array([41, 42, 43, 44])
      );
      expect(get).toHaveBeenCalledWith(offset + 2, 2, oldVersion, signal);
      expect(network).not.toHaveBeenCalled();
    } finally {
      get.mockRestore();
      known.mockRestore();
      source.close();
    }
  });
  it("fetches only the missing span when a persistent inventory outlives its data", async () => {
    const file = fixture(),
      offset = file.layout.index.cells[0].ranges[3].offset;
    file.bytes.set([41, 42, 43, 44], offset);
    const network = mockFile(file);
    const source = new AvifPyramidPreviewSource(
      "https://images.test/evicted-parts.avif"
    );
    const signal = new AbortController().signal;
    await source.getDimensions(signal);
    source.park(0);
    source.setActiveCacheBudget(1024);
    await readEncodedRange(source, offset, 2, signal);
    const now = Date.now();
    const known = vi
      .spyOn(BoundedImageRangeCache.prototype, "knownRanges")
      .mockReturnValue({
        ranges: [{ offset: offset + 2, length: 2 }],
        checkedAt: now,
        validUntil: now + 60_000,
      });
    const get = vi
      .spyOn(BoundedImageRangeCache.prototype, "get")
      .mockResolvedValue(undefined);
    network.mockClear();
    try {
      expect(await readEncodedRange(source, offset, 4, signal)).toEqual(
        new Uint8Array([41, 42, 43, 44])
      );
      expect(network).toHaveBeenCalledOnce();
      expect(new Headers(network.mock.calls[0][1]?.headers).get("Range")).toBe(
        `bytes=${offset + 2}-${offset + 3}`
      );
    } finally {
      get.mockRestore();
      known.mockRestore();
      source.close();
    }
  });
  it("rejects an assembled result when a missing-span response changes the asset version", async () => {
    const file = fixture(),
      offset = file.layout.index.cells[0].ranges[3].offset;
    file.bytes.set([41, 42, 43, 44], offset);
    const network = mockFile(file);
    const source = new AvifPyramidPreviewSource(
      "https://images.test/changed-parts.avif"
    );
    const signal = new AbortController().signal;
    await source.getDimensions(signal);
    source.park(0);
    source.setActiveCacheBudget(1024);
    await readEncodedRange(source, offset, 2, signal);
    network.mockClear();
    network.mockImplementation(async () =>
      reply(
        new Uint8Array([53, 54]),
        offset + 2,
        newVersion,
        false,
        file.bytes.length
      )
    );
    await expect(
      readEncodedRange(source, offset, 4, signal)
    ).rejects.toMatchObject({ name: "AvifAssetChangedError" });
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

  it("rejects independent image-only L0 pyramids rather than silently assuming native L1", async () => {
    const file = legacyFixture();
    const index = {
      ...file.index,
      baseLevel: 0,
      levels: {
        0: { ...file.index.levels[1], width: 1024, height: 768, scale: 1 },
      },
    };
    file.bytes.fill(0, 20024, 24120);
    file.bytes.set(new TextEncoder().encode(JSON.stringify(index)), 20024);
    mockFile(file);
    const source = new AvifPyramidPreviewSource(
      "https://images.test/fullres.avif"
    );
    await expect(
      source.getDimensions(new AbortController().signal)
    ).rejects.toBeInstanceOf(NativeAvifFormatError);
    source.close();
  });
  it("initializes a native image-only file at its declared delivered dimensions", async () => {
    mockFile(fixture({ calibrated: false }));
    const source = new AvifPyramidPreviewSource(
        "https://images.test/image-only.avif"
      ),
      signal = new AbortController().signal;
    const dimensions = {
      width: 512 as DevicePixels,
      height: 384 as DevicePixels,
    };
    expect(await source.getDimensions(signal)).toEqual(dimensions);
    expect(
      (
        await source.select(
          {
            source: {
              x: 0 as DevicePixels,
              y: 0 as DevicePixels,
              ...dimensions,
            },
            target: dimensions,
          },
          dimensions,
          signal
        )
      ).image.level
    ).toBe(1);
    source.close();
  });

  it("reuses the native L4 overview bitmap for smaller crops without another transfer", async () => {
    const view = warmFixture(),
      signal = new AbortController().signal;
    const page = await view.source.ensureOverview(signal);
    expect(page?.level).toBe(4);
    view.network.mockClear();
    expect((await view.source.read(page!, [0, 0, 64, 48], signal)).length).toBe(
      64 * 48 * 4
    );
    expect(view.source.hasCached(page!, [10, 20, 30, 40])).toBe(true);
    expect(view.source.hasLocallyAvailable(page!, [10, 20, 30, 40])).toBe(true);
    expect(view.source.hasLocallyAvailable(page!, [10, 20, 65, 40])).toBe(
      false
    );
    await view.source.read(page!, [10, 20, 30, 40], signal);
    expect(view.network).not.toHaveBeenCalled();
    expect(
      view.source.coverage.find((entry) => entry.level === 4)?.complete
    ).toBe(true);
    const bitmap = view.wholeBitmaps[0];
    expect(view.draw).toHaveBeenLastCalledWith(
      bitmap,
      10,
      20,
      20,
      20,
      0,
      0,
      20,
      20
    );
    view.source.close();
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it("rejects the former appended UUID/index instead of fetching its independent pyramid", async () => {
    const fetch = mockFile(legacyFixture()),
      source = new AvifPyramidPreviewSource(
        "https://images.test/independent.avif"
      );
    await expect(
      source.getDimensions(new AbortController().signal)
    ).rejects.toBeInstanceOf(NativeAvifFormatError);
    expect(fetch).toHaveBeenCalledOnce();
    expect(new Headers(fetch.mock.calls[0][1]?.headers).get("Range")).toBe(
      "bytes=0-524287"
    );
    source.close();
  });
  it("loads the native front metadata and L4 prefix in one GET and keeps them warm", async () => {
    const fetch = mockFile(),
      source = new AvifPyramidPreviewSource("https://images.test/photo.avif"),
      signal = new AbortController().signal;
    const selected = await source.select(windowOf(512, 384), native, signal, 8);
    expect(selected.image.level).toBe(4);
    expect(selected.refinements.map((p) => p.level)).toEqual([3, 2, 1]);
    await source.select(windowOf(), native, signal);
    expect(fetch).toHaveBeenCalledOnce();
    expect(new Headers(fetch.mock.calls[0][1]?.headers).get("Range")).toBe(
      "bytes=0-524287"
    );
    source.close();
  });

  it("keeps L4 for one-pixel output rounding but promotes a genuinely undersampled viewport", async () => {
    mockFile();
    const source = new AvifPyramidPreviewSource(
        "https://images.test/rounding.avif"
      ),
      signal = new AbortController().signal,
      window = {
        source: {
          x: 0 as DevicePixels,
          y: 0 as DevicePixels,
          width: 1000 as DevicePixels,
          height: 745 as DevicePixels,
        },
        target: { width: 63 as DevicePixels, height: 47 as DevicePixels },
      };
    // L4 contributes 62.5 x 46.5625 pixels: rounding each target axis up is sufficient.
    expect((await source.select(window, native, signal, 1)).image.level).toBe(
      4
    );
    expect(
      (
        await source.select(
          {
            ...window,
            target: { ...window.target, width: 64 as DevicePixels },
          },
          native,
          signal,
          1
        )
      ).image.level
    ).toBe(3);
    // Tiny requests must still have enough source samples, never a zero-pixel threshold.
    const tiny = {
      source: {
        ...window.source,
        width: 1 as DevicePixels,
        height: 1 as DevicePixels,
      },
      target: { width: 1 as DevicePixels, height: 1 as DevicePixels },
    };
    expect((await source.select(tiny, native, signal, 1)).image.level).toBe(1);
    const two = {
      source: {
        ...tiny.source,
        width: 4 as DevicePixels,
        height: 4 as DevicePixels,
      },
      target: { width: 2 as DevicePixels, height: 2 as DevicePixels },
    };
    expect((await source.select(two, native, signal, 1)).image.level).toBe(2);
    expect((await source.select(two, native, signal, 8)).image.level).toBe(4);
    source.close();
  });
  it("rejects a 12KiB independent metadata box without probing its old UUID tail", async () => {
    const fetch = mockFile(legacyFixture(false, 12389)),
      source = new AvifPyramidPreviewSource("https://images.test/typical.avif");
    await expect(
      source.select(windowOf(), native, new AbortController().signal)
    ).rejects.toBeInstanceOf(NativeAvifFormatError);
    expect(fetch).toHaveBeenCalledOnce();
    source.close();
  });
  it("streams a native 20KiB front metadata box in the same bounded bootstrap GET", async () => {
    const fetch = mockFile(fixture({ metadataPadding: 20000 })),
      source = new AvifPyramidPreviewSource(
        "https://images.test/large-native.avif"
      );
    expect(
      (await source.select(windowOf(), native, new AbortController().signal))
        .image.level
    ).toBe(3);
    expect(fetch).toHaveBeenCalledOnce();
    source.close();
  });

  it("rejects an independent UUID after a 64-bit mdat rather than scanning its payload", async () => {
    const fetch = mockFile(legacyFixture(true)),
      source = new AvifPyramidPreviewSource("https://images.test/large.avif");
    await expect(
      source.select(windowOf(), native, new AbortController().signal)
    ).rejects.toBeInstanceOf(NativeAvifFormatError);
    expect(fetch).toHaveBeenCalledOnce();
    source.close();
  });

  it.each([206, 404, 410])(
    "refuses invalid HTTP%s bootstrap responses before reading the body and without retry",
    async (status) => {
      const response = new Response(new Uint8Array(28000), {
          status,
          ...(status === 206
            ? { headers: { "Content-Range": "malformed" } }
            : {}),
        }),
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
      ).rejects.toThrow(
        status === 206 ? "Invalid Content-Range" : `refusing ${status}`
      );
      expect(read).not.toHaveBeenCalled();
      expect(cancel).toHaveBeenCalledOnce();
      expect(fetch).toHaveBeenCalledOnce();
    }
  );
  it("rejects HTTP200 for an enhancement Range without consuming the whole response", async () => {
    const file = fixture(),
      network = mockFile(file);
    const source = new AvifPyramidPreviewSource(
        "https://images.test/range-ignored.avif"
      ),
      signal = new AbortController().signal;
    await source.getDimensions(signal);
    const response = new Response(file.bytes, { status: 200 });
    const read = vi.spyOn(response.body!, "getReader"),
      cancel = vi.spyOn(response.body!, "cancel");
    network.mockClear();
    network.mockResolvedValueOnce(response);
    const range = file.layout.index.cells[0].ranges[3];
    await expect(
      readEncodedRange(source, range.offset, range.length, signal)
    ).rejects.toThrow("refusing 200");
    expect(read).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
    expect(network).toHaveBeenCalledOnce();
    source.close();
  });
  it("stops an oversized bootstrap stream at the native prefix budget", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(new Uint8Array(4 * 1024 * 1024 + 1), { status: 200 })
        )
    );
    await expect(
      new AvifPyramidPreviewSource("https://images.test/photo.avif").select(
        windowOf(),
        native,
        new AbortController().signal
      )
    ).rejects.toThrow("exceeds byte limit");
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
    expect(fetch).toHaveBeenCalledOnce();
    source.close();
  });
  it("retries exactly once when Last-Modified changes between native bootstrap and enhancement payload", async () => {
    const view = warmFixture(),
      signal = new AbortController().signal;
    const page = (await view.source.select(windowOf(), native, signal)).image;
    const range = view.file.layout.index.cells[0].ranges[1];
    const obsolete = reply(
      view.file.bytes.slice(range.offset, range.offset + range.length),
      range.offset,
      newVersion
    );
    const cancel = vi.spyOn(obsolete.body!, "cancel"),
      reader = vi.spyOn(obsolete.body!, "getReader");
    view.network
      .mockResolvedValueOnce(obsolete)
      .mockImplementation(async (_url, options) =>
        fileReply(view.file, options, newVersion)
      );
    await expect(
      view.source.read(page, [0, 0, 128, 96], signal)
    ).resolves.toHaveLength(128 * 96 * 4);
    expect(cancel).toHaveBeenCalledOnce();
    expect(reader).not.toHaveBeenCalled();
    expect(
      view.network.mock.calls.filter(([, options]) =>
        isBootstrapRange(new Headers(options?.headers).get("Range"))
      )
    ).toHaveLength(2);
    expect(view.decode).toHaveBeenCalledOnce();
    view.source.close();
  });

  it("stops continuous native version replacement after one retry before decoding pixels", async () => {
    const view = warmFixture(),
      signal = new AbortController().signal;
    const page = (await view.source.select(windowOf(), native, signal)).image;
    let rangeResponses = 0,
      bootstrapResponses = 0;
    const responses: Response[] = [];
    view.network.mockImplementation(async (_url, options) => {
      if (isBootstrapRange(new Headers(options?.headers).get("Range"))) {
        bootstrapResponses++;
        return streamingReply(view.file, newVersion);
      }
      const response = fileReply(
        view.file,
        options,
        rangeResponses++ === 0 ? newVersion : "Tue, 06 Oct 2026 10:00:04 GMT"
      );
      vi.spyOn(response.body!, "cancel");
      vi.spyOn(response.body!, "getReader");
      responses.push(response);
      return response;
    });
    await expect(
      view.source.read(page, [0, 0, 1, 1], signal)
    ).rejects.toMatchObject({ name: "AvifAssetChangedError" });
    expect(bootstrapResponses).toBe(1);
    expect(rangeResponses).toBe(2);
    responses.forEach((response) => {
      expect(response.body!.cancel).toHaveBeenCalledOnce();
      expect(response.body!.getReader).not.toHaveBeenCalled();
    });
    expect(view.decode).not.toHaveBeenCalled();
    view.source.close();
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
    ).rejects.toThrow("Unsupported AVIF bootstrap box");
    const other = legacyFixture();
    other.bytes[other.index.levels[1].length + 8] = 0;
    mockFile(other);
    await expect(
      new AvifPyramidPreviewSource("https://images.test/other.avif").select(
        windowOf(),
        native,
        new AbortController().signal
      )
    ).rejects.toBeInstanceOf(NativeAvifFormatError);
  });
});

const warmFixture = (file = fixture()) => {
  const decoded: { level: number; cellId?: number; bitmap: ImageBitmap }[] = [];
  const wholeBitmaps: ImageBitmap[] = [];
  const makeBitmap = (level: number, cellId?: number) => {
    const dimensions = file.layout.levels.get(level)!.dimensions;
    const bitmap = { ...dimensions, close: vi.fn() } as unknown as ImageBitmap;
    decoded.push({ level, cellId, bitmap });
    return bitmap;
  };
  const decode = vi.fn(async (blob: Blob) => {
    const encoded = new Uint8Array(await blob.arrayBuffer()),
      grid = parseAvifGridIndex(encoded);
    const first = grid.primary.ranges[0].offset;
    const payload = encoded.slice(first),
      cellId = payload[0],
      level = payload[payload.length - 3];
    const bitmap = {
      ...grid.dimensions,
      close: vi.fn(),
    } as unknown as ImageBitmap;
    decoded.push({ level, cellId, bitmap });
    return bitmap;
  });
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async (input: Blob | { width: number; height: number }) => {
      if (input instanceof Blob) return decode(input);
      const bitmap = {
        width: input.width,
        height: input.height,
        close: vi.fn(),
      } as unknown as ImageBitmap;
      wholeBitmaps.push(bitmap);
      return bitmap;
    })
  );
  vi.stubGlobal(
    "ImageData",
    class {
      constructor(
        public data: Uint8ClampedArray,
        public width: number,
        public height: number
      ) {}
    }
  );
  const canvas = vi.fn(),
    canvasOptions = vi.fn(),
    draw = vi.fn();
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      constructor(public width: number, public height: number) {
        canvas(width, height);
      }
      getContext(_kind: string, options: unknown) {
        canvasOptions(options);
        return {
          drawImage: draw,
          putImageData: vi.fn(),
          reset: vi.fn(),
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
        };
      }
    }
  );
  const network = mockFile(file),
    source = new AvifPyramidPreviewSource(
      "https://images.test/warm.avif",
      8 * 1024 * 1024
    );
  return {
    source,
    decode,
    decoded,
    wholeBitmaps,
    canvas,
    canvasOptions,
    draw,
    network,
    makeBitmap,
    file,
  };
};
const neighborhoodFixture = () =>
  warmFixture(fixture({ edgeX: 64, edgeY: 64 }));
const requestedSpans = (view: ReturnType<typeof warmFixture>) =>
  view.network.mock.calls.flatMap(([, options]) => {
    const range = new Headers(options?.headers).get("Range");
    return range && !isBootstrapRange(range)
      ? range
          .slice(6)
          .split(",")
          .map((part) => {
            const [start, end] = part.split("-").map(Number);
            return { offset: start, length: end - start + 1 };
          })
      : [];
  });
const trimEncoded = (source: AvifPyramidPreviewSource) =>
  (
    source as unknown as { nativeSource: NativeAvifByteSource }
  ).nativeSource.trimCompressedTo(0);
const detailWindow = (): ReturnType<typeof windowOf> => ({
  source: {
    x: 256 as DevicePixels,
    y: 192 as DevicePixels,
    width: 256 as DevicePixels,
    height: 192 as DevicePixels,
  },
  target: { width: 64 as DevicePixels, height: 48 as DevicePixels },
});
describe("bounded local AVIF pyramid neighbourhood", () => {
  it("prewarms only the entire immediate finer level as encoded ranges before the rest", async () => {
    const view = neighborhoodFixture(),
      signal = new AbortController().signal;
    const progress = vi.fn();
    await view.source.prewarmNextLevel(detailWindow(), native, signal, {
      onProgress: progress,
    });
    expect(view.decode).not.toHaveBeenCalled();
    expect(new Set(progress.mock.calls.map(([entry]) => entry.level))).toEqual(
      new Set([1])
    );
    expect(progress.mock.calls.at(-1)?.[0]).toMatchObject({
      fetchedRanges: 192,
      totalRanges: 192,
    });
    const states = view.source.levelReadiness.find(
      (entry) => entry.level === 1
    )!.states;
    expect(states).toHaveLength(48);
    expect([...states].every((state) => state === 2)).toBe(true);
    // L1 carries coarse prefixes, but warming it does not initialize another page's grid.
    expect(
      view.source.levelReadiness.find((entry) => entry.level === 2)!.states
    ).toHaveLength(0);
    const requests = view.network.mock.calls.length;
    const fine = view.file.layout.index.cells.map((cell) => cell.ranges[3]);
    expect(requestedSpans(view)).toContainEqual({
      offset: fine[0].offset,
      length: 48 * 4,
    });
    await view.source.prewarmNextLevel(detailWindow(), native, signal);
    expect(view.network).toHaveBeenCalledTimes(requests);
    view.source.close();
  });
  it("warms only visible next-finer children, bounded current guard and parent in that order", async () => {
    const view = neighborhoodFixture(),
      signal = new AbortController().signal;
    const progress = vi.fn();
    await view.source.warmNeighborhood(detailWindow(), native, signal, {
      decode: false,
      onProgress: progress,
    });
    const plans = view.source.neighborhoodReadiness;
    expect(plans.map(({ level, role }) => [level, role])).toEqual([
      [1, "next-finer"],
      [2, "current"],
      [3, "parent"],
    ]);
    expect(plans[0].totalTiles).toBe(12);
    expect(plans[0].totalTiles).toBeLessThan(8 * 6);
    expect(plans[0].encoded).toBe(plans[0].totalTiles);
    expect(plans.every((plan) => plan.decoded === 0)).toBe(true);
    expect(plans[0].nativeBounds[0]).toBeLessThan(detailWindow().source.x);
    expect(plans[0].nativeBounds[2]).toBeGreaterThan(
      detailWindow().source.x + detailWindow().source.width
    );
    expect(progress.mock.calls[0][0].role).toBe("next-finer");
    expect(view.decode).not.toHaveBeenCalled();
    const ranges = view.network.mock.calls.map(([, options]) =>
      new Headers(options?.headers).get("Range")
    );
    const fine = view.file.layout.index.cells.map((cell) => cell.ranges[3]);
    const spans = requestedSpans(view).filter(
      (span) => span.offset >= fine[0].offset
    );
    expect(spans).toEqual(
      [9, 17, 25].map((cell) => ({ offset: fine[cell].offset, length: 4 * 4 }))
    );
    expect(ranges.filter(isBootstrapRange)).toHaveLength(1);
    expect(spans.reduce((sum, span) => sum + span.length, 0)).toBe(12 * 4);
    view.source.close();
  });
  it("batches before centre-first decoding, keeps prepared cells resident and reuses them", async () => {
    const view = neighborhoodFixture(),
      signal = new AbortController().signal;
    let firstDecodeRequests = 0;
    const decode = view.decode.getMockImplementation()!;
    view.decode.mockImplementation(async (blob: Blob) => {
      if (!firstDecodeRequests)
        firstDecodeRequests = view.network.mock.calls.length;
      return decode(blob);
    });
    await view.source.warmNeighborhood(detailWindow(), native, signal);
    const plans = view.source.neighborhoodReadiness;
    expect(plans[0].decoded).toBe(plans[0].totalTiles);
    const fineAt = view.file.layout.index.cells[0].ranges[3].offset;
    expect(
      requestedSpans(view).filter((span) => span.offset >= fineAt)
    ).toHaveLength(3);
    expect(firstDecodeRequests).toBeGreaterThanOrEqual(3);
    expect(view.decoded[0]).toMatchObject({ level: 1, cellId: 20 }); // Native item 2 + row 2 / col 2 is nearest the crop centre.
    const requests = view.network.mock.calls.length,
      decodes = view.decode.mock.calls.length;
    await view.source.warmNeighborhood(detailWindow(), native, signal);
    expect(view.network).toHaveBeenCalledTimes(requests);
    expect(view.decode).toHaveBeenCalledTimes(decodes);
    view.source.close();
  });
  it("keeps encoded readiness useful when cells cannot fit the decoded budget", async () => {
    const view = neighborhoodFixture(),
      signal = new AbortController().signal;
    view.source.setActiveCacheBudget(16 * 1024);
    await view.source.warmNeighborhood(detailWindow(), native, signal);
    expect(view.decoded.every(({ level }) => level > 1)).toBe(true); // Smaller parent cells may fit; L1 cannot.
    expect(view.source.neighborhoodReadiness[0].decoded).toBe(0);
    expect(view.source.neighborhoodReadiness[0].encoded).toBeGreaterThan(0);
    expect(view.source.neighborhoodReadiness[0].requiredBytes).toBe(
      12 * 64 * 64 * 4
    );
    expect(view.source.residentBytes).toBeLessThanOrEqual(16 * 1024);
    view.source.close();
    expect(view.source.neighborhoodReadiness).toEqual([]);
  });
  it("stops the local plan promptly and does not warm outside cells after cancellation", async () => {
    const view = neighborhoodFixture(),
      controller = new AbortController();
    const progress = vi.fn(() => controller.abort());
    await expect(
      view.source.warmNeighborhood(detailWindow(), native, controller.signal, {
        onProgress: progress,
      })
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(progress).toHaveBeenCalledOnce();
    expect(view.decode).not.toHaveBeenCalled();
    view.source.close();
  });
  it("includes exact composition halos in foreground decoded preparation", async () => {
    const view = neighborhoodFixture(),
      signal = new AbortController().signal;
    const window = {
      source: {
        x: 256 as DevicePixels,
        y: 256 as DevicePixels,
        width: 128 as DevicePixels,
        height: 128 as DevicePixels,
      },
      target: { width: 64 as DevicePixels, height: 64 as DevicePixels },
    };
    await view.source.warmVisibleDecoded(window, native, signal);
    // The aligned one-cell visible crop also needs adjacent cells touched by the one-pixel linear guard.
    expect(view.decode).toHaveBeenCalledTimes(9);
    view.source.close();
  });
});
const drawingContext = () => ({
  save: vi.fn(),
  restore: vi.fn(),
  beginPath: vi.fn(),
  rect: vi.fn(),
  clip: vi.fn(),
  drawImage: vi.fn(),
  getImageData: vi.fn(),
  imageSmoothingEnabled: false,
  imageSmoothingQuality: "high",
});
describe("native AVIF bitmap viewport drawing", () => {
  it("joins integer tile pixels before one fractional native scale without RGBA readback", async () => {
    const view = neighborhoodFixture(),
      signal = new AbortController().signal;
    const page = (
      await view.source.select(
        {
          ...detailWindow(),
          target: { width: 256 as DevicePixels, height: 192 as DevicePixels },
        },
        native,
        signal
      )
    ).image;
    const context = drawingContext(),
      destination = { x: 10, y: 20, width: 129, height: 97.25 };
    await view.source.drawBBoxTo(
      page,
      [127.5, 95.25, 256.5, 192.5],
      context as unknown as OffscreenCanvasRenderingContext2D,
      destination,
      signal
    );
    expect(context.drawImage).toHaveBeenCalledOnce();
    const [canvas, sx, sy, sw, sh, dx, dy, dw, dh] =
      context.drawImage.mock.calls[0];
    expect(canvas).toMatchObject({ width: 132, height: 100 });
    expect([sx, sy, sw, sh]).toEqual([1.5, 1.25, 129, 97.25]);
    expect([dx, dy, dw, dh]).toEqual([10, 20, 129, 97.25]);
    expect(view.decode).toHaveBeenCalledTimes(12);
    expect(context.rect).toHaveBeenCalledWith(10, 20, 129, 97.25);
    expect(context.save).toHaveBeenCalledOnce();
    expect(context.restore).toHaveBeenCalledOnce();
    expect(context.imageSmoothingEnabled).toBe(true);
    expect(context.imageSmoothingQuality).toBe("low");
    expect(context.getImageData).not.toHaveBeenCalled();
    expect(view.canvas).toHaveBeenCalledWith(132, 100);
    expect(view.canvasOptions).toHaveBeenCalledWith({ alpha: false });
    expect(view.source.memoryMetrics.nativeCompositionCanvasBytes).toBe(
      132 * 100 * 4
    );
    view.source.close();
    expect(view.source.memoryMetrics.nativeCompositionCanvasBytes).toBe(0);
  });
  it("bounds large native stitches in contiguous integral output bands", async () => {
    const view = neighborhoodFixture(),
      signal = new AbortController().signal;
    const page = (await view.source.select(windowOf(512, 384), native, signal))
      .image;
    view.source.setActiveCacheBudget(64 * 1024);
    const context = drawingContext();
    await view.source.drawBBoxTo(
      page,
      [0, 0, 512, 384],
      context as unknown as OffscreenCanvasRenderingContext2D,
      { x: 0, y: 0, width: 256, height: 192 },
      signal
    );
    expect(context.drawImage.mock.calls.length).toBeGreaterThan(1);
    let bottom = 0;
    for (const args of context.drawImage.mock.calls) {
      expect(args[6]).toBe(bottom);
      expect(Number.isInteger(args[6])).toBe(true);
      bottom += args[8];
    }
    expect(bottom).toBe(192);
    expect(
      view.source.memoryMetrics.nativeCompositionCanvasBytes
    ).toBeLessThanOrEqual(512 * 67 * 4);
    expect(context.getImageData).not.toHaveBeenCalled();
    expect(
      view.canvasOptions.mock.calls.every(
        ([options]) =>
          !(options as { willReadFrequently?: boolean }).willReadFrequently
      )
    ).toBe(true);
    view.source.close();
  });
  it("streams a zero-cache-budget viewport in whole tile-row bands instead of repeated one-pixel decodes", async () => {
    const view = warmFixture(
        fixture({ width: 512, height: 768, edgeX: 512, edgeY: 512 })
      ),
      signal = new AbortController().signal;
    const portraitNative = {
      width: 1024 as DevicePixels,
      height: 1536 as DevicePixels,
    };
    view.source.setActiveCacheBudget(0);
    const window = {
      source: { x: 0 as DevicePixels, y: 0 as DevicePixels, ...portraitNative },
      target: { width: 512 as DevicePixels, height: 768 as DevicePixels },
    };
    const page = (await view.source.select(window, portraitNative, signal))
      .image;
    const context = drawingContext();
    await view.source.drawBBoxTo(
      page,
      [0, 0, 512, 768],
      context as unknown as OffscreenCanvasRenderingContext2D,
      { x: 0, y: 0, width: 512, height: 768 },
      signal
    );
    expect(context.drawImage).toHaveBeenCalledTimes(2);
    expect(view.decode).toHaveBeenCalledTimes(4); // each tile is touched at most twice by the one-pixel band overlap
    for (const result of view.decode.mock.results)
      expect((await result.value).close).toHaveBeenCalledOnce();
    expect(context.getImageData).not.toHaveBeenCalled();
    expect(view.source.memoryMetrics.decodedBytes).toBe(0);
    expect(view.source.memoryMetrics.nativeCompositionCanvasBytes).toBe(0);
    expect(
      view.canvas.mock.calls.every(
        ([width, height]) => width * height * 4 <= 16 * 1024 * 1024
      )
    ).toBe(true);
    view.source.close();
  });
  it("draws a ready whole sublevel directly as one borrowed bitmap", async () => {
    const view = warmFixture(),
      signal = new AbortController().signal;
    const page = await view.source.ensureOverview(signal);
    const context = drawingContext(),
      requests = view.network.mock.calls.length;
    view.canvas.mockClear();
    await view.source.drawBBoxTo(
      page!,
      [10.25, 20.5, 60.75, 40.25],
      context as unknown as OffscreenCanvasRenderingContext2D,
      { x: 0, y: 0, width: 200, height: 190 },
      signal
    );
    expect(context.drawImage).toHaveBeenCalledOnce();
    expect(context.drawImage.mock.calls[0]).toEqual([
      view.wholeBitmaps[0],
      10.25,
      20.5,
      50.5,
      19.75,
      0,
      0,
      200,
      190,
    ]);
    expect(view.network).toHaveBeenCalledTimes(requests);
    expect(view.canvas).not.toHaveBeenCalled();
    expect(view.wholeBitmaps[0].close).not.toHaveBeenCalled();
    view.source.close();
    expect(view.wholeBitmaps[0].close).toHaveBeenCalledOnce();
  });

  it("closes a temporary cell once and restores the drawing context on cancellation", async () => {
    const view = neighborhoodFixture(),
      controller = new AbortController();
    const page = (
      await view.source.select(windowOf(512, 384), native, controller.signal)
    ).image;
    view.source.setActiveCacheBudget(0);
    const context = drawingContext();
    context.drawImage.mockImplementationOnce(() => controller.abort());
    await expect(
      view.source.drawBBoxTo(
        page,
        [127, 127, 193, 193],
        context as unknown as OffscreenCanvasRenderingContext2D,
        { x: 0, y: 0, width: 66, height: 66 },
        controller.signal
      )
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(context.restore).toHaveBeenCalledOnce();
    const bitmap = await view.decode.mock.results[0].value;
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(context.getImageData).not.toHaveBeenCalled();
    view.source.close();
  });
  it("uses a uniform immediate parent rather than a distant overview or a partial sharper rectangle", async () => {
    const view = neighborhoodFixture(),
      signal = new AbortController().signal;
    const full = windowOf(512, 384),
      target = (await view.source.select(full, native, signal)).image;
    await view.source.warmVisibleDecoded(windowOf(128, 96), native, signal);
    expect(view.source.availablePage(full, native, target)).toBeNull(); // L3 is two levels too coarse.
    await view.source.warmVisibleDecoded(windowOf(256, 192), native, signal);
    expect(view.source.availablePage(full, native, target)?.level).toBe(2);
    await view.source.warmVisibleDecoded(
      {
        source: {
          x: 256 as DevicePixels,
          y: 256 as DevicePixels,
          width: 128 as DevicePixels,
          height: 128 as DevicePixels,
        },
        target: { width: 64 as DevicePixels, height: 64 as DevicePixels },
      },
      native,
      signal
    );
    expect(view.source.availablePage(full, native, target)?.level).toBe(2);
    await view.source.warmVisibleDecoded(full, native, signal);
    expect(view.source.availablePage(full, native, target)?.level).toBe(1);
    view.source.close();
  });
});
describe("bounded AVIF display and encoded prewarming", () => {
  it("recognizes RAM payload coverage synchronously without treating it as decoded", async () => {
    const view = warmFixture();
    const signal = new AbortController().signal;
    const { image } = await view.source.select(
      windowOf(128, 96),
      native,
      signal
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
    expect(view.source.hasLocallyAvailable(image, [0.5, 0, 128, 96])).toBe(
      false
    );
    expect(
      view.source.hasLocallyAvailable(
        { ...image, entry: { ...image.entry } },
        bounds
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
    const { image } = await view.source.select(
      windowOf(130, 96),
      native,
      signal
    );
    trimEncoded(view.source);
    const requests = view.network.mock.calls.length;
    expect(
      view.source.levelReadiness.find((page) => page.level === 2)
        ?.previouslyFetchedCells[0]
    ).toBe(1);
    expect(view.source.hasLocallyAvailable(image, [0, 0, 256, 192])).toBe(
      false
    );
    expect(view.network).toHaveBeenCalledTimes(requests);
    view.source.close();
  });
  it("accepts only a fresh persistent inventory for the current asset version", async () => {
    const view = warmFixture();
    const signal = new AbortController().signal;
    view.source.setActiveCacheBudget(0);
    await view.source.prewarm(windowOf(), native, signal);
    const { image } = await view.source.select(
      windowOf(130, 96),
      native,
      signal
    );
    trimEncoded(view.source);
    const requests = view.network.mock.calls.length;
    const now = Date.now();
    const decodes = view.decode.mock.calls.length;
    const inventory = {
      ranges: view.file.layout.levels.get(image.level)!.cells[0].ranges,
      checkedAt: now,
      validUntil: now + 60_000,
    };
    const knownRanges = vi.spyOn(
      BoundedImageRangeCache.prototype,
      "knownRanges"
    );
    try {
      knownRanges.mockImplementation((version) =>
        version === oldVersion ? inventory : undefined
      );
      expect(view.source.hasLocallyAvailable(image, [0, 0, 256, 192])).toBe(
        true
      );
      expect(view.source.hasCached(image, [0, 0, 256, 192])).toBe(false);
      knownRanges.mockReturnValue({ ...inventory, validUntil: now - 1 });
      expect(view.source.hasLocallyAvailable(image, [0, 0, 256, 192])).toBe(
        false
      );
      knownRanges.mockImplementation((version) =>
        version === newVersion ? inventory : undefined
      );
      expect(view.source.hasLocallyAvailable(image, [0, 0, 256, 192])).toBe(
        false
      );
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
    const { image } = await view.source.select(
      windowOf(130, 96),
      native,
      signal
    );
    trimEncoded(view.source);
    const now = Date.now();
    const inventory = {
      ranges: view.file.layout.levels.get(image.level)!.cells[0].ranges,
      checkedAt: now,
      validUntil: now + 60_000,
    };
    const known = vi
      .spyOn(BoundedImageRangeCache.prototype, "knownRanges")
      .mockReturnValue(undefined);
    const refresh = vi
      .spyOn(BoundedImageRangeCache.prototype, "ensureKnownRanges")
      .mockImplementation(async () => {
        known.mockImplementation((version) =>
          version === oldVersion ? inventory : undefined
        );
      });
    const requests = view.network.mock.calls.length,
      decodes = view.decode.mock.calls.length;
    try {
      expect(view.source.hasLocallyAvailable(image, [0, 0, 256, 192])).toBe(
        false
      );
      await view.source.ensureLocalAvailability(signal);
      expect(refresh).toHaveBeenCalledWith(signal);
      expect(view.source.hasLocallyAvailable(image, [0, 0, 256, 192])).toBe(
        true
      );
      expect(view.network).toHaveBeenCalledTimes(requests);
      expect(view.decode).toHaveBeenCalledTimes(decodes);
    } finally {
      refresh.mockRestore();
      known.mockRestore();
      view.source.close();
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
      new Set([1, 2, 3, 4])
    );
    expect(view.decoded.map((entry) => entry.level)).toEqual([4, 2]);
    const memory = view.source.memoryMetrics;
    expect(memory.overviewBytes).toBe(64 * 48 * 4);
    expect(memory.decodedBytes - memory.overviewBytes).toBeLessThanOrEqual(
      (64 * 48 + 256 * 192) * 4
    );
    expect(memory.largestDecodedTilePixels).toBeLessThanOrEqual(1024 * 1024);
    expect(memory.residentBytes + memory.decodeCanvasBytes).toBeLessThanOrEqual(
      8 * 1024 * 1024
    );
    view.source.close();
  });
  it("coalesces adjacent native cell payloads without decoding them or warming them twice", async () => {
    const view = warmFixture(fixture({ edgeX: 256, edgeY: 384 })),
      signal = new AbortController().signal;
    view.source.setActiveCacheBudget(0);
    await view.source.ensureOverview(signal);
    view.network.mockClear();
    view.decode.mockClear();
    await view.source.prewarm(windowOf(), native, signal);
    for (let layer = 1; layer < 4; layer++) {
      const ranges = view.file.layout.index.cells.map(
        (cell) => cell.ranges[layer]
      );
      expect(
        requestedSpans(view).filter((span) => span.offset === ranges[0].offset)
      ).toEqual([{ offset: ranges[0].offset, length: 8 }]);
      expect(requestedSpans(view)).not.toContainEqual(ranges[1]);
    }
    expect(view.decode).not.toHaveBeenCalled();
    expect(view.source.memoryMetrics.decodedBytes).toBe(
      view.source.memoryMetrics.overviewBytes
    );
    const requests = view.network.mock.calls.length;
    await view.source.prewarm(windowOf(), native, signal);
    expect(view.network).toHaveBeenCalledTimes(requests);
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
      decodedBytes: 64 * 48 * 4,
      overviewBytes: 64 * 48 * 4,
    });
    view.source.park(0);
    expect(view.source.memoryMetrics.decodedBytes).toBe(0);
    expect(view.source.memoryMetrics.rangeBytes).toBeGreaterThan(0);
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
    expect(view.source.memoryMetrics.decodedBytes).toBe(0);
    expect(view.source.memoryMetrics.rangeBytes).toBeGreaterThan(0);
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
    expect(view.source.memoryMetrics.decodedBytes).toBe(
      view.source.memoryMetrics.overviewBytes
    );
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
      name: "AbortError",
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
