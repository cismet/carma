import { readFileSync } from "node:fs";
import { parseNativeAvif } from "../core/avif-native-convention";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NativeAvifFormatError } from "./avif-source-errors";
import { parseAvifGridIndex, type AvifRange } from "../core/avif-grid-index";
import { BoundedImageRangeCache } from "./bounded-image-range-cache";
import { ImagePrefetchBudgetExceeded } from "./image-tile-source";
import { AvifTileSource, abortable } from "./avif-tile-source";
import { NativeAvifCellDecoders } from "./native-avif-cell-decoder";

const PYRAMID_UUID = "9264b9097b6840af91dcb95a8d3a1b80";
const encoder = new TextEncoder();
const nativeFixture = () =>
  Uint8Array.from(
    readFileSync(
      new URL(
        "../core/__fixtures__/native-four-two-cells.avif",
        import.meta.url
      )
    )
  );

/**
 * ftyp, meta, mdat, optional foreign uuid box, the pyramid index uuid box
 * (8 + 16 + 4096 bytes) and an absolute cell table at the tail.
 */
const pyramidFile = ({
  indexAt,
  foreignUuid = false,
}: {
  indexAt: number;
  foreignUuid?: boolean;
}) => {
  const foreignBytes = foreignUuid ? 64 : 0;
  const pyramidAt = indexAt + foreignBytes;
  const tableAt = pyramidAt + 8 + 16 + 4096;
  const table = encoder.encode(
    JSON.stringify({
      level: 1,
      tileEdge: 512,
      cells: [{ x: 0, y: 0, itemId: 1, ranges: [{ offset: 100, length: 50 }] }],
    })
  );
  const bytes = new Uint8Array(tableAt + table.length);
  const view = new DataView(bytes.buffer);
  const box = (at: number, size: number, type: string) => {
    view.setUint32(at, size);
    bytes.set(encoder.encode(type), at + 4);
  };
  const uuid = (at: number, hex: string) =>
    bytes.set(
      hex.match(/../g)!.map((pair) => parseInt(pair, 16)),
      at + 8
    );
  box(0, 24, "ftyp");
  box(24, 32, "meta");
  box(56, indexAt - 56, "mdat");
  if (foreignUuid) {
    box(indexAt, foreignBytes, "uuid");
    uuid(indexAt, "00112233445566778899aabbccddeeff");
  }
  box(pyramidAt, 8 + 16 + 4096, "uuid");
  uuid(pyramidAt, PYRAMID_UUID);
  bytes.set(
    encoder.encode(
      JSON.stringify({
        schema: 1,
        format: "avif-independent-pyramid",
        baseLevel: 1,
        sourceSensorDimensions: [1024, 1024],
        levels: {
          1: {
            offset: 56,
            length: 500,
            width: 512,
            height: 512,
            cellsIndex: { offset: tableAt, length: table.length },
          },
        },
      })
    ),
    pyramidAt + 24
  );
  bytes.set(table, tableAt);
  return { bytes, pyramidAt, tableAt, tableLength: table.length };
};

const serve = (bytes: Uint8Array) => {
  const ranges: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: RequestInit) => {
      const range = new Headers(init?.headers).get("Range");
      ranges.push(range ?? "GET");
      // This fixture deliberately models a server ignoring the bootstrap Range.
      if (!range || range.startsWith("bytes=0-"))
        return new Response(bytes, { status: 200 });
      const [start, end] = range.slice(6).split("-").map(Number);
      return new Response(bytes.slice(start, Math.min(end + 1, bytes.length)), {
        status: 206,
        headers: { "Last-Modified": "Thu, 08 Oct 2026 10:00:00 GMT" },
      });
    })
  );
  return ranges;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AVIF pyramid metadata reads", () => {
  it("rejects an independent pyramid whose UUID index lies beyond the head", async () => {
    const file = pyramidFile({ indexAt: 20000 });
    const requests = serve(file.bytes);
    const source = new AvifTileSource("https://images.test/far.avif");
    await expect(
      source.open(new AbortController().signal)
    ).rejects.toBeInstanceOf(NativeAvifFormatError);
    expect(requests).toEqual(["bytes=0-524287"]);
    source.dispose();
  });

  it("rejects an independent pyramid even when a foreign UUID precedes its index", async () => {
    const file = pyramidFile({ indexAt: 20000, foreignUuid: true });
    const requests = serve(file.bytes);
    const source = new AvifTileSource("https://images.test/foreign.avif");
    await expect(
      source.open(new AbortController().signal)
    ).rejects.toBeInstanceOf(NativeAvifFormatError);
    expect(requests).toEqual(["bytes=0-524287"]);
    source.dispose();
  });

  it("rejects the independent UUID format even when its full index is in the first response", async () => {
    const file = pyramidFile({ indexAt: 2000 });
    const requests = serve(file.bytes);
    const source = new AvifTileSource("https://images.test/near.avif");
    await expect(
      source.open(new AbortController().signal)
    ).rejects.toBeInstanceOf(NativeAvifFormatError);
    expect(requests).toEqual(["bytes=0-524287"]);
    source.dispose();
  });
});

