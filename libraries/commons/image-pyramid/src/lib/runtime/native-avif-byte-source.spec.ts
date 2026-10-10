import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import documentFixture from "../core/__fixtures__/oblique-document.json";
import {
  embedObliqueAvifDocument,
  parseNativeAvif,
  type StandaloneAvifDocument,
} from "../core/avif-native-convention";
import { parseAvifGridIndex } from "../core/avif-grid-index";
import {
  AvifAssetChangedError,
  NativeAvifFormatError,
} from "./avif-source-errors";
import { AvifTileSource } from "./avif-tile-source";
import { AvifPyramidPreviewSource } from "./avif-pyramid-preview-source";
import type { DevicePixels } from "@carma-units";
import {
  getRegisteredNativeAvif,
  NativeAvifByteSource,
  openStandaloneAvif,
  registerNativeAvifBlob,
} from "./native-avif-byte-source";

const signal = () => new AbortController().signal;
const releases: (() => void)[] = [];
const sources: NativeAvifByteSource[] = [];
const viewers: AvifTileSource[] = [];
const nativeFixture = () =>
  Uint8Array.from(
    readFileSync(
      new URL(
        "../core/__fixtures__/native-four-two-cells.avif",
        import.meta.url
      )
    )
  );
const standalone = (largeDocument = false) => {
  const metadata = structuredClone(
    documentFixture
  ) as unknown as StandaloneAvifDocument;
  if (largeDocument) metadata.provenance.note = "preview ".repeat(24_000);
  return embedObliqueAvifDocument(nativeFixture(), metadata);
};
const localBlob = (bytes: Uint8Array) =>
  new Blob([Uint8Array.from(bytes)], { type: "image/avif" });

const mockServer = (bytes: Uint8Array, chunkSize = 4096) => {
  const layout = parseNativeAvif(bytes)!,
    cancelled = vi.fn();
  let cursor = 0;
  const calls: (string | null)[] = [];
  const fetchMock = vi.fn(
    async (_input: RequestInfo | URL, init?: RequestInit) => {
      const range = new Headers(init?.headers).get("Range");
      calls.push(range);
      const bounds = range && /^bytes=(\d+)-(\d+)$/.exec(range);
      const start = bounds ? Number(bounds[1]) : 0;
      const end = bounds
        ? Math.min(Number(bounds[2]), bytes.length - 1)
        : bytes.length - 1;
      if (start < layout.previewPrefixEnd) {
        cursor = start;
        return new Response(
          new ReadableStream<Uint8Array>(
            {
              pull(controller) {
                if (cursor > end) {
                  controller.close();
                  return;
                }
                if (cursor >= layout.previewPrefixEnd)
                  throw Error(
                    "Reader consumed enhancement bytes before preview cancellation"
                  );
                const chunkEnd = Math.min(
                  cursor + chunkSize,
                  layout.previewPrefixEnd,
                  end + 1
                );
                controller.enqueue(bytes.slice(cursor, chunkEnd));
                cursor = chunkEnd;
              },
              cancel: cancelled,
            },
            { highWaterMark: 0 }
          ),
          {
            status: range ? 206 : 200,
            headers: {
              "Content-Length": String(end - start + 1),
              ...(range
                ? { "Content-Range": `bytes ${start}-${end}/${bytes.length}` }
                : {}),
              ETag: '"fixture-v1"',
            },
          }
        );
      }
      if (!bounds) throw Error("Unexpected range header");
      return new Response(bytes.slice(start, end + 1), {
        status: 206,
        headers: {
          "Content-Length": String(end - start + 1),
          "Content-Range": `bytes ${start}-${end}/${bytes.length}`,
          ETag: '"fixture-v1"',
        },
      });
    }
  );
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls, cancelled, layout, receivedBytes: () => cursor };
};

