import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseNativeAvif } from "../core/avif-native-convention";
import { makeAvifTile } from "../core/avif-grid-index";
import { AvifTileSource } from "./avif-tile-source";
import { NativeAvifFormatError } from "./avif-source-errors";
import {
  getRegisteredNativeAvif,
  registerNativeAvifBlob,
} from "./native-avif-byte-source";
const fixture = () =>
  Uint8Array.from(
    readFileSync(
      new URL(
        "../core/__fixtures__/native-four-two-cells.avif",
        import.meta.url
      )
    )
  );
const leases: (() => void)[] = [],
  readers: AvifTileSource[] = [];
const signal = () => new AbortController().signal;
const create = (data = fixture()) => {
  const url = `https://images.test/native-${leases.length}.avif`;
  leases.push(registerNativeAvifBlob(url, new Blob([data])));
  const reader = new AvifTileSource(url);
  readers.push(reader);
  return reader;
};
afterEach(() => {
  readers.splice(0).forEach((r) => r.dispose());
  leases.splice(0).forEach((r) => r());
  vi.unstubAllGlobals();
});
describe("native AVIF tile-reader contract", () => {
  it("does not start a source for a caller that already canceled", async () => {
    const network = vi.fn();
    vi.stubGlobal("fetch", network);
    const reader = new AvifTileSource(
      "https://images.test/already-canceled.avif"
    );
    readers.push(reader);
    const controller = new AbortController();
    controller.abort();
    await expect(reader.open(controller.signal)).rejects.toBe(
      controller.signal.reason
    );
    expect(network).not.toHaveBeenCalled();
    expect(reader.requestCount).toBe(0);
  });

  it("opens L1-L4 and loads native cells without another source or HTTP request", async () => {
    const network = vi.fn();
    vi.stubGlobal("fetch", network);
    const reader = create(),
      metadata = await reader.open(signal());
    expect(metadata.levels.map((l) => l.level)).toEqual([1, 2, 3, 4]);
    expect(metadata.levels.map((l) => l.nativeScale)).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 4, y: 4 },
      { x: 8, y: 8 },
    ]);
    expect(await reader.open(signal())).toBe(metadata);
    const tile = { level: 4, col: 0, row: 0 },
      ready = vi.fn();
    await reader.fetch([tile], signal(), "high", ready);
    expect(reader.hasBytes(tile)).toBe(true);
    expect(ready).toHaveBeenCalledWith(tile);
    expect(network).not.toHaveBeenCalled();
  });
  it("releases the view while preserving a borrowed native file", async () => {
    const reader = create();
    await reader.open(signal());
    const native = getRegisteredNativeAvif(reader.url)!;
    reader.dispose();
    expect((await native.open(signal())).layout.levels.size).toBe(4);
  });
  it("rejects a single-level AVIF instead of opening an independent pyramid fallback", async () => {
    const data = fixture(),
      layout = parseNativeAvif(data)!,
      index = layout.levels.get(4)!,
      cell = index.cells[0],
      range = cell.ranges[0];
    const reader = create(
      makeAvifTile(
        index,
        cell,
        data.slice(range.offset, range.offset + range.length)
      )
    );
    await expect(reader.open(signal())).rejects.toBeInstanceOf(
      NativeAvifFormatError
    );
  });
  it("drops fine duplicate bytes and rehydrates the same cell from its retained native source", async () => {
    const reader = create(),
      tile = { level: 1, col: 0, row: 0 };
    await reader.fetch([tile], signal());
    const before = reader.compressedBytes;
    reader.trimCompressedTo(0);
    expect(reader.hasBytes(tile)).toBe(false);
    expect(reader.compressedBytes).toBeLessThan(before);
    await reader.fetch([tile], signal());
    expect(reader.hasBytes(tile)).toBe(true);
  });
  it("retains metadata across pause and rejects use after disposal", async () => {
    const reader = create(),
      metadata = await reader.open(signal());
    reader.pause();
    expect(await reader.open(signal())).toBe(metadata);
    reader.dispose();
    await expect(reader.open(signal())).rejects.toBeDefined();
  });
});