describe("AVIF source-local allowed levels", () => {
  it.each([{ allowed: [3, 4] }, { allowed: [4] }])(
    "opens only allowed native levels $allowed without detail requests",
    async ({ allowed }) => {
      const file = progressiveFile(),
        server = progressiveServer(file);
      const source = new AvifTileSource(
        `https://images.test/coarse-${allowed}.avif`,
        { allowedLevels: allowed }
      );
      try {
        const pyramid = await source.open(new AbortController().signal);
        expect(pyramid.levels.map((level) => level.level)).toEqual(allowed);
        expect(server.requests).toEqual([
          [{ offset: 0, length: file.bootstrapEnd }],
        ]);
      } finally {
        source.dispose();
      }
    }
  );
  it("keeps all native levels available to an unrestricted source of the same URL", async () => {
    const file = progressiveFile(),
      server = progressiveServer(file);
    const url = "https://images.test/shared-full-and-coarse.avif";
    const coarse = new AvifTileSource(url, { allowedLevels: [3, 4] }),
      full = new AvifTileSource(url);
    try {
      expect(
        (await coarse.open(new AbortController().signal)).levels.map(
          (level) => level.level
        )
      ).toEqual([3, 4]);
      expect(
        (await full.open(new AbortController().signal)).levels.map(
          (level) => level.level
        )
      ).toEqual([1, 2, 3, 4]);
      expect(server.requests).toEqual(
        Array.from({ length: 2 }, () => [
          { offset: 0, length: file.bootstrapEnd },
        ])
      );
    } finally {
      coarse.dispose();
      full.dispose();
    }
  });
});

describe("abortable shared AVIF work", () => {
  it("observes shared rejection even when the caller is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const work = Promise.reject(new Error("underlying request also aborted"));
    const then = vi.spyOn(work, "then");
    await expect(abortable(work, controller.signal)).rejects.toBe(
      controller.signal.reason
    );
    const observed = then.mock.calls.some(
      ([, rejection]) => typeof rejection === "function"
    );
    // Always consume fixture rejection, so failure identifies the missing observer
    // rather than creating unrelated unhandled-rejection noise in the test runner.
    await work.catch(() => undefined);
    expect(observed).toBe(true);
  });

  it("lets one aborted consumer stop waiting while shared work still completes", async () => {
    const first = new AbortController(),
      second = new AbortController();
    let resolve!: (value: number) => void;
    const work = new Promise<number>((done) => {
      resolve = done;
    });
    const a = abortable(work, first.signal),
      b = abortable(work, second.signal);
    first.abort();
    await expect(a).rejects.toBe(first.signal.reason);
    resolve(42);
    await expect(b).resolves.toBe(42);
  });
});

describe("AVIF speculative request allowance", () => {
  it("reserves metadata ranges before dispatch and never exceeds image or group limits", async () => {
    const file = progressiveFile();
    const server = progressiveServer(file);
    const source = new AvifTileSource("https://images.test/budget.avif");
    const group = { remainingBytes: 100 };
    source.prefetchBudget = { remainingBytes: 200, group };
    await expect(
      source.open(new AbortController().signal)
    ).rejects.toBeInstanceOf(ImagePrefetchBudgetExceeded);
    expect(server.requests).toHaveLength(1);
    expect(group.remainingBytes).toBe(0);
    expect(source.prefetchBudget.remainingBytes).toBe(100);
    source.dispose();
  });
});

