import { afterEach, describe, expect, it, vi } from "vitest";
import {
  makeAvifTile,
  parseAvifGridIndex,
  type AvifGridIndex,
  type AvifRange,
} from "../core/avif-grid-index";
import { BoundedImageRangeCache } from "./bounded-image-range-cache";
import { ImagePrefetchBudgetExceeded } from "./image-tile-source";
import { AvifTileSource, abortable } from "./avif-tile-source";

const PYRAMID_UUID = "9264b9097b6840af91dcb95a8d3a1b80";
const encoder = new TextEncoder();

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

/** Spread metadata past the merge-gap threshold so omitted level requests are observable. */
const multilevelFile = (fineHeadersOnly = false) => {
  const seed = pyramidFile({ indexAt: 20000 });
  const bytes = new Uint8Array(1_110_000);
  bytes.set(seed.bytes);
  const tables: { offset: number; length: number }[] = [];
  const levels: Record<string, unknown> = {};
  for (let level = 0; level <= 6; level++) {
    const offset = 1_100_000 + level * 100;
    const table = encoder.encode(
      JSON.stringify({
        level,
        tileEdge: 512,
        cells: [
          {
            x: 0,
            y: 0,
            itemId: 1,
            ranges: [{ offset: offset + 32, length: 8 }],
          },
        ],
      })
    );
    const cellsIndex = { offset: (level + 1) * 131072, length: table.length };
    tables.push(cellsIndex);
    bytes.set(table, cellsIndex.offset);
    levels[level] = {
      offset,
      length: 64,
      width: 1024 / 2 ** level,
      height: 1024 / 2 ** level,
      ...(fineHeadersOnly && level < 3 ? {} : { cellsIndex }),
    };
  }
  bytes.fill(0, seed.pyramidAt + 24, seed.pyramidAt + 24 + 4096);
  bytes.set(
    encoder.encode(
      JSON.stringify({
        schema: 1,
        format: "avif-independent-pyramid",
        baseLevel: 0,
        sourceSensorDimensions: [1024, 1024],
        levels,
      })
    ),
    seed.pyramidAt + 24
  );
  return { bytes, tables, pyramidAt: seed.pyramidAt };
};

const serve = (bytes: Uint8Array) => {
  const ranges: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: RequestInit) => {
      const range = new Headers(init?.headers).get("Range")!;
      ranges.push(range);
      const [start, end] = range.slice(6).split("-").map(Number);
      return new Response(bytes.slice(start, Math.min(end + 1, bytes.length)), {
        status: 206,
        headers: { "Last-Modified": "Thu, 08 Oct 2026 10:00:00 GMT" },
      });
    })
  );
  return ranges;
};

afterEach(() => vi.unstubAllGlobals());

describe("AVIF pyramid metadata reads", () => {
  it("reads an index box beyond the head together with its box header", async () => {
    const file = pyramidFile({ indexAt: 20000 });
    const ranges = serve(file.bytes);
    const source = new AvifTileSource("https://images.test/far.avif");
    const pyramid = await source.open(new AbortController().signal);
    expect(pyramid.levels.map((level) => level.level)).toEqual([1]);
    expect(ranges).toEqual([
      "bytes=0-16383",
      `bytes=${file.pyramidAt}-${file.pyramidAt + 32 + 4096 - 1}`,
      `bytes=${file.tableAt}-${file.tableAt + file.tableLength - 1}`,
    ]);
    source.dispose();
  });

  it("skips a foreign uuid box and keeps scanning for the pyramid index", async () => {
    const file = pyramidFile({ indexAt: 20000, foreignUuid: true });
    const ranges = serve(file.bytes);
    const source = new AvifTileSource("https://images.test/foreign.avif");
    const pyramid = await source.open(new AbortController().signal);
    expect(pyramid.native).toEqual({ width: 1024, height: 1024 });
    expect(ranges).toEqual([
      "bytes=0-16383",
      `bytes=20000-${20000 + 32 + 4096 - 1}`,
      `bytes=${file.pyramidAt}-${file.pyramidAt + 32 + 4096 - 1}`,
      `bytes=${file.tableAt}-${file.tableAt + file.tableLength - 1}`,
    ]);
    source.dispose();
  });

  it("needs no index request when the head already holds it", async () => {
    const file = pyramidFile({ indexAt: 2000 });
    const ranges = serve(file.bytes);
    const source = new AvifTileSource("https://images.test/near.avif");
    await source.open(new AbortController().signal);
    expect(ranges).toEqual([
      "bytes=0-16383",
      `bytes=${file.tableAt}-${file.tableAt + file.tableLength - 1}`,
    ]);
    source.dispose();
  });
});