afterEach(() => {
  viewers.splice(0).forEach((viewer) => viewer.dispose());
  releases.splice(0).forEach((release) => release());
  sources.splice(0).forEach((source) => source.dispose());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("native AVIF first-response byte source", () => {
  it("continues a large bootstrap in bounded adjacent windows and reserves its budget once", async () => {
    const metadata = structuredClone(
      documentFixture
    ) as unknown as StandaloneAvifDocument;
    metadata.provenance.note = "prefix ".repeat(90_000);
    const bytes = embedObliqueAvifDocument(nativeFixture(), metadata);
    const server = mockServer(bytes);
    expect(server.layout.previewPrefixEnd).toBeGreaterThan(512 * 1024);
    const budget = { remainingBytes: 1024 * 1024 };
    const source = new NativeAvifByteSource(
      "https://images.example.test/windowed.avif"
    );
    sources.push(source);
    const opened = await source.open(signal(), { prefetchBudget: budget });
    expect(server.calls).toEqual(["bytes=0-524287", "bytes=524288-1048575"]);
    expect(opened.bytes.length).toBe(server.layout.previewPrefixEnd);
    expect(source.requestCount).toBe(2);
    expect(budget.remainingBytes).toBe(1024 * 1024 - opened.bytes.length);
    expect(source.cacheRevision).toBe('"fixture-v1"');
    expect(server.cancelled).toHaveBeenCalledTimes(1);
  });

  it("bounds the first window to the available byte budget and releases unused bytes", async () => {
    const bytes = standalone(),
      server = mockServer(bytes);
    const allowance = server.layout.previewPrefixEnd + 20;
    const budget = { remainingBytes: allowance };
    const source = new NativeAvifByteSource(
      "https://images.example.test/budget-prefix.avif"
    );
    sources.push(source);
    await source.open(signal(), { prefetchBudget: budget });
    expect(server.calls).toEqual([`bytes=0-${allowance - 1}`]);
    expect(budget.remainingBytes).toBe(20);
  });

  it("rejects an oversized prefix early and refunds unread bootstrap budget", async () => {
    const bytes = standalone(true),
      server = mockServer(bytes);
    const budget = { remainingBytes: 128 * 1024 };
    const source = new NativeAvifByteSource(
      "https://images.example.test/exhausted-prefix.avif"
    );
    sources.push(source);
    await expect(
      source.open(signal(), { prefetchBudget: budget })
    ).rejects.toMatchObject({ name: "ImagePrefetchBudgetExceeded" });
    expect(server.calls).toEqual(["bytes=0-131071"]);
    expect(server.receivedBytes()).toBeLessThan(128 * 1024);
    expect(budget.remainingBytes).toBe(128 * 1024 - server.receivedBytes());
    expect(source.compressedBytes).toBe(0);
  });

  it("does not combine bootstrap windows from changed HTTP revisions", async () => {
    const metadata = structuredClone(
      documentFixture
    ) as unknown as StandaloneAvifDocument;
    metadata.provenance.note = "prefix ".repeat(90_000);
    const bytes = embedObliqueAvifDocument(nativeFixture(), metadata);
    const server = mockServer(bytes);
    const original = server.fetchMock.getMockImplementation()!;
    server.fetchMock.mockImplementation(async (input, init) => {
      const response = await original(input, init);
      if (new Headers(init?.headers).get("Range")?.startsWith("bytes=524288-"))
        response.headers.set("ETag", '"fixture-v2"');
      return response;
    });
    const source = new NativeAvifByteSource(
      "https://images.example.test/changed-prefix.avif"
    );
    sources.push(source);
    await expect(source.open(signal())).rejects.toBeInstanceOf(
      AvifAssetChangedError
    );
    expect(source.compressedBytes).toBe(0);
    expect(server.calls).toHaveLength(2);
  });

  it("respects an explicitly unlimited read context instead of inheriting an exhausted source budget", async () => {
    const bytes = standalone(),
      server = mockServer(bytes);
    const source = new NativeAvifByteSource(
      "https://images.example.test/unlimited-context.avif"
    );
    sources.push(source);
    source.prefetchBudget = { remainingBytes: 0 };
    const opened = await source.open(signal(), { prefetchBudget: undefined });
    expect(opened.layout.previewPrefixEnd).toBe(server.layout.previewPrefixEnd);
    expect(server.calls).toEqual(["bytes=0-524287"]);
    expect(source.prefetchBudget.remainingBytes).toBe(0);
  });

  it.each(["gzip", "br"])(
    "rejects a %s bootstrap representation before publishing indexed bytes",
    async (coding) => {
      const bytes = standalone(),
        cancelled = vi.fn();
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response(
              new ReadableStream<Uint8Array>({
                start(controller) {
                  controller.enqueue(bytes);
                },
                cancel: cancelled,
              }),
              { status: 200, headers: { "Content-Encoding": coding } }
            )
        )
      );
      const source = new NativeAvifByteSource(
        "https://images.example.test/compressed.avif"
      );
      sources.push(source);
      await expect(source.open(signal())).rejects.toThrow(
        /unchanged representation/
      );
      expect(cancelled).toHaveBeenCalledTimes(1);
      expect(source.compressedBytes).toBe(0);
    }
  );
  it.each([false, true])(
    "uses one bounded GET and cancels at complete L4 before decoding (large document=%s)",
    async (large) => {
      const bytes = standalone(large),
        server = mockServer(bytes);
      expect(server.layout.previewPrefixEnd > 128 * 1024).toBe(large);
      const handle = await openStandaloneAvif(
        "https://images.example.test/first.avif",
        signal()
      );
      releases.push(handle.release);
      const decoder = vi.fn(async (blob: Blob) => {
        expect(server.cancelled).toHaveBeenCalledTimes(1);
        const index = parseAvifGridIndex(
          new Uint8Array(await blob.arrayBuffer())
        );
        return { ...index.dimensions, close: vi.fn() } as ImageBitmap;
      });
      vi.stubGlobal("createImageBitmap", decoder);
      const viewer = new AvifTileSource(`${handle.url}?pyramid=1`);
      viewers.push(viewer);
      const pyramid = await viewer.open(signal());
      expect(pyramid.native).toEqual({ width: 2048, height: 1024 });
      expect(pyramid.levels.map((level) => level.level)).toEqual([1, 2, 3, 4]);
      const bitmap = await viewer.decode(
        { level: 4, col: 1, row: 0 },
        signal()
      );
      expect([bitmap.width, bitmap.height]).toEqual([64, 64]);
      expect(server.calls).toEqual(["bytes=0-524287"]);
      expect(server.receivedBytes()).toBe(server.layout.previewPrefixEnd);
      expect(handle.source.requestCount).toBe(1);
      expect(handle.bytes.length).toBe(server.layout.previewPrefixEnd);
      expect(handle.source.compressedBytes).toBe(
        server.layout.previewPrefixEnd
      );
    }
  );

  it("upgrades one interior tile with only its missing layers and reuses lower dependencies", async () => {
    const bytes = standalone(),
      server = mockServer(bytes);
    const handle = await openStandaloneAvif(
      "https://images.example.test/sparse.avif",
      signal()
    );
    releases.push(handle.release);
    const viewer = new AvifTileSource(handle.url);
    viewers.push(viewer);
    for (const level of [4, 3, 2, 1]) {
      await viewer.fetch([{ level, col: 1, row: 0 }], signal());
      expect(viewer.hasBytes({ level, col: 1, row: 0 })).toBe(true);
    }
    const ranges = server.layout.index.cells[1].ranges.slice(1);
    expect(server.calls).toEqual([
      "bytes=0-524287",
      ...ranges.map((r) => `bytes=${r.offset}-${r.offset + r.length - 1}`),
    ]);
    expect(handle.source.requestCount).toBe(4);
    const count = server.fetchMock.mock.calls.length;
    for (const r of server.layout.index.cells[1].ranges) {
      expect(await handle.source.read(r.offset, r.length, signal())).toEqual(
        bytes.slice(r.offset, r.offset + r.length)
      );
    }
    expect(server.fetchMock).toHaveBeenCalledTimes(count);
  });

  it("deduplicates simultaneous requests for the same uncached extent", async () => {
    const bytes = standalone(),
      server = mockServer(bytes);
    const handle = await openStandaloneAvif(
      "https://images.example.test/shared-range.avif",
      signal()
    );
    releases.push(handle.release);
    const range = server.layout.index.cells[0].ranges[1];
    const [first, second] = await Promise.all([
      handle.source.read(range.offset, range.length, signal()),
      handle.source.read(range.offset, range.length, signal()),
    ]);
    expect(first).toEqual(
      bytes.slice(range.offset, range.offset + range.length)
    );
    expect(second).toEqual(first);
    expect(server.calls).toHaveLength(2);
  });

  it("rejects invalid ranges before sending another HTTP request", async () => {
    const bytes = standalone(),
      server = mockServer(bytes);
    const handle = await openStandaloneAvif(
      "https://images.example.test/invalid-range.avif",
      signal()
    );
    releases.push(handle.release);
    for (const [offset, length] of [
      [-1, 2],
      [0, 0],
      [bytes.length - 1, 2],
      [0, 4 * 1024 * 1024 + 1],
    ]) {
      await expect(
        handle.source.read(offset, length, signal())
      ).rejects.toThrow(/Invalid native AVIF range/);
    }
    expect(server.calls).toEqual(["bytes=0-524287"]);
  });

  it("refuses an enhancement range belonging to a changed HTTP representation", async () => {
    const bytes = standalone(),
      server = mockServer(bytes),
      handle = await openStandaloneAvif(
        "https://images.example.test/changed.avif",
        signal()
      );
    releases.push(handle.release);
    const range = server.layout.index.cells[0].ranges[1];
    server.fetchMock.mockImplementationOnce(
      async () =>
        new Response(bytes.slice(range.offset, range.offset + range.length), {
          status: 206,
          headers: {
            "Content-Range": `bytes ${range.offset}-${
              range.offset + range.length - 1
            }/${bytes.length}`,
            ETag: '"fixture-v2"',
          },
        })
    );
    await expect(
      handle.source.read(range.offset, range.length, signal())
    ).rejects.toThrow(/representation changed/);
  });
});

