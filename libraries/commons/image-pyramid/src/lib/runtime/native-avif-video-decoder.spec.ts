import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AvifGridIndex, AvifItem } from "../core/avif-grid-index";
import { NativeAvifCellDecoders } from "./native-avif-cell-decoder";
import { nativeAvifVideoConfig } from "./native-avif-video-decoder";

const property = (type: string, length: number) => {
  const bytes = new Uint8Array(length);
  new DataView(bytes.buffer).setUint32(0, length);
  bytes.set(
    [...type].map((letter) => letter.charCodeAt(0)),
    4
  );
  return bytes;
};
const cellOf = (edge = 1024, depth = 10): AvifItem => {
  const ispe = property("ispe", 20);
  new DataView(ispe.buffer).setUint32(12, edge);
  new DataView(ispe.buffer).setUint32(16, edge);
  const av1 = property("av1C", 12);
  av1.set([0x81, 0x21, depth === 10 ? 0x40 : 0, 0], 8);
  const color = property("colr", 19);
  color.set([110, 99, 108, 120, 0, 1, 0, 13, 0, 6, 128], 8);
  return {
    id: 7,
    ranges: [1, 2, 3, 4].map((length, index) => ({
      offset: index * 10,
      length,
    })),
    properties: [ispe, av1, color].map((bytes) => ({
      type: String.fromCharCode(...bytes.slice(4, 8)),
      bytes: [...bytes],
      essential: false,
    })),
  };
};
const index = { ftyp: [0, 0, 0, 8, 102, 116, 121, 112] } as AvifGridIndex;
const signal = () => new AbortController().signal;
const payload = Uint8Array.from({ length: 10 }, (_, n) => n);
const bitmap = (width: number, height: number) =>
  ({ width, height, close: vi.fn() } as unknown as ImageBitmap);
