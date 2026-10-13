import {
  makeAvifTileHeader,
  type AvifGridIndex,
  type AvifItem,
} from "../core/avif-grid-index";
import { createFrameImageBitmap } from "./create-frame-image-bitmap";
import {
  NativeAvifVideoDecoder,
  nativeAvifVideoConfig,
} from "./native-avif-video-decoder";

type ProgressiveFrame = VideoFrame;
type ProgressiveDecoder = {
  decode(options: {
    frameIndex: number;
    completeFramesOnly: boolean;
  }): Promise<{
    image: ProgressiveFrame;
    complete: boolean;
  }>;
  close(): void;
};
type ProgressiveDecoderConstructor = {
  new (options: {
    data: ReadableStream<Uint8Array>;
    type: string;
    premultiplyAlpha: "none";
    colorSpaceConversion: "default";
    preferAnimation: false;
  }): ProgressiveDecoder;
};
type CellContext = {
  decoder?: ProgressiveDecoder;
  input?: ReadableStreamDefaultController<Uint8Array>;
  video?: NativeAvifVideoDecoder;
  tail: Promise<void>;
  frame?: ProgressiveFrame;
  supplied: number;
  total: number;
  estimatedBytes: number;
  users: number;
  closed: boolean;
  retain: boolean;
};
const DEFAULT_WORKING_BYTES = 64 * 1024 * 1024;
const PROGRESSIVE_TIMEOUT_MS = 1000;
const VIDEO_DECODER_MIN_EDGE = 1024;

/** Source-owned codec contexts. Compressed bytes and returned bitmaps remain caller-owned. */
export class NativeAvifCellDecoders {
  private readonly contexts = new Map<number, CellContext>();
  private budget = DEFAULT_WORKING_BYTES;
  private disabled = false;
  private readonly videoDisabled = new Set<number>();

  /** Admission estimate, not a measurement of browser-native decoder allocations. */
  get workingBytes() {
    let bytes = 0;
    for (const entry of this.contexts.values()) bytes += entry.estimatedBytes;
    return bytes;
  }

  configureBudget(bytes: number) {
    this.budget = Math.max(0, bytes);
    this.trimTo(this.budget);
  }

  trimTo(bytes: number) {
    const before = this.workingBytes;
    for (const [id, context] of this.contexts) {
      if (this.workingBytes <= Math.max(0, bytes)) break;
      if (context.users !== 0) continue;
      this.contexts.delete(id);
      this.closeContext(context);
    }
    return before - this.workingBytes;
  }

  clear() {
    for (const context of this.contexts.values()) this.closeContext(context);
    this.contexts.clear();
  }