describe("AVIF fetch-local allowance", () => {
  it("captures a low budget before awaiting open even if another owner clears the source budget", async () => {
    const file = progressiveFile();
    const server = progressiveServer(file);
    const source = new AvifTileSource("https://images.test/scoped-low.avif");
    const signal = new AbortController().signal;
    await source.open(signal);
    const requests = server.requests.length;
    source.prefetchBudget = { remainingBytes: 0 };
    const pending = source.fetch([{ level: 1, col: 0, row: 0 }], signal, "low");
    source.prefetchBudget = undefined;
    await expect(pending).rejects.toBeInstanceOf(ImagePrefetchBudgetExceeded);
    expect(server.requests).toHaveLength(requests);
    source.dispose();
  });

  it("does not charge a source budget when the captured fetch context explicitly has none", async () => {
    const file = progressiveFile();
    const server = progressiveServer(file);
    const source = new AvifTileSource(
      "https://images.test/scoped-unlimited.avif"
    );
    const signal = new AbortController().signal;
    await source.open(signal);
    const budget = { remainingBytes: 0 };
    source.prefetchBudget = budget;
    await source.fetch(
      [{ level: 1, col: 0, row: 0 }],
      signal,
      "high",
      undefined,
      { prefetchBudget: undefined }
    );
    expect(source.hasBytes({ level: 1, col: 0, row: 0 })).toBe(true);
    expect(server.payloadsDispatched).toBeGreaterThan(0);
    expect(budget.remainingBytes).toBe(0);
    source.dispose();
  });
});

describe("AVIF UUID payload bounds", () => {
  it.each([2000, 20000])(
    "rejects a legacy UUID owning trailing tables without reading them (index at %s)",
    async (indexAt) => {
      const file = pyramidFile({ indexAt });
      // The deployed container's UUID can own both the fixed JSON region and
      // trailing cell tables. A coalesced 4128-byte read includes eight table bytes.
      new DataView(file.bytes.buffer).setUint32(
        file.pyramidAt,
        file.bytes.length - file.pyramidAt
      );
      serve(file.bytes);
      const source = new AvifTileSource(
        `https://images.test/uuid-tables-${indexAt}.avif`
      );
      await expect(
        source.open(new AbortController().signal)
      ).rejects.toBeInstanceOf(NativeAvifFormatError);
      expect(fetch).toHaveBeenCalledOnce();
      source.dispose();
    }
  );
});

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const sourceTile = (col: number) => ({ level: 1, col, row: 0 });

/** Real native AVIF metadata; configurable extent locations preserve the transport edge cases. */
const progressiveFile = (
  largeCell = false,
  adjacent = false,
  contiguous = false
) => {
  const seed = nativeFixture();
  const layout = parseNativeAvif(seed)!;
  const levelAt = 65536;
  const firstRanges: AvifRange[] = [
    layout.index.cells[0].ranges[0],
    { offset: levelAt + 12000, length: largeCell ? 5 * 1024 * 1024 + 17 : 4 },
    { offset: levelAt + (largeCell ? 6000000 : 24000), length: 3 },
    {
      offset: levelAt + (largeCell ? 6050000 : 36000),
      length: contiguous ? 128 * 1024 : 5,
    },
  ];
  const secondRanges: AvifRange[] = [
    layout.index.cells[1].ranges[0],
    {
      offset:
        firstRanges[1].offset + firstRanges[1].length + (adjacent ? 0 : 128),
      length: 4,
    },
    {
      offset:
        firstRanges[2].offset + firstRanges[2].length + (adjacent ? 0 : 128),
      length: 3,
    },
    {
      offset:
        firstRanges[3].offset +
        firstRanges[3].length +
        (contiguous || adjacent ? 0 : 128),
      length: contiguous ? 128 * 1024 : 5,
    },
  ];
  const bytes = new Uint8Array(
    Math.max(
      ...[...firstRanges, ...secondRanges].map((r) => r.offset + r.length)
    )
  );
  bytes.set(seed.subarray(0, layout.previewPrefixEnd));
  const v = new DataView(bytes.buffer);
  const iloc =
    bytes.findIndex(
      (_, at) => new TextDecoder().decode(bytes.subarray(at, at + 4)) === "iloc"
    ) - 4;
  // The checked-in native fixture uses version-0 iloc, 32-bit offset/length and no base offset.
  if (
    bytes[iloc + 8] !== 0 ||
    bytes[iloc + 12] !== 0x44 ||
    bytes[iloc + 13] !== 0
  )
    throw Error("Fixture iloc contract changed");
  let at = iloc + 16;
  for (let n = 0; n < v.getUint16(iloc + 14); n++) {
    const id = v.getUint16(at),
      count = v.getUint16(at + 4);
    at += 6;
    const ranges =
      id === layout.index.cells[0].id
        ? firstRanges
        : id === layout.index.cells[1].id
        ? secondRanges
        : undefined;
    if (ranges && count !== 4)
      throw Error("Fixture must have four physical AV1 layers");
    for (let k = 0; k < count; k++, at += 8)
      if (ranges) {
        v.setUint32(at, ranges[k].offset);
        v.setUint32(at + 4, ranges[k].length);
      }
  }
  // Payload decoding is deliberately stubbed; distinct bytes detect missing/reordered extents.
  [firstRanges, secondRanges].forEach((ranges, cell) =>
    ranges.forEach((range, layer) => {
      if (layer)
        bytes.fill(
          31 + cell * 4 + layer,
          range.offset,
          range.offset + range.length
        );
    })
  );
  const verified = parseNativeAvif(bytes)!;
  return {
    bytes,
    levelAt,
    firstRanges,
    secondRanges,
    bootstrapEnd: verified.previewPrefixEnd,
  };
};

