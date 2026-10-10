import {
  avifMetadataEnd,
  hasIndependentAvifPyramidIndex,
  hasNativeAvifLayers,
  concatenateAvifBytes,
  parseNativeAvif,
  readObliqueAvifDocument,
  type NativeAvifLayout,
  type StandaloneAvifDocument,
} from "../core/avif-native-convention";
import { sharedAvifRangeTransport } from "./avif-range-transport";
import { BoundedImageRangeCache } from "./bounded-image-range-cache";
import {
  reserveImagePrefetchBytes,
  ImagePrefetchBudgetExceeded,
  type ImagePrefetchBudget,
} from "./image-tile-source";
import {
  AvifAssetChangedError,
  AvifHttpError,
  AvifRepresentationError,
  NativeAvifFormatError,
} from "./avif-source-errors";
import type { AvifRange } from "../core/avif-grid-index";

const transport = sharedAvifRangeTransport;
const MAX_RANGE_BYTES = 4 * 1024 * 1024;
export type NativeAvifBootstrap = {
  bytes: Uint8Array;
  layout: NativeAvifLayout;
  document: StandaloneAvifDocument | null;
};
type NativeReadOptions = {
  priority?: "high" | "low";
  prefetchBudget?: ImagePrefetchBudget;
};
type NativeSeed = {
  bootstrap: NativeAvifBootstrap;
  version: string | null;
};
type QueuedRange = {
  offset: number;
  length: number;
  signal: AbortSignal;
  options: NativeReadOptions;
  output: Uint8Array;
  received: number;
  resolve: (bytes: Uint8Array) => void;
  reject: (error: unknown) => void;
};
const canonical = (url: string) => {
  const u = new URL(url, globalThis.location?.href);
  u.searchParams.delete("pyramid");
  return u.href;
};
const sources = new Map<string, NativeAvifByteSource>();
const leases = new Map<string, number>();
const waitFor = <T>(promise: Promise<T>, signal: AbortSignal): Promise<T> => {
  if (signal.aborted) {
    void promise.catch(() => undefined);
    return Promise.reject(signal.reason);
  }
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
};

/** The compositor supports the producer's full-sensor, unmirrored L1-L4 convention. */
const documentFor = (bytes: Uint8Array, layout: NativeAvifLayout) => {
  const document = readObliqueAvifDocument(bytes, layout);
  if (!document) return null;
  const dimensions = document.pixelMapping.calibrationDimensions;
  if (
    dimensions.length !== 2 ||
    !dimensions.every((n) => Number.isSafeInteger(n) && n > 0) ||
    document.pixelMapping.primaryDimensions?.[0] !==
      layout.index.dimensions.width ||
    document.pixelMapping.primaryDimensions?.[1] !==
      layout.index.dimensions.height ||
    dimensions[0] !== layout.index.dimensions.width * 2 ||
    dimensions[1] !== layout.index.dimensions.height * 2
  )
    throw new NativeAvifFormatError(
      "Unsupported native AVIF sensor dimensions"
    );
  for (let level = 1; level <= 4; level++) {
    const scale = 2 ** level,
      half = (scale - 1) / 2;
    if (
      JSON.stringify(
        document.pixelMapping.levelToSensorAffine?.[String(level)]
      ) !==
      JSON.stringify([
        [scale, 0, half],
        [0, scale, half],
      ])
    )
      throw new NativeAvifFormatError("Unsupported native AVIF sensor mapping");
  }
  return document;
};

const requireNativeLayout = (bytes: Uint8Array): NativeAvifLayout => {
  try {
    const layout = parseNativeAvif(bytes);
    if (!layout)
      throw new NativeAvifFormatError(
        "Unsupported native four-layer AVIF grid"
      );
    return layout;
  } catch (error) {
    if (error instanceof NativeAvifFormatError) throw error;
    throw new NativeAvifFormatError(
      error instanceof Error ? error.message : String(error)
    );
  }
};

/** Skip a large legacy meta payload using the same cached header reads as discovery. */
const legacyIndexAfterMetadata = async (
  offset: number,
  read: (offset: number, length: number) => Promise<Uint8Array>,
  signal: AbortSignal
): Promise<boolean> => {
  let previousType = "";
  for (let count = 0; count < 16; count++) {
    signal.throwIfAborted();
    let bytes: Uint8Array;
    try {
      bytes = await read(offset, previousType === "mdat" ? 4120 : 16);
    } catch (error) {
      // A native mdat can finish the file; its missing successor is not a format signal.
      if (error instanceof AvifHttpError && error.status === 416) return false;
      throw error;
    }
    if (hasIndependentAvifPyramidIndex(bytes)) return true;
    if (bytes.length < 8) return false;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let size = view.getUint32(0),
      header = 8;
    const type = new TextDecoder().decode(bytes.subarray(4, 8));
    if (size === 1) {
      if (bytes.length < 16) return false;
      size = Number(view.getBigUint64(8));
      header = 16;
    }
    if (!Number.isSafeInteger(offset + size) || size < header) return false;
    if (type === "uuid") return false;
    offset += size;
    previousType = type;
  }
  return false;
};