describe("standalone AVIF registration and ownership", () => {
  it("reads local Blob ranges without HTTP and revokes its URI once on release", async () => {
    const bytes = standalone(),
      fetchMock = vi.fn(() => {
        throw Error("Local AVIF must not fetch");
      });
    vi.stubGlobal("fetch", fetchMock);
    const create = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:https://images.example.test/local-fixture");
    const revoke = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    const handle = await openStandaloneAvif(localBlob(bytes), signal());
    releases.push(handle.release);
    expect(create).toHaveBeenCalledTimes(1);
    expect(getRegisteredNativeAvif(`${handle.url}?pyramid=1`)).toBe(
      handle.source
    );
    const range = handle.layout.index.cells[1].ranges[3];
    expect(
      await handle.source.read(range.offset, range.length, signal())
    ).toEqual(bytes.slice(range.offset, range.offset + range.length));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(handle.source.requestCount).toBe(0);
    handle.release();
    handle.release();
    expect(getRegisteredNativeAvif(handle.url)).toBeUndefined();
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith(handle.url);
    expect(() => handle.source.open(signal())).toThrow(/released/);
  });

  it("rejects a complete preview prefix when imported as a full file", async () => {
    const bytes = standalone(),
      layout = parseNativeAvif(bytes)!;
    const source = new NativeAvifByteSource(
      "blob:full-prefix",
      localBlob(bytes.slice(0, layout.previewPrefixEnd))
    );
    sources.push(source);
    await expect(source.open(signal())).rejects.toThrow(
      /Unsupported native AVIF bootstrap/
    );
  });

  it("allows the complete cached preview only with an explicit worker lease, without HTTP", async () => {
    const bytes = standalone(),
      layout = parseNativeAvif(bytes)!;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    releases.push(
      registerNativeAvifBlob(
        "blob:worker-prefix",
        localBlob(bytes.slice(0, layout.previewPrefixEnd)),
        { previewOnly: true }
      )
    );
    const source = getRegisteredNativeAvif("blob:worker-prefix")!;
    const opened = await source.open(signal());
    expect(opened.layout.previewPrefixEnd).toBe(layout.previewPrefixEnd);
    for (const cell of layout.index.cells) {
      const range = cell.ranges[0];
      expect(await source.read(range.offset, range.length, signal())).toEqual(
        bytes.slice(range.offset, range.offset + range.length)
      );
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a worker preview prefix missing even one required byte", async () => {
    const bytes = standalone(),
      layout = parseNativeAvif(bytes)!;
    releases.push(
      registerNativeAvifBlob(
        "blob:incomplete-worker-prefix",
        localBlob(bytes.slice(0, layout.previewPrefixEnd - 1)),
        { previewOnly: true }
      )
    );
    await expect(
      getRegisteredNativeAvif("blob:incomplete-worker-prefix")!.open(signal())
    ).rejects.toThrow(/Unsupported native AVIF bootstrap/);
  });

  it("removes and revokes a rejected local file without registering partial camera state", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue(
      "blob:https://images.example.test/no-camera-document"
    );
    const revoke = vi
        .spyOn(URL, "revokeObjectURL")
        .mockImplementation(() => undefined),
      fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      openStandaloneAvif(localBlob(nativeFixture()), signal())
    ).rejects.toThrow(/Kamerametadaten/);
    expect(
      getRegisteredNativeAvif(
        "blob:https://images.example.test/no-camera-document"
      )
    ).toBeUndefined();
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps a shared remote source alive until its final importing handle releases it", async () => {
    const bytes = standalone(),
      server = mockServer(bytes),
      url = "https://images.example.test/shared-import.avif";
    const first = await openStandaloneAvif(url, signal()),
      second = await openStandaloneAvif(`${url}?pyramid=1`, signal());
    releases.push(first.release, second.release);
    expect(first.source).toBe(second.source);
    expect(server.calls).toEqual(["bytes=0-524287"]);
    first.release();
    expect(getRegisteredNativeAvif(url)).toBe(second.source);
    const range = second.layout.index.cells[1].ranges[1];
    expect(
      await second.source.read(range.offset, range.length, signal())
    ).toEqual(bytes.slice(range.offset, range.offset + range.length));
    second.release();
    expect(getRegisteredNativeAvif(url)).toBeUndefined();
  });

  it("does no HTTP work when opening with an already aborted signal", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    controller.abort();
    await expect(
      openStandaloneAvif(
        "https://images.example.test/aborted.avif",
        controller.signal
      )
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      getRegisteredNativeAvif("https://images.example.test/aborted.avif")
    ).toBeUndefined();
  });
});