  async decode(
    index: AvifGridIndex,
    cell: AvifItem,
    payload: Uint8Array,
    size: Readonly<{ width: number; height: number }>,
    signal: AbortSignal,
    fallback: () => Promise<ImageBitmap>,
    retainProgressive = false,
    progress?: {
      accepts(level: number): boolean;
      /** Ownership transfers to the receiver, including when its notification throws. */
      publish(level: number, bitmap: ImageBitmap): void;
    }
  ): Promise<ImageBitmap> {
    signal.throwIfAborted();
    const Decoder = (
      globalThis as typeof globalThis & {
        ImageDecoder?: ProgressiveDecoderConstructor;
      }
    ).ImageDecoder;
    if (this.budget === 0) return fallback();
    let context = this.contexts.get(cell.id);
    if (!context && !retainProgressive && !progress) return fallback();
    try {
      if (!context || context.closed) {
        const ispe = cell.properties.find((p) => p.type === "ispe");
        if (!ispe || ispe.bytes.length < 20) return fallback();
        const dimensions = new DataView(Uint8Array.from(ispe.bytes).buffer);
        // The complete progressive chain is faster through ImageDecoder for 512px cells.
        const videoConfig =
          (retainProgressive || !!progress) &&
          !this.videoDisabled.has(cell.id) &&
          typeof globalThis.VideoDecoder === "function" &&
          typeof globalThis.EncodedVideoChunk === "function" &&
          Math.max(dimensions.getUint32(12), dimensions.getUint32(16)) >=
            VIDEO_DECODER_MIN_EDGE
            ? nativeAvifVideoConfig(cell)
            : undefined;
        if (!videoConfig && (!Decoder || this.disabled)) return fallback();
        const total = cell.ranges.reduce((sum, range) => sum + range.length, 0);
        let input: ReadableStreamDefaultController<Uint8Array> | undefined;
        let decoder: ProgressiveDecoder | undefined;
        const video = videoConfig
          ? new NativeAvifVideoDecoder(videoConfig)
          : undefined;
        if (!video) {
          const stream = new ReadableStream<Uint8Array>({
            start(controller) {
              input = controller;
            },
          });
          decoder = new Decoder!({
            data: stream,
            type: "image/avif",
            premultiplyAlpha: "none",
            colorSpaceConversion: "default",
            preferAnimation: false,
          });
          input!.enqueue(makeAvifTileHeader(index, cell, total));
        }
        context = {
          decoder,
          input,
          video,
          tail: Promise.resolve(),
          supplied: 0,
          total,
          users: 0,
          closed: false,
          retain: retainProgressive,
          // RGBA output plus high-bit-depth reference/scratch allowance. The UA owns exact allocations.
          estimatedBytes:
            dimensions.getUint32(12) * dimensions.getUint32(16) * 16,
        };
        this.contexts.set(cell.id, context);
      }
    } catch {
      this.disabled = true;
      this.clear();
      return fallback();
    }
    const owned = context;
    owned.retain = retainProgressive;
    owned.users++;
    this.contexts.delete(cell.id);
    this.contexts.set(cell.id, owned);
    const work = owned.tail.then(async () => {
      signal.throwIfAborted();
      if (owned.closed)
        throw new DOMException("AVIF cell decoder released", "AbortError");
      try {
        if (payload.byteLength > owned.total)
          throw new RangeError("Native AVIF cell prefix exceeds its extent");
        let layerEnd = 0;
        const layerEnds = cell.ranges.map(
          (range) => (layerEnd += range.length)
        );
        if (!layerEnds.includes(payload.byteLength))
          throw new RangeError("Native AVIF cell prefix ends inside a layer");
        // A later queued consumer must never mislabel a finer cached frame as its earlier generation.
        if (payload.byteLength < owned.supplied) return fallback();
        const ispe = cell.properties.find(
          (property) => property.type === "ispe"
        )!;
        const dimensions = new DataView(Uint8Array.from(ispe.bytes).buffer);
        const fullWidth = dimensions.getUint32(12),
          fullHeight = dimensions.getUint32(16);
        // Advance one validated physical boundary at a time: partial frames have no level identifier.
        for (const [layerIndex, end] of layerEnds.entries()) {
          if (end <= owned.supplied || end > payload.byteLength) continue;
          signal.throwIfAborted();
          // Never enqueue the source-owned backing allocation: streams may retain or detach chunks.
          const packet = payload.slice(owned.supplied, end);
          owned.input?.enqueue(packet);
          owned.estimatedBytes += end - owned.supplied;
          owned.supplied = end;
          if (owned.supplied === owned.total) owned.input?.close();
          let timeout: ReturnType<typeof setTimeout> | undefined;
          const decode = owned.video
            ? owned.video.decode(packet, owned.supplied === owned.total)
            : owned.decoder!.decode({
                frameIndex: 0,
                completeFramesOnly: false,
              });
          let result: Awaited<typeof decode>;
          try {
            result = await Promise.race([
              decode,
              new Promise<never>((_, reject) => {
                timeout = setTimeout(
                  () =>
                    reject(
                      new Error(
                        "Progressive AVIF decoder did not produce a generation"
                      )
                    ),
                  PROGRESSIVE_TIMEOUT_MS
                );
              }),
            ]);
          } catch (error) {
            void decode.then(
              (late) => late.image.close(),
              () => undefined
            );
            throw error;
          } finally {
            if (timeout !== undefined) clearTimeout(timeout);
          }
          if (owned.closed) {
            result.image.close();
            signal.throwIfAborted();
            throw new Error("AVIF decoder closed");
          }
          if (owned.supplied === owned.total && !result.complete) {
            result.image.close();
            throw new Error(
              "Native AVIF decoder returned an incomplete final generation"
            );
          }
          owned.frame?.close();
          owned.frame = result.image;
          if (result.complete) owned.retain = false;
          const level = layerEnds.length - layerIndex;
          if (end < payload.byteLength && progress?.accepts(level)) {
            const width = Math.ceil(fullWidth / 2 ** (level - 1));
            const height = Math.ceil(fullHeight / 2 ** (level - 1));
            const exact =
              result.image.displayWidth === width &&
              result.image.displayHeight === height;
            const containerScaled =
              !owned.video &&
              result.image.displayWidth === fullWidth &&
              result.image.displayHeight === fullHeight;
            // Raw AV1 frames must identify this layer by dimensions. ImageDecoder may expose
            // a progressive generation on the complete container's display extent instead.
            if (exact || containerScaled) {
              const bitmap = await createFrameImageBitmap(
                result.image,
                owned.video
                  ? { premultiplyAlpha: "none" }
                  : {
                      premultiplyAlpha: "none",
                      resizeWidth: width,
                      resizeHeight: height,
                      resizeQuality: "high",
                    },
                signal
              );
              if (signal.aborted || owned.closed || !progress.accepts(level)) {
                bitmap.close();
                signal.throwIfAborted();
                if (owned.closed)
                  throw new DOMException(
                    "AVIF cell decoder released",
                    "AbortError"
                  );
              } else {
                // Notification failure is not a codec failure and must not replay the AV1 stream.
                // The receiver owns its accepted bitmap and its own subscriber error policy.
                try {
                  progress.publish(level, bitmap);
                } catch {
                  /* receiver-owned output */
                }
              }
            }
          }
        }
        signal.throwIfAborted();
        if (!owned.frame) throw new Error("Native AVIF decoder has no frame");
        // Keep the existing per-level whole-cell pixel contract; only final display code clips edge cells.
        if (
          owned.video &&
          (owned.frame.displayWidth !== size.width ||
            owned.frame.displayHeight !== size.height)
        )
          throw new Error(
            "Native AV1 output does not match the requested level"
          );
        const bitmap = await createFrameImageBitmap(
          owned.frame,
          owned.video
            ? { premultiplyAlpha: "none" }
            : {
                premultiplyAlpha: "none",
                resizeWidth: size.width,
                resizeHeight: size.height,
                resizeQuality: "high",
              },
          signal
        );
        if (signal.aborted || owned.closed) {
          bitmap.close();
          signal.throwIfAborted();
          throw new DOMException("AVIF cell decoder released", "AbortError");
        }
        return bitmap;
      } catch (error) {
        const released = owned.closed;
        this.closeContext(owned);
        if (this.contexts.get(cell.id) === owned) this.contexts.delete(cell.id);
        signal.throwIfAborted();
        if (released)
          throw new DOMException("AVIF cell decoder released", "AbortError");
        if (owned.video) {
          this.videoDisabled.add(cell.id);
          // Retry through the existing container decoder using this same native prefix.
          return this.decode(
            index,
            cell,
            payload,
            size,
            signal,
            fallback,
            retainProgressive,
            progress
          );
        }
        // Browser decoding capability fallback, using exactly the same native source and prefix.
        return fallback();
      }
    });
    owned.tail = work.then(
      () => undefined,
      () => undefined
    );
    const completed = work.finally(() => {
      owned.users--;
      if (!owned.retain && owned.users === 0) {
        if (this.contexts.get(cell.id) === owned) this.contexts.delete(cell.id);
        this.closeContext(owned);
      }
      this.trimTo(this.budget);
    });
    // Cancellation stops this consumer immediately; late owned outputs are explicitly closed.
    return new Promise<ImageBitmap>((resolve, reject) => {
      const abort = () => reject(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      completed.then(
        (bitmap) => {
          signal.removeEventListener("abort", abort);
          if (signal.aborted) {
            bitmap.close();
            reject(signal.reason);
          } else resolve(bitmap);
        },
        (error) => {
          signal.removeEventListener("abort", abort);
          reject(error);
        }
      );
      if (signal.aborted) abort();
    });
  }

  private closeContext(context: CellContext) {
    if (context.closed) return;
    context.closed = true;
    context.frame?.close();
    context.frame = undefined;
    try {
      context.input?.error(
        new DOMException("AVIF cell decoder released", "AbortError")
      );
    } catch {
      /* The input may already be closed. */
    }
    context.video?.close();
    context.decoder?.close();
  }
}