const progressiveServer = (
  file: ReturnType<typeof progressiveFile>,
  options: {
    holdHeader?: boolean;
    holdPayload?: boolean;
    holdLast?: boolean;
    truncateLast?: boolean;
    payloadVersion?: string;
    singlePrefixBytes?: number;
    hideContentRange?: boolean;
  } = {}
) => {
  const headerGate = deferred(),
    payloadGate = deferred();
  const requests: AvifRange[][] = [];
  let headersDispatched = 0,
    payloadsDispatched = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: RequestInit) => {
      const rangeHeader = new Headers(init?.headers).get("Range");
      // Keep the explicit streaming-200 fallback fixture; enhancement ranges
      // below still exercise real 206/multipart validation.
      if (!rangeHeader || rangeHeader.startsWith("bytes=0-")) {
        headersDispatched++;
        requests.push([{ offset: 0, length: file.bootstrapEnd }]);
        if (options.holdHeader)
          await abortable(headerGate.promise, init!.signal as AbortSignal);
        return new Response(file.bytes.slice(0, file.bootstrapEnd), {
          status: 200,
          headers: {
            ETag: '"v1"',
            "Content-Length": String(file.bytes.length),
          },
        });
      }
      const ranges = rangeHeader
        .slice(6)
        .split(",")
        .map((part) => {
          const [start, end] = part.split("-").map(Number);
          return { offset: start, length: end - start + 1 };
        });
      requests.push(ranges);
      const payload = ranges.some((range) => range.offset > file.levelAt);
      const containsFinalSecondCell = (range: AvifRange) =>
        range.offset <= file.secondRanges[3].offset &&
        range.offset + range.length >=
          file.secondRanges[3].offset + file.secondRanges[3].length;
      if (payload) {
        payloadsDispatched++;
        if (options.holdPayload)
          await abortable(payloadGate.promise, init!.signal as AbortSignal);
      }
      const version = payload ? options.payloadVersion ?? '"v1"' : '"v1"';
      if (ranges.length === 1) {
        const range = ranges[0];
        const data = file.bytes.slice(
          range.offset,
          Math.min(file.bytes.length, range.offset + range.length)
        );
        if (
          options.holdLast &&
          containsFinalSecondCell(range) &&
          !options.singlePrefixBytes
        )
          await abortable(payloadGate.promise, init!.signal as AbortSignal);
        let phase = 0;
        const body =
          payload && options.singlePrefixBytes && containsFinalSecondCell(range)
            ? new ReadableStream<Uint8Array>({
                async pull(controller) {
                  if (phase++ === 0) {
                    controller.enqueue(
                      data.slice(0, options.singlePrefixBytes)
                    );
                    return;
                  }
                  try {
                    await abortable(
                      payloadGate.promise,
                      init!.signal as AbortSignal
                    );
                  } catch (error) {
                    controller.error(error);
                    return;
                  }
                  controller.enqueue(data.slice(options.singlePrefixBytes));
                  controller.close();
                },
              })
            : options.truncateLast && containsFinalSecondCell(range)
            ? data.slice(0, -1)
            : data;
        return new Response(body, {
          status: 206,
          headers: {
            ETag: version,
            "Content-Length": String(data.length),
            ...(options.hideContentRange
              ? {}
              : {
                  "Content-Range": `bytes ${range.offset}-${
                    range.offset + data.length - 1
                  }/${file.bytes.length}`,
                }),
          },
        });
      }
      let index = 0,
        atBody = false;
      return new Response(
        new ReadableStream<Uint8Array>({
          async pull(controller) {
            if (index === ranges.length) {
              controller.enqueue(encoder.encode("\r\n--source-boundary--\r\n"));
              controller.close();
              return;
            }
            const range = ranges[index];
            if (!atBody) {
              controller.enqueue(
                encoder.encode(
                  `${
                    index ? "\r\n" : ""
                  }--source-boundary\r\nContent-Type: image/avif\r\nContent-Range: bytes ${
                    range.offset
                  }-${range.offset + range.length - 1}/${
                    file.bytes.length
                  }\r\n\r\n`
                )
              );
              atBody = true;
              return;
            }
            if (options.holdLast && containsFinalSecondCell(range)) {
              try {
                await abortable(
                  payloadGate.promise,
                  init!.signal as AbortSignal
                );
              } catch (error) {
                controller.error(error);
                return;
              }
            }
            const data = file.bytes.slice(
              range.offset,
              range.offset + range.length
            );
            controller.enqueue(
              options.truncateLast && containsFinalSecondCell(range)
                ? data.slice(0, -1)
                : data
            );
            atBody = false;
            index++;
          },
        }),
        {
          status: 206,
          headers: {
            ETag: version,
            "Content-Type": "multipart/byteranges; boundary=source-boundary",
          },
        }
      );
    })
  );
  return {
    requests,
    headerGate,
    payloadGate,
    get headersDispatched() {
      return headersDispatched;
    },
    get payloadsDispatched() {
      return payloadsDispatched;
    },
  };
};