describe("AVIF source-local allowed levels", () => {
  it.each([false, true])(
    "does not request fine-level cell tables or headers (legacy headers: %s)",
    async (fineHeadersOnly) => {
      const file = multilevelFile(fineHeadersOnly);
      const ranges = serve(file.bytes);
      const source = new AvifTileSource(
        `https://images.test/coarse-${fineHeadersOnly}.avif`,
        { allowedLevels: [3, 4, 5, 6] }
      );
      try {
        const pyramid = await source.open(new AbortController().signal);
        expect(pyramid.native).toEqual({ width: 1024, height: 1024 });
        expect(pyramid.levels.map((level) => level.level)).toEqual([
          3, 4, 5, 6,
        ]);
        expect(ranges).toEqual([
          "bytes=0-16383",
          `bytes=${file.pyramidAt}-${file.pyramidAt + 32 + 4096 - 1}`,
          ...file.tables
            .slice(3)
            .map(
              (table) =>
                `bytes=${table.offset}-${table.offset + table.length - 1}`
            ),
        ]);
      } finally {
        source.dispose();
      }
    }
  );
  it("keeps all levels available to an unrestricted source of the same URL", async () => {
    const file = multilevelFile();
    const ranges = serve(file.bytes);
    const url = "https://images.test/shared-full-and-coarse.avif";
    const coarse = new AvifTileSource(url, { allowedLevels: [3, 4, 5, 6] });
    const full = new AvifTileSource(url);
    try {
      expect(
        (await coarse.open(new AbortController().signal)).levels.map(
          (level) => level.level
        )
      ).toEqual([3, 4, 5, 6]);
      const start = ranges.length;
      expect(
        (await full.open(new AbortController().signal)).levels.map(
          (level) => level.level
        )
      ).toEqual([0, 1, 2, 3, 4, 5, 6]);
      expect(ranges.slice(start)).toEqual([
        "bytes=0-16383",
        `bytes=${file.pyramidAt}-${file.pyramidAt + 32 + 4096 - 1}`,
        ...file.tables.map(
          (table) => `bytes=${table.offset}-${table.offset + table.length - 1}`
        ),
      ]);
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
    const file = pyramidFile({ indexAt: 20000 });
    const ranges = serve(file.bytes);
    const source = new AvifTileSource("https://images.test/budget.avif");
    const group = { remainingBytes: 18000 };
    source.prefetchBudget = { remainingBytes: 20000, group };
    await expect(
      source.open(new AbortController().signal)
    ).rejects.toBeInstanceOf(ImagePrefetchBudgetExceeded);
    expect(ranges).toEqual(["bytes=0-16383"]);
    expect(group.remainingBytes).toBe(18000 - 16384);
    expect(source.prefetchBudget.remainingBytes).toBe(20000 - 16384);
    source.dispose();
  });
});

describe("AVIF UUID payload bounds", () => {
  it.each([2000, 20000])(
    "does not parse cell-table bytes after the 4096-byte JSON reservation (index at %s)",
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
      const result = await source.open(new AbortController().signal);
      expect(result.native).toEqual({ width: 1024, height: 1024 });
      expect(result.levels).toHaveLength(1);
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

/** Real ISO-BMFF metadata, synthetic compressed cells; bitmap decoding is stubbed. */
const progressiveFile = (
  largeCell = false,
  adjacent = false,
  contiguous = false
) => {
  const seed = pyramidFile({ indexAt: 2000 });
  const levelAt = 65536;
  const firstRanges = contiguous
    ? [{ offset: levelAt + 12000, length: 128 * 1024 }]
    : largeCell
    ? [
        { offset: levelAt + 12000, length: 5 * 1024 * 1024 + 17 },
        { offset: levelAt + 6000000, length: 5 },
      ]
    : [
        { offset: levelAt + 12000, length: 4 },
        { offset: levelAt + 24000, length: 3 },
      ];
  const secondRanges = [
    {
      offset: contiguous
        ? firstRanges[0].offset + firstRanges[0].length
        : adjacent
        ? firstRanges[1].offset + firstRanges[1].length
        : levelAt + (largeCell ? 6100000 : 1500000),
      length: contiguous ? 128 * 1024 : 4,
    },
  ];
  const levelLength = largeCell ? 6200000 : 1600000;
  const bytes = new Uint8Array(levelAt + levelLength);
  bytes.set(seed.bytes);
  const ispe = new Uint8Array(20);
  const ispeView = new DataView(ispe.buffer);
  ispeView.setUint32(0, 20);
  ispe.set(encoder.encode("ispe"), 4);
  ispeView.setUint32(12, 1024);
  ispeView.setUint32(16, 512);
  const item = {
    id: 1,
    ranges: [],
    properties: [{ type: "ispe", essential: true, bytes: [...ispe] }],
  };
  const header = makeAvifTile(
    {
      ftyp: [...seed.bytes.slice(0, 24)],
      primary: item,
      cells: [],
      primaryId: 1,
      dimensions: { width: 1024, height: 512 },
      metadataBytes: 0,
    } as AvifGridIndex,
    item,
    new Uint8Array([0])
  );
  bytes.set(header, levelAt);
  const table = encoder.encode(
    JSON.stringify({
      level: 1,
      tileEdge: 512,
      cells: [firstRanges, secondRanges].map((ranges, x) => ({
        x,
        y: 0,
        itemId: 1,
        ranges,
      })),
    })
  );
  bytes.set(table, seed.tableAt);
  bytes.fill(0, seed.pyramidAt + 24, seed.pyramidAt + 24 + 4096);
  bytes.set(
    encoder.encode(
      JSON.stringify({
        schema: 1,
        format: "avif-independent-pyramid",
        baseLevel: 1,
        sourceSensorDimensions: [2048, 1024],
        levels: {
          1: {
            offset: levelAt,
            length: levelLength,
            width: 1024,
            height: 512,
            cellsIndex: { offset: seed.tableAt, length: table.length },
          },
        },
      })
    ),
    seed.pyramidAt + 24
  );
  [...firstRanges, ...secondRanges].forEach((range, index) =>
    bytes.fill(index + 31, range.offset, range.offset + range.length)
  );
  return { bytes, levelAt, firstRanges, secondRanges };
};

const progressiveServer = (
  file: ReturnType<typeof progressiveFile>,
  options: {
    holdHeader?: boolean;
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
      const ranges = new Headers(init?.headers)
        .get("Range")!
        .slice(6)
        .split(",")
        .map((part) => {
          const [start, end] = part.split("-").map(Number);
          return { offset: start, length: end - start + 1 };
        });
      requests.push(ranges);
      const header = ranges.length === 1 && ranges[0].offset === file.levelAt;
      const payload = ranges.some((range) => range.offset > file.levelAt);
      if (header) {
        headersDispatched++;
        if (options.holdHeader)
          await abortable(headerGate.promise, init!.signal as AbortSignal);
      }
      if (payload) payloadsDispatched++;
      const version = payload ? options.payloadVersion ?? '"v1"' : '"v1"';
      if (ranges.length === 1) {
        const range = ranges[0];
        const data = file.bytes.slice(
          range.offset,
          Math.min(file.bytes.length, range.offset + range.length)
        );
        let phase = 0;
        const body =
          payload && options.singlePrefixBytes
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
            if (index === ranges.length - 1 && options.holdLast) {
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
              options.truncateLast && index === ranges.length - 1
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
      expect([...(await decodePayload(source, 0))]).toEqual([
        31, 31, 31, 31, 32, 32, 32,
      ]);
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

  it("dispatches header and payload concurrently but publishes no ready tile until the header is local", async () => {
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
      await vi.waitFor(() =>
        expect(server.payloadsDispatched).toBeGreaterThan(0)
      );
      await vi.waitFor(() => expect(source.compressedBytes).toBe(11));
      expect(server.headersDispatched).toBe(1);
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
      expect(payload.length).toBe(5 * 1024 * 1024 + 22);
      expect(
        payload.slice(0, 5 * 1024 * 1024 + 17).every((value) => value === 31)
      ).toBe(true);
      expect([...payload.slice(-5)]).toEqual([32, 32, 32, 32, 32]);
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
      expect(payloadRanges).toEqual(file.secondRanges);
      expect([...(await decodePayload(source, 0))]).toEqual([
        31, 31, 31, 31, 32, 32, 32,
      ]);
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

  it("allows immediate pause/resume without inheriting an aborted header or tile batch", async () => {
    const file = progressiveFile();
    const server = progressiveServer(file, {
      holdHeader: true,
      holdLast: true,
    });
    const source = new AvifTileSource("https://source-resume.test/resume.avif");
    const signal = new AbortController().signal;
    const oldReady = vi.fn();
    const old = source.fetch(
      [sourceTile(0), sourceTile(1)],
      signal,
      "low",
      oldReady
    );
    const observedOld = old.catch((error) => error);
    try {
      await vi.waitFor(() =>
        expect(server.payloadsDispatched).toBeGreaterThan(0)
      );
      source.pause();
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
    }
  });
});

describe("contiguous single-range AVIF readiness", () => {
  it.each([false, true])(
    "releases complete prefix cells before the suffix while persisting only the complete response (hidden Content-Range: %s)",
    async (hideContentRange) => {
      const file = progressiveFile(false, false, true);
      const server = progressiveServer(file, {
        singlePrefixBytes: file.firstRanges[0].length,
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
          put.mock.calls.filter(([offset]) => offset > file.levelAt)
        ).toHaveLength(0);
        const requestCount = server.requests.length;
        const bytes = await decodePayload(source, 0);
        expect(bytes.length).toBe(128 * 1024);
        expect(bytes.every((value) => value === 31)).toBe(true);
        expect(server.requests).toHaveLength(requestCount);
        server.payloadGate.resolve();
        await pending;
        expect(ready).toEqual([0, 1]);
        const persisted = put.mock.calls.filter(
          ([offset]) => offset > file.levelAt
        );
        expect(persisted).toHaveLength(1);
        expect(persisted[0][0]).toBe(file.firstRanges[0].offset);
        expect(persisted[0][1].length).toBe(256 * 1024);
      } finally {
        server.payloadGate.resolve();
        await pending.catch(() => undefined);
        source.dispose();
        put.mockRestore();
      }
    }
  );

  it("holds a complete streamed cell until its parallel header is ready", async () => {
    const file = progressiveFile(false, false, true);
    const server = progressiveServer(file, {
      singlePrefixBytes: file.firstRanges[0].length,
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
      await vi.waitFor(() => expect(source.compressedBytes).toBe(128 * 1024));
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
        ranges.some((range) => range.offset === file.levelAt)
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