/** Reuse the normal reader's discovery prefix; a legacy file returns undefined. */
export async function probeNativeAvif(
  url: string,
  prefix: Uint8Array,
  read: (offset: number, length: number) => Promise<Uint8Array>,
  signal: AbortSignal,
  version: () => string | null
): Promise<NativeAvifByteSource | undefined> {
  signal.throwIfAborted();
  if (hasIndependentAvifPyramidIndex(prefix)) return undefined;
  const nativeMarker = hasNativeAvifLayers(prefix);
  let end: number | null;
  try {
    end = avifMetadataEnd(prefix);
  } catch (error) {
    // An inconclusive format probe must preserve the legacy parser's diagnostics.
    if (!nativeMarker) return undefined;
    throw new NativeAvifFormatError(
      error instanceof Error ? error.message : String(error)
    );
  }
  if (end === null) return undefined;
  if (
    end > prefix.length &&
    !nativeMarker &&
    (await legacyIndexAfterMetadata(end, read, signal))
  )
    return undefined;
  let bytes = prefix;
  if (end > bytes.length)
    bytes = concatenateAvifBytes(
      bytes,
      await read(bytes.length, end - bytes.length)
    );
  signal.throwIfAborted();
  if (hasIndependentAvifPyramidIndex(bytes) || !hasNativeAvifLayers(bytes))
    return undefined;
  const layout = requireNativeLayout(bytes);
  if (layout.previewPrefixEnd > MAX_RANGE_BYTES)
    throw new NativeAvifFormatError("Native AVIF bootstrap exceeds four MiB");
  if (layout.previewPrefixEnd > bytes.length)
    bytes = concatenateAvifBytes(
      bytes,
      await read(bytes.length, layout.previewPrefixEnd - bytes.length)
    );
  signal.throwIfAborted();
  const bootstrap = { bytes, layout, document: documentFor(bytes, layout) };
  return new NativeAvifByteSource(url, undefined, false, {
    bootstrap,
    version: version(),
  });
}