const expectedPayload = (
  file: ReturnType<typeof progressiveFile>,
  ranges: AvifRange[]
) => {
  const output = new Uint8Array(
    ranges.reduce((sum, range) => sum + range.length, 0)
  );
  let offset = 0;
  for (const range of ranges) {
    output.set(
      file.bytes.subarray(range.offset, range.offset + range.length),
      offset
    );
    offset += range.length;
  }
  return output;
};

const decodePayload = async (source: AvifTileSource, col: number) => {
  let decoded: Uint8Array | undefined;
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async (blob: Blob) => {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const parsed = parseAvifGridIndex(bytes);
      const range = parsed.primary.ranges[0];
      decoded = bytes.slice(range.offset, range.offset + range.length);
      return { close: vi.fn(), width: 512, height: 512 };
    })
  );
  await source.decode(sourceTile(col), new AbortController().signal);
  return decoded!;
};

describe("incremental AVIF source readiness", () => {
  it("decodes a complete multi-extent tile before its slow multipart sibling, with no header request at decode or repeat", async () => {
    const file = progressiveFile();
    const server = progressiveServer(file, { holdLast: true });
    const source = new AvifTileSource(
      "https://source-progress.test/first.avif"
    );
    const signal = new AbortController().signal;
    const ready: number[] = [];
    let complete = false;
    const fetch = source
      .fetch([sourceTile(0), sourceTile(1)], signal, "high", (tile) =>
        ready.push(tile.col)
      )
      .then(() => {
        complete = true;
      });
    try {
      await vi.waitFor(() => expect(ready).toEqual([0]));
      expect(complete).toBe(false);
      expect(source.hasBytes(sourceTile(0))).toBe(true);
      expect(source.hasBytes(sourceTile(1))).toBe(false);
      const count = server.requests.length;
      expect(await decodePayload(source, 0)).toEqual(
        expectedPayload(file, file.firstRanges)
      );
      expect(server.requests).toHaveLength(count);
      server.payloadGate.resolve();
      await fetch;
      expect(ready).toEqual([0, 1]);
      const finalCount = server.requests.length;
      await source.fetch([sourceTile(0), sourceTile(1)], signal);
      await decodePayload(source, 0);
      expect(server.requests).toHaveLength(finalCount);
    } finally {
      server.payloadGate.resolve();
      await fetch.catch(() => undefined);
      source.dispose();
    }
  });

  it("finishes native bootstrap before dispatching details or publishing ready tiles", async () => {
    const file = progressiveFile();
    const server = progressiveServer(file, { holdHeader: true });
    const source = new AvifTileSource("https://source-header.test/header.avif");
    const ready = vi.fn();
    const fetch = source.fetch(
      [sourceTile(0), sourceTile(1)],
      new AbortController().signal,
      "high",
      ready
    );
    try {
      await vi.waitFor(() => expect(server.headersDispatched).toBe(1));
      expect(server.payloadsDispatched).toBe(0);
      expect(ready).not.toHaveBeenCalled();
      expect(source.hasBytes(sourceTile(0))).toBe(false);
      server.headerGate.resolve();
      await fetch;
      expect(ready).toHaveBeenCalledTimes(2);
      expect(source.hasBytes(sourceTile(0))).toBe(true);
    } finally {
      server.headerGate.resolve();
      await fetch.catch(() => undefined);
      source.dispose();
    }
  });

  it("assembles a cell split across bounded requests plus a separate extent without gaps or early readiness", async () => {
    const file = progressiveFile(true);
    const server = progressiveServer(file);
    const source = new AvifTileSource("https://source-split.test/split.avif");
    const ready = vi.fn();
    try {
      await source.fetch(
        [sourceTile(0)],
        new AbortController().signal,
        "high",
        ready
      );
      expect(ready).toHaveBeenCalledTimes(1);
      const payload = await decodePayload(source, 0);
      expect(payload).toEqual(expectedPayload(file, file.firstRanges));
      expect(file.firstRanges[1].length).toBeGreaterThan(4 * 1024 * 1024);
      expect(
        server.requests.every(
          (ranges) =>
            ranges.reduce((n, range) => n + range.length, 0) <=
            (ranges.length === 1 ? 4 : 1) * 1024 * 1024
        )
      ).toBe(true);
    } finally {
      source.dispose();
    }
  });

  it("keeps persisted extents out of a request for an adjacent missing cell", async () => {
    const file = progressiveFile(false, true);
    const server = progressiveServer(file);
    const inventory = vi
      .spyOn(BoundedImageRangeCache.prototype, "knownRanges")
      .mockReturnValue({
        ranges: file.firstRanges,
        checkedAt: Date.now(),
        validUntil: Date.now() + 60000,
      });
    const cacheRead = vi
      .spyOn(BoundedImageRangeCache.prototype, "get")
      .mockImplementation(async (offset, length) =>
        file.firstRanges.some(
          (range) => range.offset === offset && range.length === length
        )
          ? file.bytes.slice(offset, offset + length)
          : undefined
      );
    const source = new AvifTileSource(
      "https://source-persisted.test/adjacent.avif"
    );
    try {
      await source.fetch(
        [sourceTile(0), sourceTile(1)],
        new AbortController().signal
      );
      expect(source.hasBytes(sourceTile(0))).toBe(true);
      expect(source.hasBytes(sourceTile(1))).toBe(true);
      const payloadRanges = server.requests
        .flat()
        .filter((range) => range.offset > file.levelAt);
      expect(payloadRanges).toEqual(file.secondRanges.slice(1));
      expect(await decodePayload(source, 0)).toEqual(
        expectedPayload(file, file.firstRanges)
      );
    } finally {
      source.dispose();
      cacheRead.mockRestore();
      inventory.mockRestore();
    }
  });

  it("rejects a truncated multipart cell without releasing it", async () => {
    const file = progressiveFile();
    progressiveServer(file, { truncateLast: true });
    const source = new AvifTileSource(
      "https://source-malformed.test/truncated.avif"
    );
    const ready: number[] = [];
    try {
      await expect(
        source.fetch(
          [sourceTile(0), sourceTile(1)],
          new AbortController().signal,
          "high",
          (tile) => ready.push(tile.col)
        )
      ).rejects.toThrow();
      expect(ready).not.toContain(1);
      expect(source.hasBytes(sourceTile(1))).toBe(false);
    } finally {
      source.dispose();
    }
  });

  it("rejects changed-version payloads and invalidates previously complete cells", async () => {
    const file = progressiveFile();
    const options = { payloadVersion: '"v1"' };
    progressiveServer(file, options);
    const source = new AvifTileSource(
      "https://source-version.test/changed.avif"
    );
    const ready = vi.fn();
    try {
      await source.fetch([sourceTile(0)], new AbortController().signal);
      expect(source.hasBytes(sourceTile(0))).toBe(true);
      options.payloadVersion = '"v2"';
      await expect(
        source.fetch(
          [sourceTile(1)],
          new AbortController().signal,
          "high",
          ready
        )
      ).rejects.toThrow("AVIF asset changed");
      expect(ready).not.toHaveBeenCalled();
      expect(source.hasBytes(sourceTile(0))).toBe(false);
      expect(source.hasBytes(sourceTile(1))).toBe(false);
      await expect(source.open(new AbortController().signal)).rejects.toThrow(
        "AVIF asset changed"
      );
    } finally {
      source.dispose();
    }
  });

  it("aborts one caller without duplicate fetches or late callbacks while another caller shares the pending cells", async () => {
    const file = progressiveFile();
    const server = progressiveServer(file, { holdLast: true });
    const source = new AvifTileSource(
      "https://source-consumer-abort.test/shared.avif"
    );
    const first = new AbortController();
    const ready = vi.fn();
    const old = source.fetch(
      [sourceTile(0), sourceTile(1)],
      first.signal,
      "high",
      ready
    );
    const observedOld = old.catch((error) => error);
    try {
      await vi.waitFor(() => expect(ready).toHaveBeenCalledTimes(1));
      const requestCount = server.requests.length;
      first.abort();
      const sharedReady = vi.fn();
      const shared = source.fetch(
        [sourceTile(0), sourceTile(1)],
        new AbortController().signal,
        "high",
        sharedReady
      );
      server.payloadGate.resolve();
      await shared;
      expect((await observedOld).name).toBe("AbortError");
      expect(ready).toHaveBeenCalledTimes(1);
      expect(sharedReady).toHaveBeenCalledTimes(2);
      expect(server.requests).toHaveLength(requestCount);
    } finally {
      server.payloadGate.resolve();
      await observedOld;
      source.dispose();
    }
  });

  it.each([false, true])(
    "allows immediate pause/resume with decoder retention %s without inheriting an aborted tile batch",
    async (retainDecoders) => {
      const file = progressiveFile();
      const server = progressiveServer(file, {
        holdPayload: true,
        holdLast: true,
      });
      const source = new AvifTileSource(
        "https://source-resume.test/resume.avif"
      );
      const signal = new AbortController().signal;
      const oldReady = vi.fn();
      const old = source.fetch(
        [sourceTile(0), sourceTile(1)],
        signal,
        "low",
        oldReady
      );
      const observedOld = old.catch((error) => error);
      const trim = vi.spyOn(NativeAvifCellDecoders.prototype, "trimTo");
      try {
        await vi.waitFor(() =>
          expect(server.payloadsDispatched).toBeGreaterThan(0)
        );
        source.pause({ retainDecoders });
        if (retainDecoders) expect(trim).not.toHaveBeenCalled();
        else expect(trim).toHaveBeenCalledWith(0);
        const ready = vi.fn();
        const resumed = source.fetch(
          [sourceTile(0), sourceTile(1)],
          signal,
          "high",
          ready
        );
        server.headerGate.resolve();
        server.payloadGate.resolve();
        await resumed;
        expect((await observedOld).name).toBe("AbortError");
        expect(oldReady).not.toHaveBeenCalled();
        expect(ready).toHaveBeenCalledTimes(2);
        expect(source.hasBytes(sourceTile(1))).toBe(true);
      } finally {
        server.headerGate.resolve();
        server.payloadGate.resolve();
        await observedOld;
        source.dispose();
        trim.mockRestore();
      }
    }
  );
});