describe("native reader discovery and browser header visibility", () => {
  function readerServer(
    hidden: boolean,
    beforeRanges?: (ranges: number[][]) => void | Promise<void>
  ) {
    const bytes = standalone();
    const calls: (string | null)[] = [];
    let changed = false;
    let cursor = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_: unknown, init: RequestInit = {}) => {
        const range = new Headers(init.headers).get("range");
        calls.push(range);
        const headers: Record<string, string> = {
          "Last-Modified": changed
            ? "Sat, 10 Oct 2026 12:00:01 GMT"
            : "Sat, 10 Oct 2026 12:00:00 GMT",
        };
        if (!hidden) headers.ETag = changed ? '"v2"' : '"v1"';
        // This fixture deliberately ignores the bootstrap Range, retaining the
        // 200 early-cancel and hidden enhancement-header regression paths.
        if (!range || range.startsWith("bytes=0-")) {
          headers["Content-Length"] = String(bytes.length);
          return new Response(
            new ReadableStream(
              {
                pull(c) {
                  const end = Math.min(cursor + 4096, bytes.length);
                  c.enqueue(bytes.slice(cursor, end));
                  cursor = end;
                  if (end === bytes.length) c.close();
                },
              },
              { highWaterMark: 0 }
            ),
            { status: 200, headers }
          );
        }
        const ranges = range
          .slice(6)
          .split(",")
          .map((x) => x.split("-").map(Number));
        await beforeRanges?.(ranges);
        if (ranges.length === 1) {
          const [a, b] = ranges[0],
            end = Math.min(b + 1, bytes.length);
          headers["Content-Length"] = String(end - a);
          if (!hidden)
            headers["Content-Range"] = `bytes ${a}-${end - 1}/${bytes.length}`;
          return new Response(bytes.slice(a, end), { status: 206, headers });
        }
        const boundary = "native-test-boundary",
          parts: any[] = [];
        for (const [a, b] of ranges) {
          parts.push(
            new TextEncoder().encode(
              `--${boundary}\r\nContent-Type: image/avif\r\nContent-Range: bytes ${a}-${b}/${bytes.length}\r\n\r\n`
            ),
            bytes.slice(a, b + 1),
            new TextEncoder().encode("\r\n")
          );
        }
        parts.push(new TextEncoder().encode(`--${boundary}--\r\n`));
        headers["Content-Type"] = "multipart/byteranges; boundary=" + boundary;
        return new Response(new Blob(parts), { status: 206, headers });
      })
    );
    return {
      calls,
      layout: parseNativeAvif(bytes)!,
      bootstrapBytes: () => cursor,
      change() {
        changed = true;
      },
    };
  }
  const pendingGate = () => {
    let release!: () => void;
    const promise = new Promise<void>((resolve) => {
      release = resolve;
    });
    return { promise, release };
  };
  const enhancementRanges = (
    layout: NonNullable<ReturnType<typeof parseNativeAvif>>
  ) =>
    layout.index.cells.flatMap((cell) =>
      cell.ranges
        .slice(1)
        .map((range, index) => ({ ...range, level: 3 - index }))
    );
  const overlaps = (
    request: number[],
    range: { offset: number; length: number }
  ) => request[0] < range.offset + range.length && request[1] >= range.offset;
  const verifyPhysicalRequests = (server: ReturnType<typeof readerServer>) => {
    const extents = enhancementRanges(server.layout);
    const requests = server.calls
      .filter(
        (value): value is string =>
          value !== null && !value.startsWith("bytes=0-")
      )
      .map((value) =>
        value
          .slice(6)
          .split(",")
          .map((part) => part.split("-").map(Number))
      );
    for (const ranges of requests) {
      const physicalLevels = new Set(
        extents
          .filter((extent) => ranges.some((range) => overlaps(range, extent)))
          .map((extent) => extent.level)
      );
      expect(physicalLevels.size).toBe(1);
    }
    // Cumulative L3/L2/L1 consumers reuse each lower extent, including in-flight bytes.
    for (const extent of extents) {
      const covering = requests
        .flat()
        .filter((range) => overlaps(range, extent));
      expect(covering).toHaveLength(1);
      expect(
        covering.reduce(
          (sum, range) =>
            sum +
            Math.min(range[1] + 1, extent.offset + extent.length) -
            Math.max(range[0], extent.offset),
          0
        )
      ).toBe(
        extent.length -
          Math.max(
            0,
            Math.min(server.bootstrapBytes(), extent.offset + extent.length) -
              extent.offset
          )
      );
    }
  };

  it("publishes mixed-level native tiles before a held L1 response without mixing or refetching physical layers", async () => {
    const gate = pendingGate();
    const layout = parseNativeAvif(standalone())!;
    const fine = enhancementRanges(layout).filter((range) => range.level === 1);
    const server = readerServer(true, (ranges) =>
      ranges.some((range) => fine.some((extent) => overlaps(range, extent)))
        ? gate.promise
        : undefined
    );
    const source = new AvifTileSource(
      "https://private.test/progressive-mixed.avif"
    );
    viewers.push(source);
    const sig = signal();
    await source.open(sig);
    const tiles = [1, 2, 3].flatMap((level) =>
      [0, 1].map((col) => ({ level, col, row: 0 }))
    );
    const ready = vi.fn();
    let completed = false;
    const fetching = source.fetch(tiles, sig, "high", ready).then(() => {
      completed = true;
    });
    try {
      await vi.waitFor(() =>
        expect(
          ready.mock.calls.filter(([tile]) => tile.level === 3)
        ).toHaveLength(2)
      );
      expect(
        server.calls.some(
          (call) =>
            call !== null &&
            !call.startsWith("bytes=0-") &&
            call
              .slice(6)
              .split(",")
              .some((part) =>
                fine.some((extent) =>
                  overlaps(part.split("-").map(Number), extent)
                )
              )
        )
      ).toBe(true);
      expect(completed).toBe(false);
      expect(source.hasBytes({ level: 3, col: 1, row: 0 })).toBe(true);
      expect(source.hasBytes({ level: 1, col: 1, row: 0 })).toBe(false);
      expect(ready.mock.calls.some(([tile]) => tile.level === 1)).toBe(false);
    } finally {
      gate.release();
      await fetching;
    }
    expect(ready).toHaveBeenCalledTimes(tiles.length);
    verifyPhysicalRequests(server);
  });

  it("decodes a coarse preview query while a concurrent fine query waits only for its own enhancement", async () => {
    const gate = pendingGate();
    const layout = parseNativeAvif(standalone())!;
    const fine = enhancementRanges(layout).filter((range) => range.level === 1);
    const server = readerServer(true, (ranges) =>
      ranges.some((range) => fine.some((extent) => overlaps(range, extent)))
        ? gate.promise
        : undefined
    );
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async (blob: Blob) => {
        const index = parseAvifGridIndex(
          new Uint8Array(await blob.arrayBuffer())
        );
        return {
          width: index.dimensions.width,
          height: index.dimensions.height,
          close: vi.fn(),
        };
      })
    );
    const source = new AvifPyramidPreviewSource(
      "https://private.test/progressive-preview.avif",
      undefined,
      "high"
    );
    const native = {
      width: 2048 as DevicePixels,
      height: 1024 as DevicePixels,
    };
    const windowAt = (scale: number) => ({
      source: { x: 0 as DevicePixels, y: 0 as DevicePixels, ...native },
      target: {
        width: (native.width * scale) as DevicePixels,
        height: (native.height * scale) as DevicePixels,
      },
    });
    const sig = signal();
    await source.getDimensions(sig);
    let completed = false;
    const fineQuery = source
      .warmVisibleDecoded(windowAt(0.5), native, sig)
      .then(() => {
        completed = true;
      });
    let coarseComplete = false;
    const coarseQuery = source
      .warmVisibleDecoded(windowAt(0.125), native, sig)
      .then(() => {
        coarseComplete = true;
      });
    try {
      await vi.waitFor(() => expect(coarseComplete).toBe(true));
      expect(completed).toBe(false);
      expect(
        source.levelReadiness
          .find((level) => level.level === 3)!
          .states.every((state) => state === 3)
      ).toBe(true);
      expect(
        server.calls.some(
          (call) =>
            call !== null &&
            !call.startsWith("bytes=0-") &&
            call
              .slice(6)
              .split(",")
              .some((part) =>
                fine.some((extent) =>
                  overlaps(part.split("-").map(Number), extent)
                )
              )
        )
      ).toBe(true);
    } finally {
      gate.release();
      await Promise.all([fineQuery, coarseQuery]);
      source.close();
    }
    verifyPhysicalRequests(server);
  });

  it.each([false, true])(
    "native automatic URL discovery with CORS-hidden headers=%s",
    async (hidden) => {
      const s = readerServer(hidden),
        source = new AvifTileSource(
          "https://private.test/auto-" + hidden + ".avif"
        );
      viewers.push(source);
      const p = await source.open(new AbortController().signal);
      expect(p.native).toEqual({ width: 2048, height: 1024 });
      expect(s.calls[0]).toBe("bytes=0-524287");
      const tile = { level: 1, col: 1, row: 0 };
      await source.fetch([tile], new AbortController().signal);
      expect(source.hasBytes(tile)).toBe(true);
      const count = s.calls.length;
      await source.fetch([tile], new AbortController().signal);
      expect(s.calls.length).toBe(count);
    }
  );
  it.each([false, true])(
    "known-native starts complete L4 with one GET CORS-hidden=%s",
    async (hidden) => {
      const s = readerServer(hidden),
        source = new AvifTileSource(
          "https://private.test/hint-" + hidden + ".avif"
        );
      viewers.push(source);
      const sig = new AbortController().signal;
      await source.open(sig);
      await source.fetch(
        [
          { level: 4, col: 0, row: 0 },
          { level: 4, col: 1, row: 0 },
        ],
        sig
      );
      expect(s.calls).toEqual(["bytes=0-524287"]);
    }
  );
  it.each([false, true])(
    "changed representation rejects uncached enhancement CORS-hidden=%s",
    async (hidden) => {
      const s = readerServer(hidden),
        source = new AvifTileSource(
          "https://private.test/change-" + hidden + ".avif"
        );
      viewers.push(source);
      const sig = new AbortController().signal;
      await source.open(sig);
      s.change();
      await expect(
        source.fetch([{ level: 1, col: 1, row: 0 }], sig)
      ).rejects.toBeInstanceOf(AvifAssetChangedError);
      expect(source.hasBytes({ level: 1, col: 1, row: 0 })).toBe(false);
    }
  );

  it("rejects unimplemented zero-offset affine instead of publishing wrong sensor mapping", async () => {
    const metadata = structuredClone(
      documentFixture
    ) as unknown as StandaloneAvifDocument;
    for (let level = 1; level <= 4; level++) {
      const scale = 2 ** level;
      metadata.pixelMapping.levelToSensorAffine[String(level)] = [
        [scale, 0, 0],
        [0, scale, 0],
      ];
    }
    const old = embedObliqueAvifDocument(nativeFixture(), metadata);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(old, {
            headers: { "Content-Length": String(old.length) },
          })
      )
    );
    const source = new AvifTileSource(
      "https://private.test/unsupported-affine.avif"
    );
    viewers.push(source);
    await expect(source.open(new AbortController().signal)).rejects.toThrow(
      "Unsupported native AVIF sensor mapping"
    );
  });
});