/** One byte source shared by import, preview and detail; local files never fetch. */
export class NativeAvifByteSource {
  priority: "high" | "low" = "high";
  prefetchBudget?: ImagePrefetchBudget;
  private opened: Promise<NativeAvifBootstrap> | null = null;
  private bootstrap: NativeAvifBootstrap | null = null;
  private cache = new Map<number, Uint8Array>();
  private pending = new Map<
    string,
    { promise: Promise<Uint8Array>; signal: AbortSignal }
  >();
  private controller = new AbortController();
  private version: string | null = null;
  private queued: QueuedRange[] = [];
  private readonly persistent: BoundedImageRangeCache;
  requestCount = 0;
  constructor(
    readonly url: string,
    private readonly blob?: Blob,
    private readonly previewOnly = false,
    seed?: NativeSeed
  ) {
    this.persistent = new BoundedImageRangeCache(url);
    if (seed) {
      this.bootstrap = seed.bootstrap;
      this.version = seed.version;
      this.cache.set(0, seed.bootstrap.bytes);
      this.opened = Promise.resolve(seed.bootstrap);
    }
  }
  get localFile() {
    return this.blob;
  }
  /** Complete L4 prefix for worker thumbnails; never requests enhancement bytes. */
  get previewFile(): Blob | undefined {
    return this.bootstrap
      ? new Blob(
          [
            new Uint8Array(
              this.bootstrap.bytes.subarray(
                0,
                this.bootstrap.layout.previewPrefixEnd
              )
            ),
          ],
          { type: "image/avif" }
        )
      : undefined;
  }
  get compressedBytes() {
    return [...this.cache.values()].reduce((n, b) => n + b.length, 0);
  }
  get availableRanges(): AvifRange[] {
    return [...this.cache].map(([offset, bytes]) => ({
      offset,
      length: bytes.length,
    }));
  }
  private options(options: NativeReadOptions): NativeReadOptions {
    return {
      priority: options.priority ?? this.priority,
      prefetchBudget: options.prefetchBudget ?? this.prefetchBudget,
    };
  }
  open(signal: AbortSignal, options: NativeReadOptions = {}) {
    signal.throwIfAborted();
    if (this.controller.signal.aborted)
      throw (
        this.controller.signal.reason ?? Error("AVIF file source was released")
      );
    this.opened ??= this.load(signal, this.options(options)).catch((error) => {
      this.opened = null;
      throw error;
    });
    return waitFor(this.opened, signal);
  }
  private async load(
    signal: AbortSignal,
    options: NativeReadOptions
  ): Promise<NativeAvifBootstrap> {
    const combined = AbortSignal.any([signal, this.controller.signal]);
    let bytes = new Uint8Array(),
      layout: NativeAvifLayout | null = null;
    if (this.blob) {
      bytes = new Uint8Array(
        await this.blob.slice(0, Math.min(this.blob.size, 65536)).arrayBuffer()
      );
      const end = avifMetadataEnd(bytes);
      if (!end) throw new NativeAvifFormatError("AVIF front metadata missing");
      if (end > bytes.length)
        bytes = new Uint8Array(await this.blob.slice(0, end).arrayBuffer());
      layout = requireNativeLayout(bytes);
      if (
        !layout ||
        layout.previewPrefixEnd > MAX_RANGE_BYTES ||
        layout.previewPrefixEnd > this.blob.size ||
        (!this.previewOnly && layout.fileBytes > this.blob.size)
      )
        throw new NativeAvifFormatError("Unsupported native AVIF bootstrap");
      bytes = new Uint8Array(
        await this.blob.slice(0, layout.previewPrefixEnd).arrayBuffer()
      );
    } else {
      void this.persistent.ensureKnownRanges(combined).catch(() => undefined);
      const budget = options.prefetchBudget;
      // Hold a bounded allowance before dispatch; release its unused portion.
      // A streaming GET cannot bound bytes already in browser/network buffers.
      const allowance = Math.min(
        MAX_RANGE_BYTES,
        budget?.remainingBytes ?? MAX_RANGE_BYTES,
        budget?.group?.remainingBytes ?? MAX_RANGE_BYTES
      );
      if (!Number.isSafeInteger(allowance) || allowance < 1)
        throw new ImagePrefetchBudgetExceeded();
      let reserved = false,
        received = 0;
      try {
        await transport.streamPrefix({
          url: this.url,
          signal: combined,
          priority: options.priority,
          maxBytes: allowance,
          onRequest: () => {
            reserveImagePrefetchBytes(budget, allowance);
            reserved = true;
            this.requestCount++;
          },
          onResponse: (response) => this.checkRepresentation(response),
          onBytes: (count) => {
            received = count;
          },
          onChunk: (chunk) => {
            bytes = concatenateAvifBytes(bytes, chunk);
            const end = avifMetadataEnd(bytes);
            if (end !== null && bytes.length >= end && !layout) {
              layout = requireNativeLayout(bytes);
              if (!layout)
                throw new NativeAvifFormatError(
                  "This AVIF has no native four-layer grid"
                );
              if (layout.previewPrefixEnd > MAX_RANGE_BYTES)
                throw new NativeAvifFormatError(
                  "Native AVIF bootstrap exceeds four MiB"
                );
              if (layout.previewPrefixEnd > allowance)
                throw new ImagePrefetchBudgetExceeded();
            }
            return !!layout && bytes.length >= layout.previewPrefixEnd;
          },
        });
      } catch (error) {
        if (budget && received > allowance)
          throw new ImagePrefetchBudgetExceeded();
        throw error;
      } finally {
        if (reserved && budget) {
          const unused = Math.max(0, allowance - received);
          budget.remainingBytes += unused;
          if (budget.group) budget.group.remainingBytes += unused;
        }
      }
    }
    combined.throwIfAborted();
    if (!layout) throw new NativeAvifFormatError("Native AVIF index missing");
    if (bytes.length > layout.fileBytes)
      bytes = bytes.subarray(0, layout.fileBytes);
    const bootstrap = { bytes, layout, document: documentFor(bytes, layout) };
    this.cache.set(0, bytes);
    this.persist(0, bytes);
    return (this.bootstrap = bootstrap);
  }
  private reserve(ranges: readonly AvifRange[], options: NativeReadOptions) {
    reserveImagePrefetchBytes(
      options.prefetchBudget,
      ranges.reduce((n, r) => n + r.length, 0)
    );
    this.requestCount++;
  }
  private checkRepresentation(response: Response) {
    const coding = response.headers.get("Content-Encoding");
    if (coding && coding !== "identity")
      throw new AvifRepresentationError(
        "AVIF byte ranges require an unchanged representation"
      );
    const version =
      response.headers.get("ETag") ?? response.headers.get("Last-Modified");
    if (this.version && this.version !== version) {
      const error = new AvifAssetChangedError();
      this.controller.abort(error);
      this.cache.clear();
      this.bootstrap = null;
      this.pending.clear();
      throw error;
    }
    this.version ??= version;
  }
  private persist(offset: number, bytes: Uint8Array) {
    if (this.version && !this.blob)
      void this.persistent
        .put(offset, bytes, this.version)
        .catch(() => undefined);
  }
  private retain(offset: number, bytes: Uint8Array) {
    this.cache.delete(offset);
    this.cache.set(offset, bytes);
    while (this.compressedBytes > 8 * 1024 * 1024 && this.cache.size > 1) {
      const at = [...this.cache.keys()].find((k) => k !== 0);
      if (at === undefined) break;
      this.cache.delete(at);
    }
  }
  async read(
    offset: number,
    length: number,
    signal: AbortSignal,
    options: NativeReadOptions = {}
  ): Promise<Uint8Array> {
    const settings = this.options(options);
    const boot = await this.open(signal, settings);
    signal.throwIfAborted();
    this.controller.signal.throwIfAborted();
    if (
      !Number.isSafeInteger(offset) ||
      !Number.isSafeInteger(length) ||
      offset < 0 ||
      length < 1 ||
      length > MAX_RANGE_BYTES ||
      offset + length > boot.layout.fileBytes
    )
      throw Error("Invalid native AVIF range");
    const key = `${offset}:${length}`,
      pending = this.pending.get(key);
    if (pending && !pending.signal.aborted)
      return waitFor(pending.promise, signal);
    const request = this.readOnce(offset, length, signal, settings).finally(
      () => {
        if (this.pending.get(key)?.promise === request)
          this.pending.delete(key);
      }
    );
    this.pending.set(key, { promise: request, signal });
    return request;
  }
  /** Batch misses through the same adaptive transport; publish each finished range immediately. */
  async readRanges(
    ranges: readonly AvifRange[],
    signal: AbortSignal,
    options: NativeReadOptions,
    accept: (range: AvifRange, bytes: Uint8Array) => void
  ) {
    await Promise.all(
      ranges.map(async (range) => {
        const bytes = await this.read(
          range.offset,
          range.length,
          signal,
          options
        );
        signal.throwIfAborted();
        accept(range, bytes);
      })
    );
  }
  private async diskRange(offset: number, length: number, signal: AbortSignal) {
    if (!this.version || this.blob) return undefined;
    const known = this.persistent.knownRanges(this.version);
    if (
      known &&
      known.validUntil > Date.now() &&
      !known.ranges.some(
        (r) => r.offset <= offset && r.offset + r.length >= offset + length
      )
    )
      return undefined;
    const bytes = await this.persistent
      .get(offset, length, this.version, signal)
      .catch(() => undefined);
    signal.throwIfAborted();
    this.controller.signal.throwIfAborted();
    return bytes;
  }
  private async readOnce(
    offset: number,
    length: number,
    signal: AbortSignal,
    options: NativeReadOptions
  ) {
    const output = new Uint8Array(length),
      end = offset + length;
    let at = offset;
    while (at < end) {
      signal.throwIfAborted();
      this.controller.signal.throwIfAborted();
      let covered: { start: number; bytes: Uint8Array } | undefined,
        next = end;
      for (const [start, bytes] of this.cache) {
        if (
          start <= at &&
          start + bytes.length > at &&
          (!covered ||
            start + bytes.length > covered.start + covered.bytes.length)
        )
          covered = { start, bytes };
        else if (start > at) next = Math.min(next, start);
      }
      if (covered) {
        const right = Math.min(end, covered.start + covered.bytes.length);
        output.set(
          covered.bytes.subarray(at - covered.start, right - covered.start),
          at - offset
        );
        at = right;
        continue;
      }
      let bytes = this.blob
        ? new Uint8Array(await this.blob.slice(at, next).arrayBuffer())
        : await this.diskRange(at, next - at, signal);
      if (!bytes) bytes = await this.queueRange(at, next - at, signal, options);
      signal.throwIfAborted();
      this.controller.signal.throwIfAborted();
      if (bytes.length !== next - at)
        throw Error("Incomplete native AVIF extent");
      this.retain(at, bytes);
      output.set(bytes, at - offset);
      at = next;
    }
    return output;
  }
  private queueRange(
    offset: number,
    length: number,
    signal: AbortSignal,
    options: NativeReadOptions
  ) {
    return new Promise<Uint8Array>((resolve, reject) => {
      const schedule = this.queued.length === 0;
      this.queued.push({
        offset,
        length,
        signal,
        options,
        output: new Uint8Array(length),
        received: 0,
        resolve,
        reject,
      });
      if (schedule) queueMicrotask(() => this.flushRanges());
    });
  }
  private flushRanges() {
    const queued = this.queued.splice(0);
    while (queued.length) {
      const first = queued.shift()!;
      const group = [first];
      for (let i = queued.length - 1; i >= 0; i--) {
        const next = queued[i];
        if (
          next.signal === first.signal &&
          next.options.priority === first.options.priority &&
          next.options.prefetchBudget === first.options.prefetchBudget
        )
          group.push(...queued.splice(i, 1));
      }
      const combined = AbortSignal.any([first.signal, this.controller.signal]);
      void transport
        .read({
          url: this.url,
          ranges: group.map(({ offset, length }) => ({ offset, length })),
          signal: combined,
          priority: first.options.priority,
          preferSingle: group.length <= 2,
          onRequest: (ranges) => this.reserve(ranges, first.options),
          onResponse: (response) => this.checkRepresentation(response),
          onPart: (range, bytes) => {
            combined.throwIfAborted();
            this.persist(range.offset, bytes);
            for (const item of group) {
              const left = Math.max(item.offset, range.offset),
                right = Math.min(
                  item.offset + item.length,
                  range.offset + bytes.length
                );
              if (right <= left) continue;
              item.output.set(
                bytes.subarray(left - range.offset, right - range.offset),
                left - item.offset
              );
              item.received += right - left;
              if (item.received === item.length) item.resolve(item.output);
            }
          },
        })
        .then(
          () => {
            for (const item of group)
              if (item.received !== item.length)
                item.reject(Error("Incomplete native AVIF extent"));
          },
          (error) => {
            for (const item of group) item.reject(error);
          }
        );
    }
  }
  dispose() {
    this.controller.abort(Error("AVIF file source was released"));
    this.cache.clear();
    this.pending.clear();
    this.bootstrap = null;
  }
}
export const getRegisteredNativeAvif = (url: string) =>
  sources.get(canonical(url));
