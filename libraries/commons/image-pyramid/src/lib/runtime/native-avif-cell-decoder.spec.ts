import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AvifGridIndex, AvifItem } from "../core/avif-grid-index";
import { NativeAvifCellDecoders } from "./native-avif-cell-decoder";

const ispe = new Uint8Array(20);
new DataView(ispe.buffer).setUint32(0, 20);
ispe.set([105, 115, 112, 101], 4);
new DataView(ispe.buffer).setUint32(12, 512);
new DataView(ispe.buffer).setUint32(16, 512);
const cell: AvifItem = {
  id: 7,
  ranges: [1, 2, 3, 4].map((length, index) => ({ offset: index * 10, length })),
  properties: [{ type: "ispe", bytes: [...ispe], essential: false }],
};
const index = { ftyp: [0, 0, 0, 8, 102, 116, 121, 112] } as AvifGridIndex;
const size = { width: 64, height: 64 };
const signal = () => new AbortController().signal;
const bitmap = (width = 64, height = 64) =>
  ({ width, height, close: vi.fn() } as unknown as ImageBitmap);
const frames: { close: ReturnType<typeof vi.fn> }[] = [];
const instances: Decoder[] = [];
let hold: (() => Promise<void>) | undefined;
let frameSize: (supplied: number) => number = () => 512;
class Decoder {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  chunks: Uint8Array[] = [];
  supplied = 0;
  first = true;
  close = vi.fn();
  constructor(options: { data: ReadableStream<Uint8Array> }) {
    this.reader = options.data.getReader();
    instances.push(this);
  }
  async decode() {
    if (this.first) {
      this.chunks.push((await this.reader.read()).value!);
      this.first = false;
    }
    const chunk = (await this.reader.read()).value!;
    this.chunks.push(chunk);
    this.supplied += chunk.byteLength;
    await hold?.();
    const edge = frameSize(this.supplied);
    const image = { displayWidth: edge, displayHeight: edge, close: vi.fn() };
    frames.push(image);
    return { image, complete: this.supplied === 10 };
  }
}
beforeEach(() => {
  instances.length = 0;
  frames.length = 0;
  hold = undefined;
  frameSize = () => 512;
  vi.stubGlobal("ImageDecoder", Decoder);
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async (_frame, options) =>
      bitmap(options?.resizeWidth, options?.resizeHeight)
    )
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("NativeAvifCellDecoders", () => {
  it("appends only missing prefixes through one decoder and releases its final frame", async () => {
    const pool = new NativeAvifCellDecoders();
    const fallback = vi.fn(async () => bitmap());
    const payload = Uint8Array.from({ length: 10 }, (_, n) => n);
    for (const length of [1, 3, 6, 10]) {
      const image = await pool.decode(
        index,
        cell,
        payload.slice(0, length),
        size,
        signal(),
        fallback,
        length !== 10
      );
      expect(image.width).toBe(64);
      image.close();
    }
    expect(instances).toHaveLength(1);
    expect(instances[0].chunks.slice(1).map((chunk) => [...chunk])).toEqual([
      [0],
      [1, 2],
      [3, 4, 5],
      [6, 7, 8, 9],
    ]);
    expect(fallback).not.toHaveBeenCalled();
    expect(frames.every((frame) => frame.close.mock.calls.length === 1)).toBe(
      true
    );
    expect(instances[0].close).toHaveBeenCalledOnce();
    expect(pool.workingBytes).toBe(0);
  });
  it("advances skipped layer boundaries without publishing intermediate generations", async () => {
    const pool = new NativeAvifCellDecoders();
    const fallback = vi.fn(async () => bitmap());
    const payload = Uint8Array.from({ length: 10 }, (_, n) => n);
    const image = await pool.decode(
      index,
      cell,
      payload.slice(0, 6),
      { width: 256, height: 256 },
      signal(),
      fallback,
      true
    );
    expect(image.width).toBe(256);
    expect(instances).toHaveLength(1);
    expect(instances[0].chunks.slice(1).map((chunk) => [...chunk])).toEqual([
      [0],
      [1, 2],
      [3, 4, 5],
    ]);
    expect(frames).toHaveLength(3);
    expect(createImageBitmap).toHaveBeenCalledOnce();
    expect(createImageBitmap).toHaveBeenCalledWith(
      frames[2],
      expect.objectContaining({ resizeWidth: 256 })
    );
    expect(
      frames.slice(0, 2).every((frame) => frame.close.mock.calls.length === 1)
    ).toBe(true);
    image.close();
    (
      await pool.decode(
        index,
        cell,
        payload,
        { width: 512, height: 512 },
        signal(),
        fallback
      )
    ).close();
    expect(instances).toHaveLength(1);
    expect(instances[0].chunks[4]).toEqual(payload.slice(6));
    expect(fallback).not.toHaveBeenCalled();
    expect(pool.workingBytes).toBe(0);
  });
  it("keeps caller bytes immutable and counts full-cell scratch separately from level pixels", async () => {
    const pool = new NativeAvifCellDecoders();
    const payload = Uint8Array.of(11);
    await pool.decode(
      index,
      cell,
      payload,
      size,
      signal(),
      async () => bitmap(),
      true
    );
    payload[0] = 99;
    expect(instances[0].chunks[1][0]).toBe(11);
    expect(pool.workingBytes).toBe(512 * 512 * 16 + 1);
    pool.clear();
    expect(pool.workingBytes).toBe(0);
  });
  it("does not retain a codec for a coarse-only request or an unavailable API", async () => {
    const pool = new NativeAvifCellDecoders();
    const fallback = vi.fn(async () => bitmap());
    await pool.decode(index, cell, Uint8Array.of(1), size, signal(), fallback);
    vi.stubGlobal("ImageDecoder", undefined);
    await pool.decode(
      index,
      cell,
      Uint8Array.of(1),
      size,
      signal(),
      fallback,
      true
    );
    expect(fallback).toHaveBeenCalledTimes(2);
    expect(instances).toHaveLength(0);
  });
  it("trims idle contexts first but preserves an in-flight cell until it settles", async () => {
    const pool = new NativeAvifCellDecoders();
    let release!: () => void;
    hold = () =>
      new Promise<void>((resolve) => {
        release = resolve;
      });
    const decoding = pool.decode(
      index,
      cell,
      Uint8Array.of(1),
      size,
      signal(),
      async () => bitmap(),
      true
    );
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    expect(pool.trimTo(0)).toBe(0);
    pool.configureBudget(0);
    expect(instances[0].close).not.toHaveBeenCalled();
    release();
    (await decoding).close();
    expect(instances[0].close).toHaveBeenCalledOnce();
    expect(pool.workingBytes).toBe(0);
  });
  it("rejects an aborted caller immediately and closes its late frame without a format fallback", async () => {
    const pool = new NativeAvifCellDecoders();
    const controller = new AbortController();
    let release!: () => void;
    hold = () =>
      new Promise<void>((resolve) => {
        release = resolve;
      });
    const fallback = vi.fn(async () => bitmap());
    const decoding = pool.decode(
      index,
      cell,
      Uint8Array.of(1),
      size,
      controller.signal,
      fallback,
      true
    );
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    controller.abort(new DOMException("Canceled", "AbortError"));
    await expect(decoding).rejects.toMatchObject({ name: "AbortError" });
    release();
    await vi.waitFor(() => expect(frames[0]?.close).toHaveBeenCalledOnce());
    expect(fallback).not.toHaveBeenCalled();
    expect(pool.workingBytes).toBe(0);
  });
  it("source disposal closes active state and never restarts a late decoder through fallback", async () => {
    const pool = new NativeAvifCellDecoders();
    let release!: () => void;
    hold = () =>
      new Promise<void>((resolve) => {
        release = resolve;
      });
    const fallback = vi.fn(async () => bitmap());
    const decoding = pool.decode(
      index,
      cell,
      Uint8Array.of(1),
      size,
      signal(),
      fallback,
      true
    );
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    pool.clear();
    release();
    await expect(decoding).rejects.toMatchObject({ name: "AbortError" });
    expect(fallback).not.toHaveBeenCalled();
    expect(instances[0].close).toHaveBeenCalledOnce();
    expect(frames[0].close).toHaveBeenCalledOnce();
  });
  it("never publishes an incomplete generation as the final level", async () => {
    const pool = new NativeAvifCellDecoders();
    const fallback = vi.fn(async () => bitmap(512, 512));
    const decode = Decoder.prototype.decode;
    vi.spyOn(Decoder.prototype, "decode").mockImplementation(async function (
      this: Decoder
    ) {
      const result = await decode.call(this);
      return { ...result, complete: false };
    });
    const result = await pool.decode(
      index,
      cell,
      new Uint8Array(10),
      { width: 512, height: 512 },
      signal(),
      fallback,
      true
    );
    expect(result.width).toBe(512);
    expect(fallback).toHaveBeenCalledOnce();
    expect(pool.workingBytes).toBe(0);
    vi.restoreAllMocks();
  });
  it("bounds a browser without partial-generation support and falls back to the same supplied cell", async () => {
    vi.useFakeTimers();
    const pool = new NativeAvifCellDecoders();
    hold = () => new Promise<void>(() => undefined);
    const fallback = vi.fn(async () => bitmap());
    const decoding = pool.decode(
      index,
      cell,
      Uint8Array.of(1),
      size,
      signal(),
      fallback,
      true
    );
    await vi.advanceTimersByTimeAsync(1001);
    expect((await decoding).width).toBe(64);
    expect(fallback).toHaveBeenCalledOnce();
    expect(instances[0].close).toHaveBeenCalledOnce();
    expect(pool.workingBytes).toBe(0);
  });
});

describe("opt-in early native cell generations", () => {
  it.each(["native-sized", "container-sized"])(
    "publishes L4/L3/L2 before held L1 with one codec (%s frames)",
    async (mode) => {
      if (mode === "native-sized")
        frameSize = (bytes) =>
          new Map([
            [1, 64],
            [3, 128],
            [6, 256],
            [10, 512],
          ]).get(bytes)!;
      const pool = new NativeAvifCellDecoders();
      const fallback = vi.fn(async () => bitmap(512, 512));
      const published: { level: number; image: ImageBitmap }[] = [];
      let release!: () => void;
      hold = () =>
        instances[0].supplied === 10
          ? new Promise<void>((resolve) => {
              release = resolve;
            })
          : Promise.resolve();
      let complete = false;
      const work = pool
        .decode(
          index,
          cell,
          Uint8Array.from({ length: 10 }, (_, n) => n),
          { width: 512, height: 512 },
          signal(),
          fallback,
          false,
          {
            accepts: () => true,
            publish: (level, image) => published.push({ level, image }),
          }
        )
        .then((image) => {
          complete = true;
          return image;
        });
      await vi.waitFor(() => expect(release).toBeTypeOf("function"));
      expect(complete).toBe(false);
      expect(
        published.map(({ level, image }) => [level, image.width, image.height])
      ).toEqual([
        [4, 64, 64],
        [3, 128, 128],
        [2, 256, 256],
      ]);
      expect(instances).toHaveLength(1);
      expect(instances[0].chunks.slice(1).map((chunk) => [...chunk])).toEqual([
        [0],
        [1, 2],
        [3, 4, 5],
        [6, 7, 8, 9],
      ]);
      expect(
        published.every(
          ({ image }) => vi.mocked(image.close).mock.calls.length === 0
        )
      ).toBe(true);
      release();
      (await work).close();
      pool.clear();
      expect(
        published.every(
          ({ image }) => vi.mocked(image.close).mock.calls.length === 0
        )
      ).toBe(true);
      published.forEach(({ image }) => image.close());
      expect(fallback).not.toHaveBeenCalled();
      expect(frames.every((frame) => frame.close.mock.calls.length === 1)).toBe(
        true
      );
      expect(instances[0].close).toHaveBeenCalledOnce();
    }
  );

  it("does not label an unexpected frame extent as a complete intermediate", async () => {
    frameSize = (bytes) => (bytes === 3 ? 129 : 512);
    const pool = new NativeAvifCellDecoders();
    const publish = vi.fn((_level: number, image: ImageBitmap) =>
      image.close()
    );
    (
      await pool.decode(
        index,
        cell,
        new Uint8Array(10),
        { width: 512, height: 512 },
        signal(),
        async () => bitmap(),
        false,
        { accepts: () => true, publish }
      )
    ).close();
    expect(publish.mock.calls.map(([level]) => level)).toEqual([4, 2]);
    expect(frames.every((frame) => frame.close.mock.calls.length === 1)).toBe(
      true
    );
  });

  it("rechecks admission after bitmap conversion and closes a rejected output", async () => {
    const pool = new NativeAvifCellDecoders();
    const converted = bitmap();
    let accepted = true;
    vi.mocked(createImageBitmap).mockImplementationOnce(async () => {
      accepted = false;
      return converted;
    });
    const publish = vi.fn();
    const fallback = vi.fn(async () => bitmap());
    (
      await pool.decode(
        index,
        cell,
        new Uint8Array(10),
        { width: 512, height: 512 },
        signal(),
        fallback,
        false,
        { accepts: () => accepted, publish }
      )
    ).close();
    expect(converted.close).toHaveBeenCalledOnce();
    expect(publish).not.toHaveBeenCalled();
    expect(fallback).not.toHaveBeenCalled();
    expect(instances).toHaveLength(1);
  });

  it.each(["abort", "clear"])(
    "closes an intermediate bitmap arriving after %s without publication or fallback",
    async (stop) => {
      const pool = new NativeAvifCellDecoders();
      const controller = new AbortController();
      let release!: (image: ImageBitmap) => void;
      vi.mocked(createImageBitmap).mockImplementationOnce(
        () =>
          new Promise<ImageBitmap>((resolve) => {
            release = resolve;
          })
      );
      const publish = vi.fn();
      const fallback = vi.fn(async () => bitmap());
      const work = pool.decode(
        index,
        cell,
        new Uint8Array(10),
        { width: 512, height: 512 },
        controller.signal,
        fallback,
        false,
        { accepts: () => true, publish }
      );
      const rejected = expect(work).rejects.toMatchObject({
        name: "AbortError",
      });
      await vi.waitFor(() => expect(release).toBeTypeOf("function"));
      if (stop === "abort")
        controller.abort(new DOMException("Canceled", "AbortError"));
      else pool.clear();
      const late = bitmap();
      release(late);
      await rejected;
      await vi.waitFor(() => expect(late.close).toHaveBeenCalledOnce());
      expect(publish).not.toHaveBeenCalled();
      expect(fallback).not.toHaveBeenCalled();
      expect(instances[0].close).toHaveBeenCalledOnce();
    }
  );

  it("keeps receiver-owned intermediate outputs and never restarts the codec when a subscriber throws", async () => {
    const pool = new NativeAvifCellDecoders();
    const owned: ImageBitmap[] = [];
    const fallback = vi.fn(async () => bitmap());
    (
      await pool.decode(
        index,
        cell,
        new Uint8Array(10),
        { width: 512, height: 512 },
        signal(),
        fallback,
        false,
        {
          accepts: () => true,
          publish: (_level, image) => {
            owned.push(image);
            throw new Error("subscriber");
          },
        }
      )
    ).close();
    expect(owned).toHaveLength(3);
    expect(
      owned.every((image) => vi.mocked(image.close).mock.calls.length === 0)
    ).toBe(true);
    owned.forEach((image) => image.close());
    expect(instances).toHaveLength(1);
    expect(fallback).not.toHaveBeenCalled();
  });

  it("does not publish a partial packet or relabel a previously decoded finer frame as a coarser generation", async () => {
    const pool = new NativeAvifCellDecoders();
    const publish = vi.fn((_level: number, image: ImageBitmap) =>
      image.close()
    );
    const fallback = vi.fn(async () => bitmap(128, 128));
    (
      await pool.decode(
        index,
        cell,
        new Uint8Array(2),
        { width: 128, height: 128 },
        signal(),
        fallback,
        true,
        { accepts: () => true, publish }
      )
    ).close();
    expect(publish).not.toHaveBeenCalled();
    expect(instances[0].chunks).toHaveLength(0);
    (
      await pool.decode(
        index,
        cell,
        new Uint8Array(6),
        { width: 256, height: 256 },
        signal(),
        fallback,
        true
      )
    ).close();
    const conversions = vi.mocked(createImageBitmap).mock.calls.length;
    (
      await pool.decode(
        index,
        cell,
        new Uint8Array(3),
        { width: 128, height: 128 },
        signal(),
        fallback,
        true,
        { accepts: () => true, publish }
      )
    ).close();
    expect(fallback).toHaveBeenCalledTimes(2);
    expect(vi.mocked(createImageBitmap)).toHaveBeenCalledTimes(conversions);
    expect(publish).not.toHaveBeenCalled();
    pool.clear();
  });
});