describe("contiguous single-range AVIF readiness", () => {
  it.each([false, true])(
    "releases complete prefix cells before the suffix while persisting only the complete response (hidden Content-Range: %s)",
    async (hideContentRange) => {
      const file = progressiveFile(false, false, true);
      const server = progressiveServer(file, {
        singlePrefixBytes: file.firstRanges[3].length,
        hideContentRange,
      });
      const put = vi
        .spyOn(BoundedImageRangeCache.prototype, "put")
        .mockResolvedValue(undefined);
      const source = new AvifTileSource(
        `https://single-progress-${hideContentRange}.test/a.avif`
      );
      const ready: number[] = [];
      let finished = false;
      const pending = source
        .fetch(
          [sourceTile(0), sourceTile(1)],
          new AbortController().signal,
          "high",
          (tile) => ready.push(tile.col)
        )
        .then(() => {
          finished = true;
        });
      try {
        await vi.waitFor(() => expect(ready).toEqual([0]));
        expect(finished).toBe(false);
        expect(source.hasBytes(sourceTile(0))).toBe(true);
        expect(source.hasBytes(sourceTile(1))).toBe(false);
        expect(
          put.mock.calls.filter(
            ([offset]) => offset >= file.firstRanges[3].offset
          )
        ).toHaveLength(0);
        const requestCount = server.requests.length;
        const bytes = await decodePayload(source, 0);
        expect(bytes).toEqual(expectedPayload(file, file.firstRanges));
        expect(file.firstRanges[3].length).toBe(128 * 1024);
        expect(server.requests).toHaveLength(requestCount);
        server.payloadGate.resolve();
        await pending;
        expect(ready).toEqual([0, 1]);
        const persisted = put.mock.calls.filter(
          ([offset]) => offset >= file.firstRanges[3].offset
        );
        expect(persisted).toHaveLength(1);
        expect(persisted[0][0]).toBe(file.firstRanges[3].offset);
        expect(persisted[0][1].length).toBe(256 * 1024);
      } finally {
        server.payloadGate.resolve();
        await pending.catch(() => undefined);
        source.dispose();
        put.mockRestore();
      }
    }
  );

  it("waits for front metadata before streaming the complete first cell", async () => {
    const file = progressiveFile(false, false, true);
    const server = progressiveServer(file, {
      singlePrefixBytes: file.firstRanges[3].length,
      holdHeader: true,
    });
    const source = new AvifTileSource(
      "https://single-header-progress.test/a.avif"
    );
    const ready: number[] = [];
    const pending = source.fetch(
      [sourceTile(0), sourceTile(1)],
      new AbortController().signal,
      "high",
      (tile) => ready.push(tile.col)
    );
    try {
      await vi.waitFor(() => expect(server.headersDispatched).toBe(1));
      expect(server.payloadsDispatched).toBe(0);
      expect(ready).toEqual([]);
      expect(source.hasBytes(sourceTile(0))).toBe(false);
      server.headerGate.resolve();
      await vi.waitFor(() => expect(ready).toEqual([0]));
      expect(source.hasBytes(sourceTile(1))).toBe(false);
      server.payloadGate.resolve();
      await pending;
      expect(ready).toEqual([0, 1]);
    } finally {
      server.headerGate.resolve();
      server.payloadGate.resolve();
      await pending.catch(() => undefined);
      source.dispose();
    }
  });

  it("dispatches a known-uncached header before detail payloads without deferring through storage", async () => {
    const file = progressiveFile();
    const server = progressiveServer(file);
    const inventory = vi
      .spyOn(BoundedImageRangeCache.prototype, "knownRanges")
      .mockReturnValue({
        ranges: [],
        checkedAt: Date.now(),
        validUntil: Date.now() + 60000,
      });
    const cacheRead = vi
      .spyOn(BoundedImageRangeCache.prototype, "get")
      .mockResolvedValue(undefined);
    const source = new AvifTileSource(
      "https://known-miss-priority.test/a.avif"
    );
    try {
      await source.fetch(
        [sourceTile(0), sourceTile(1)],
        new AbortController().signal
      );
      expect(cacheRead).not.toHaveBeenCalled();
      const headerAt = server.requests.findIndex((ranges) =>
        ranges.some((range) => range.offset === 0)
      );
      const detailAt = server.requests.findIndex((ranges) =>
        ranges.some((range) => range.offset > file.levelAt)
      );
      expect(headerAt).toBeGreaterThanOrEqual(0);
      expect(detailAt).toBeGreaterThan(headerAt);
    } finally {
      source.dispose();
      cacheRead.mockRestore();
      inventory.mockRestore();
    }
  });
});