export async function openStandaloneAvif(
  input: Blob | string,
  signal: AbortSignal
) {
  const local = typeof input !== "string",
    url = local ? URL.createObjectURL(input) : canonical(input);
  const source =
    sources.get(url) ??
    new NativeAvifByteSource(url, local ? input : undefined);
  sources.set(url, source);
  leases.set(url, (leases.get(url) ?? 0) + 1);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const count = (leases.get(url) ?? 1) - 1;
    if (count) {
      leases.set(url, count);
      return;
    }
    leases.delete(url);
    source.dispose();
    sources.delete(url);
    if (local) URL.revokeObjectURL(url);
  };
  try {
    const bootstrap = await source.open(signal);
    if (!bootstrap.document)
      throw Error(
        "Diese AVIF enthält keine vollständigen Oblique-Kamerametadaten."
      );
    return { url, source, ...bootstrap, release };
  } catch (error) {
    release();
    throw error;
  }
}

export const nativeLevelEntry = (
  bootstrap: NativeAvifBootstrap,
  level: number
) => {
  const index = bootstrap.layout.levels.get(level);
  if (!index) throw Error("Missing native AVIF level");
  return {
    offset: 0,
    length: Math.max(
      bootstrap.layout.previewPrefixEnd,
      ...index.cells.flatMap((c) => c.ranges).map((r) => r.offset + r.length)
    ),
    ...index.dimensions,
    scale:
      index.dimensions.width /
      (bootstrap.document?.pixelMapping.calibrationDimensions[0] ??
        bootstrap.layout.index.dimensions.width),
  };
};

/** A worker borrows a structured-cloned File handle under the existing asset URL. */
export const registerNativeAvifBlob = (
  url: string,
  blob: Blob,
  options?: { previewOnly?: boolean }
) => {
  const key = canonical(url),
    source =
      sources.get(key) ??
      new NativeAvifByteSource(key, blob, options?.previewOnly === true);
  sources.set(key, source);
  leases.set(key, (leases.get(key) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const count = (leases.get(key) ?? 1) - 1;
    if (count) {
      leases.set(key, count);
      return;
    }
    leases.delete(key);
    sources.delete(key);
    source.dispose();
  };
};