describe("native reader rejects unsupported containers", () => {
  it("rejects the legacy UUID container without trying a second format", async () => {
    const bytes = new Uint8Array(60),
      view = new DataView(bytes.buffer);
    const box = (at: number, size: number, type: string) => {
      view.setUint32(at, size);
      bytes.set(new TextEncoder().encode(type), at + 4);
    };
    box(0, 24, "ftyp");
    box(24, 12, "meta");
    box(36, 4120, "uuid");
    bytes.set(
      "9264b9097b6840af91dcb95a8d3a1b80"
        .match(/../g)!
        .map((value) => parseInt(value, 16)),
      44
    );
    const network = vi.fn();
    vi.stubGlobal("fetch", network);
    const source = new NativeAvifByteSource(
      "https://private.test/legacy-index.avif",
      localBlob(bytes)
    );
    sources.push(source);
    await expect(source.open(signal())).rejects.toBeInstanceOf(
      NativeAvifFormatError
    );
    expect(network).not.toHaveBeenCalled();
  });
  it("rejects a positively identified native file with damaged primary metadata instead of trying legacy", async () => {
    const bytes = standalone();
    const marker = new TextEncoder().encode("pitm");
    const at = bytes.findIndex(
      (value, i) =>
        value === marker[0] && marker.every((v, n) => bytes[i + n] === v)
    );
    expect(at).toBeGreaterThan(0);
    bytes.set(new TextEncoder().encode("junk"), at);
    const network = vi.fn();
    vi.stubGlobal("fetch", network);
    const source = new NativeAvifByteSource(
      "https://private.test/broken-native.avif",
      localBlob(bytes)
    );
    sources.push(source);
    await expect(source.open(signal())).rejects.toBeInstanceOf(
      NativeAvifFormatError
    );
    expect(network).not.toHaveBeenCalled();
  });
});
