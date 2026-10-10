import {
  makeAvifTileHeader,
  type AvifGridIndex,
  type AvifItem,
} from "../core/avif-grid-index";

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
  decoder: ProgressiveDecoder;
  input: ReadableStreamDefaultController<Uint8Array>;
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

/** Source-owned codec contexts. Compressed bytes and returned bitmaps remain caller-owned. */
export class NativeAvifCellDecoders {
  private readonly contexts = new Map<number, CellContext>();
  private budget = DEFAULT_WORKING_BYTES;
  private disabled = false;

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
    retainProgressive = false
  ): Promise<ImageBitmap> {
    signal.throwIfAborted();
    const Decoder = (
      globalThis as typeof globalThis & {
        ImageDecoder?: ProgressiveDecoderConstructor;
      }
    ).ImageDecoder;
    if (!Decoder || this.disabled || this.budget === 0) return fallback();
    let context = this.contexts.get(cell.id);
    if (!context && !retainProgressive) return fallback();
    try {
      if (!context || context.closed) {
        const ispe = cell.properties.find((p) => p.type === "ispe");
        if (!ispe) return fallback();
        const dimensions = new DataView(Uint8Array.from(ispe.bytes).buffer);
        const total = cell.ranges.reduce((sum, range) => sum + range.length, 0);
        let input!: ReadableStreamDefaultController<Uint8Array>;
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            input = controller;
          },
        });
        const decoder = new Decoder({
          data: stream,
          type: "image/avif",
          premultiplyAlpha: "none",
          colorSpaceConversion: "default",
          preferAnimation: false,
        });
        input.enqueue(makeAvifTileHeader(index, cell, total));
        context = {
          decoder,
          input,
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
        // Partial frames carry no quality-level identifier. Advance skipped physical layers
        // one generation at a time, then publish only the requested prefix's bitmap.
        for (const end of layerEnds) {
          if (end <= owned.supplied || end > payload.byteLength) continue;
          signal.throwIfAborted();
          // Never enqueue the source-owned backing allocation: streams may retain or detach chunks.
          owned.input.enqueue(payload.slice(owned.supplied, end));
          owned.estimatedBytes += end - owned.supplied;
          owned.supplied = end;
          if (owned.supplied === owned.total) owned.input.close();
          let timeout: ReturnType<typeof setTimeout> | undefined;
          const decode = owned.decoder.decode({
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
        }
        signal.throwIfAborted();
        if (!owned.frame) throw new Error("Native AVIF decoder has no frame");
        // Keep the existing per-level whole-cell pixel contract; only final display code clips edge cells.
        const bitmap = await createImageBitmap(owned.frame, {
          premultiplyAlpha: "none",
          resizeWidth: size.width,
          resizeHeight: size.height,
          resizeQuality: "high",
        });
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
      context.input.error(
        new DOMException("AVIF cell decoder released", "AbortError")
      );
    } catch {
      /* The input may already be closed. */
    }
    context.decoder.close();
  }
}
