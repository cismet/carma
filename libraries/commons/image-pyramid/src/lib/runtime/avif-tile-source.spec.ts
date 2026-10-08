import { afterEach, describe, expect, it, vi } from "vitest";
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

describe("abortable shared AVIF work", () => {
  it("observes shared rejection even when the caller is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const work = Promise.reject(new Error("underlying request also aborted"));
    const then = vi.spyOn(work, "then");
    await expect(abortable(work, controller.signal)).rejects.toBe(controller.signal.reason);
    const observed = then.mock.calls.some(([, rejection]) => typeof rejection === "function");
    // Always consume fixture rejection, so failure identifies the missing observer
    // rather than creating unrelated unhandled-rejection noise in the test runner.
    await work.catch(() => undefined);
    expect(observed).toBe(true);
  });

  it("lets one aborted consumer stop waiting while shared work still completes", async () => {
    const first = new AbortController(), second = new AbortController();
    let resolve!: (value: number) => void;
    const work = new Promise<number>((done) => { resolve = done; });
    const a = abortable(work, first.signal), b = abortable(work, second.signal);
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
    await expect(source.open(new AbortController().signal)).rejects.toBeInstanceOf(ImagePrefetchBudgetExceeded);
    expect(ranges).toEqual(["bytes=0-16383"]);
    expect(group.remainingBytes).toBe(18000 - 16384);
    expect(source.prefetchBudget.remainingBytes).toBe(20000 - 16384);
    source.dispose();
  });
});


describe("AVIF UUID payload bounds", () => {
  it.each([2000, 20000])("does not parse cell-table bytes after the 4096-byte JSON reservation (index at %s)", async (indexAt) => {
    const file = pyramidFile({ indexAt });
    // The deployed container's UUID can own both the fixed JSON region and
    // trailing cell tables. A coalesced 4128-byte read includes eight table bytes.
    new DataView(file.bytes.buffer).setUint32(file.pyramidAt, file.bytes.length - file.pyramidAt);
    serve(file.bytes);
    const source = new AvifTileSource(`https://images.test/uuid-tables-${indexAt}.avif`);
    const result = await source.open(new AbortController().signal);
    expect(result.native).toEqual({ width: 1024, height: 1024 });
    expect(result.levels).toHaveLength(1);
    source.dispose();
  });
});