const frames: VideoFrame[] = [];
const frameOf = (timestamp: number, width: number, height = width) => {
  const frame = {
    timestamp,
    displayWidth: width,
    displayHeight: height,
    close: vi.fn(),
  } as unknown as VideoFrame;
  frames.push(frame);
  return frame;
};
class Chunk {
  readonly type: EncodedVideoChunkType;
  readonly timestamp: number;
  readonly data: Uint8Array;
  constructor(options: {
    type: EncodedVideoChunkType;
    timestamp: number;
    data: Uint8Array;
  }) {
    this.type = options.type;
    this.timestamp = options.timestamp;
    this.data = options.data;
  }
}
const videos: Video[] = [];
let onPacket: ((video: Video, packet: Chunk) => void) | undefined;
let configurationError = false;
const supports = vi.fn(async (_config: VideoDecoderConfig) => ({
  supported: true,
}));
class Video {
  static isConfigSupported = supports;
  state: CodecState = "unconfigured";
  config?: VideoDecoderConfig;
  close = vi.fn(() => {
    this.state = "closed";
  });
  flush = vi.fn();
  configure = vi.fn((config: VideoDecoderConfig) => {
    if (configurationError) throw new Error("configure failed");
    this.config = config;
    this.state = "configured";
  });
  decode = vi.fn((packet: Chunk) => {
    if (onPacket) return onPacket(this, packet);
    this.callbacks.output(
      frameOf(
        packet.timestamp,
        this.config!.codedWidth! / 2 ** (4 - packet.timestamp)
      )
    );
  });
  constructor(readonly callbacks: VideoDecoderInit) {
    videos.push(this);
  }
}
const images: Image[] = [];
class Image {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private first = true;
  private supplied = 0;
  readonly chunks: Uint8Array[] = [];
  close = vi.fn();
  constructor(options: { data: ReadableStream<Uint8Array> }) {
    this.reader = options.data.getReader();
    images.push(this);
  }
  async decode() {
    if (this.first) {
      await this.reader.read();
      this.first = false;
    }
    const chunk = (await this.reader.read()).value!;
    this.chunks.push(chunk);
    this.supplied += chunk.byteLength;
    return { image: frameOf(0, 1024), complete: this.supplied === 10 };
  }
}
const bitmapFromFrame = vi.fn(
  async (frame: VideoFrame, options?: ImageBitmapOptions) =>
    bitmap(
      options?.resizeWidth ?? frame.displayWidth,
      options?.resizeHeight ?? frame.displayHeight
    )
);
const settle = async () => {
  for (let i = 0; i < 16; i++) await Promise.resolve();
};
beforeEach(() => {
  videos.length = 0;
  images.length = 0;
  frames.length = 0;
  onPacket = undefined;
  configurationError = false;
  supports.mockReset().mockResolvedValue({ supported: true });
  bitmapFromFrame.mockClear();
  vi.stubGlobal("VideoDecoder", Video);
  vi.stubGlobal("EncodedVideoChunk", Chunk);
  vi.stubGlobal("ImageDecoder", Image);
  vi.stubGlobal("createImageBitmap", bitmapFromFrame);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("native AVIF video configuration", () => {
  it.each([8, 10])(
    "uses actual %s-bit AV1 and nclx metadata without a description",
    (depth) => {
      const config = nativeAvifVideoConfig(cellOf(1024, depth));
      expect(config).toEqual({
        codec: `av01.1.01M.${String(depth).padStart(2, "0")}.0.000.01.13.06.1`,
        codedWidth: 1024,
        codedHeight: 1024,
        optimizeForLatency: true,
        hardwareAcceleration: "prefer-software",
        colorSpace: {
          primaries: "bt709",
          transfer: "iec61966-2-1",
          matrix: "smpte170m",
          fullRange: true,
        },
      });
      expect(config).not.toHaveProperty("description");
    }
  );
  it.each(["auxC", "irot", "imir", "clap", "pasp", "mdcv"])(
    "leaves %s metadata with the container decoder",
    (type) => {
      const cell = cellOf();
      cell.properties.push({ type, bytes: [], essential: false });
      expect(nativeAvifVideoConfig(cell)).toBeUndefined();
    }
  );
  it("rejects ICC, missing color metadata, other CICP, and subsampled inputs", () => {
    const icc = cellOf();
    icc.properties[2].bytes[8] = 112;
    const missing = cellOf();
    missing.properties.pop();
    const hdr = cellOf();
    hdr.properties[2].bytes[15] = 16;
    const subsampled = cellOf();
    subsampled.properties[1].bytes[10] |= 12;
    for (const cell of [icc, missing, hdr, subsampled])
      expect(nativeAvifVideoConfig(cell)).toBeUndefined();
  });
});

describe("adaptive source-owned native cell contexts", () => {
  it("reuses one large-cell decoder through four actual-size outputs without flush or resize", async () => {
    const pool = new NativeAvifCellDecoders();
    const cell = cellOf();
    const fallback = vi.fn(async () => bitmap(1024, 1024));
    for (const [generation, end] of [1, 3, 6, 10].entries()) {
      const edge = 128 * 2 ** generation;
      const output = await pool.decode(
        index,
        cell,
        payload.slice(0, end),
        { width: edge, height: edge },
        signal(),
        fallback,
        end !== 10
      );
      expect(output.width).toBe(edge);
      output.close();
    }
    expect(videos).toHaveLength(1);
    expect(videos[0].configure).toHaveBeenCalledOnce();
    expect(supports).toHaveBeenCalledOnce();
    expect(
      videos[0].decode.mock.calls.map(([chunk]) => [
        chunk.type,
        chunk.timestamp,
        [...chunk.data],
      ])
    ).toEqual([
      ["key", 1, [0]],
      ["delta", 2, [1, 2]],
      ["delta", 3, [3, 4, 5]],
      ["delta", 4, [6, 7, 8, 9]],
    ]);
    expect(
      bitmapFromFrame.mock.calls.every(
        ([, options]) => options?.resizeWidth === undefined
      )
    ).toBe(true);
    expect(videos[0].flush).not.toHaveBeenCalled();
    expect(videos[0].close).toHaveBeenCalledOnce();
    expect(
      frames.every((frame) => vi.mocked(frame.close).mock.calls.length === 1)
    ).toBe(true);
    expect(images).toHaveLength(0);
    expect(fallback).not.toHaveBeenCalled();
    expect(pool.workingBytes).toBe(0);
  });

  it("keeps 512px progressive cells on ImageDecoder and coarse-only calls on their native bitmap path", async () => {
    const pool = new NativeAvifCellDecoders();
    const fallback = vi.fn(async () => bitmap(128, 128));
    await pool.decode(
      index,
      cellOf(512),
      payload.slice(0, 1),
      { width: 64, height: 64 },
      signal(),
      fallback,
      true
    );
    expect(images).toHaveLength(1);
    pool.clear();
    await pool.decode(
      index,
      cellOf(),
      payload.slice(0, 1),
      { width: 128, height: 128 },
      signal(),
      fallback,
      false
    );
    expect(fallback).toHaveBeenCalledOnce();
    expect(supports).not.toHaveBeenCalled();
    expect(videos).toHaveLength(0);
  });

  it("advances skipped layers serially and publishes only the requested spatial layer", async () => {
    const pool = new NativeAvifCellDecoders();
    const output = await pool.decode(
      index,
      cellOf(),
      payload.slice(0, 6),
      { width: 512, height: 512 },
      signal(),
      vi.fn(),
      true
    );
    expect(output.width).toBe(512);
    expect(videos[0].decode).toHaveBeenCalledTimes(3);
    expect(bitmapFromFrame).toHaveBeenCalledOnce();
    expect(pool.workingBytes).toBe(1024 * 1024 * 16 + 6);
    expect([...payload]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    pool.clear();
  });

  it.each(["absent", "unsupported", "configure", "async-error"])(
    "falls back to ImageDecoder on %s using the same prefix",
    async (mode) => {
      if (mode === "absent") vi.stubGlobal("VideoDecoder", undefined);
      if (mode === "unsupported")
        supports.mockResolvedValue({ supported: false });
      if (mode === "configure") configurationError = true;
      if (mode === "async-error")
        onPacket = (video) =>
          video.callbacks.error(
            new DOMException("codec failed", "EncodingError")
          );
      const pool = new NativeAvifCellDecoders();
      const fallback = vi.fn(async () => bitmap(512, 512));
      const result = await pool.decode(
        index,
        cellOf(),
        payload.slice(0, 6),
        { width: 512, height: 512 },
        signal(),
        fallback,
        true
      );
      expect(result.width).toBe(512);
      expect(images).toHaveLength(1);
      expect(images[0].chunks.map((chunk) => [...chunk])).toEqual([
        [0],
        [1, 2],
        [3, 4, 5],
      ]);
      expect(fallback).not.toHaveBeenCalled();
      for (const video of videos) expect(video.close).toHaveBeenCalledOnce();
      pool.clear();
    }
  );

  it("closes unmatched timestamp frames while preserving the matching generation", async () => {
    onPacket = (video, packet) => {
      video.callbacks.output(frameOf(999, 128));
      video.callbacks.output(frameOf(packet.timestamp, 128));
    };
    const pool = new NativeAvifCellDecoders();
    const result = await pool.decode(
      index,
      cellOf(),
      payload.slice(0, 1),
      { width: 128, height: 128 },
      signal(),
      vi.fn(),
      true
    );
    expect(result.width).toBe(128);
    expect(frames[0].close).toHaveBeenCalledOnce();
    expect(frames[1].close).not.toHaveBeenCalled();
    pool.clear();
    expect(frames[1].close).toHaveBeenCalledOnce();
  });

  it("does not reinterpret an unexpectedly scaled video frame as the requested tile", async () => {
    onPacket = (video, packet) =>
      video.callbacks.output(frameOf(packet.timestamp, 1024));
    const pool = new NativeAvifCellDecoders();
    const result = await pool.decode(
      index,
      cellOf(),
      payload.slice(0, 1),
      { width: 128, height: 128 },
      signal(),
      vi.fn(),
      true
    );
    expect(result.width).toBe(128);
    expect(images).toHaveLength(1);
    expect(frames[0].close).toHaveBeenCalledOnce();
    pool.clear();
  });

  it.each(["abort", "clear"])(
    "rejects %s without fallback and closes late frames",
    async (mode) => {
      onPacket = () => undefined;
      const pool = new NativeAvifCellDecoders();
      const controller = new AbortController();
      const fallback = vi.fn(async () => bitmap(128, 128));
      const pending = pool.decode(
        index,
        cellOf(),
        payload.slice(0, 1),
        { width: 128, height: 128 },
        controller.signal,
        fallback,
        true
      );
      const rejected = expect(pending).rejects.toHaveProperty(
        "name",
        "AbortError"
      );
      await settle();
      expect(videos[0].decode).toHaveBeenCalledOnce();
      if (mode === "abort") controller.abort();
      else pool.clear();
      const frame = frameOf(1, 128);
      videos[0].callbacks.output(frame);
      await rejected;
      await settle();
      expect(frame.close).toHaveBeenCalledOnce();
      expect(videos[0].close).toHaveBeenCalledOnce();
      expect(pool.workingBytes).toBe(0);
      expect(images).toHaveLength(0);
      expect(fallback).not.toHaveBeenCalled();
    }
  );

  it("protects an active decoder from trimming and releases it after completion", async () => {
    onPacket = () => undefined;
    const pool = new NativeAvifCellDecoders();
    const pending = pool.decode(
      index,
      cellOf(),
      payload.slice(0, 1),
      { width: 128, height: 128 },
      signal(),
      vi.fn(),
      true
    );
    await settle();
    pool.configureBudget(0);
    expect(pool.workingBytes).toBeGreaterThan(0);
    expect(videos[0].close).not.toHaveBeenCalled();
    videos[0].callbacks.output(frameOf(1, 128));
    await pending;
    expect(videos[0].close).toHaveBeenCalledOnce();
    expect(pool.workingBytes).toBe(0);
  });

  it("bounds a video backend that emits only the final spatial layer", async () => {
    vi.useFakeTimers();
    onPacket = () => undefined;
    const pool = new NativeAvifCellDecoders();
    const pending = pool.decode(
      index,
      cellOf(),
      payload.slice(0, 1),
      { width: 128, height: 128 },
      signal(),
      vi.fn(),
      true
    );
    await vi.advanceTimersByTimeAsync(1001);
    expect((await pending).width).toBe(128);
    expect(videos[0].close).toHaveBeenCalledOnce();
    expect(images).toHaveLength(1);
    pool.clear();
  });
});
