import type { DevicePixels } from "@carma-units";
import {
  makeAvifTile,
  type AvifGridIndex,
  type AvifItem,
  type AvifRange,
} from "../core/avif-grid-index";
import type { ImageLevel } from "../core/image-level-plan";
import { NativeAvifCellDecoders } from "./native-avif-cell-decoder";
import {
  getRegisteredNativeAvif,
  nativeLevelEntry,
  NativeAvifByteSource,
} from "./native-avif-byte-source";
import { AvifAssetChangedError } from "./avif-source-errors";
import type {
  ImagePyramid,
  ImageTileRef,
  ImageTileSource,
  ImageTileFetchContext,
  ImagePrefetchBudget,
} from "./image-tile-source";
export {
  AvifAssetChangedError,
  AvifHttpError,
  AvifRepresentationError,
  NativeAvifFormatError,
} from "./avif-source-errors";
type LevelEntry = {
  offset: number;
  length: number;
  width: number;
  height: number;
};
type CellRecord = { x: number; y: number; itemId: number; ranges: AvifRange[] };
type LevelHeader = { index: AvifGridIndex; items: Map<number, AvifItem> };
type LevelState = {
  entry: LevelEntry;
  tileEdge: number;
  cells: Map<string, CellRecord>;
  parsedHeader?: LevelHeader;
};
const MAX_REQUEST_BYTES = 4 * 1024 * 1024;
const cellKey = (col: number, row: number) => `${col}:${row}`;
const tileKey = ({ level, col, row }: ImageTileRef) => `${level}:${col}:${row}`;
/** Native four-layer AVIF source. One source owns its byte cache and bounded progressive cell contexts. */
export class AvifTileSource implements ImageTileSource {
  readonly kind = "avif" as const;
  priority: "high" | "low" = "high";
  prefetchBudget?: ImagePrefetchBudget;
  private nativeSource: NativeAvifByteSource | undefined;
  private ownsNativeSource = false;
  private nativeIndex: AvifGridIndex | null = null;
  private pyramid: Promise<ImagePyramid> | null = null;
  private readonly levels = new Map<number, LevelState>();
  private readonly payloads = new Map<string, Uint8Array>();
  private readonly pending = new Map<string, Promise<void>>();
  private payloadBytes = 0;
  private readonly controller = new AbortController();
  private downloads = new AbortController();
  private readonly decoders = new NativeAvifCellDecoders();
  constructor(
    readonly url: string,
    private readonly options: {
      maxCompressedBytes?: number;
      allowedLevels?: readonly number[];
    } = {}
  ) {}
  get cacheRevision() {
    return this.nativeSource?.cacheRevision;
  }
  get compressedBytes() {
    return (this.nativeSource?.compressedBytes ?? 0) + this.payloadBytes;
  }
  get requestCount() {
    return this.nativeSource?.requestCount ?? 0;
  }
  get decoderWorkingBytes() {
    return this.decoders.workingBytes;
  }
  configureDecoderWorkingBudget(bytes: number) {
    this.decoders.configureBudget(bytes);
  }
  trimDecoderWorkingTo(bytes: number) {
    return this.decoders.trimTo(bytes);
  }
  open(signal: AbortSignal): Promise<ImagePyramid> {
    if (signal.aborted) return Promise.reject(signal.reason);
    if (this.controller.signal.aborted)
      return Promise.reject(this.controller.signal.reason);
    this.pyramid ??= this.load(this.controller.signal);
    return abortable(this.pyramid, signal);
  }
  hasBytes(tile: ImageTileRef) {
    return (
      Boolean(this.levels.get(tile.level)?.parsedHeader) &&
      this.payloads.has(tileKey(tile))
    );
  }
  async fetch(
    tiles: readonly ImageTileRef[],
    signal: AbortSignal,
    priority: "high" | "low" = "high",
    onTileReady?: (tile: ImageTileRef) => void,
    context?: ImageTileFetchContext
  ): Promise<void> {
    const requestContext: ImageTileFetchContext = {
      prefetchBudget:
        context === undefined ? this.prefetchBudget : context.prefetchBudget,
    };
    await this.open(signal);
    signal.throwIfAborted();
    const downloadSignal = this.downloads.signal;
    const parts: {
      tile: ImageTileRef;
      ranges: AvifRange[];
      header: Promise<LevelHeader>;
    }[] = [];
    const waits: Promise<unknown>[] = [];
    for (const tile of tiles) {
      if (this.hasBytes(tile)) {
        onTileReady?.(tile);
        continue;
      }
      const state = this.levels.get(tile.level),
        cell = state?.cells.get(cellKey(tile.col, tile.row));
      if (!cell || !state?.parsedHeader)
        throw new RangeError(`No native AVIF cell ${tileKey(tile)}`);
      if (!this.pending.has(tileKey(tile)))
        parts.push({
          tile,
          ranges: cell.ranges,
          header: Promise.resolve(state.parsedHeader),
        });
    }
    if (parts.length)
      waits.push(
        this.fetchParts(parts, downloadSignal, priority, requestContext)
      );
    for (const tile of tiles) {
      const pending = this.pending.get(tileKey(tile));
      if (pending)
        waits.push(
          pending.then(() => {
            if (
              !signal.aborted &&
              !downloadSignal.aborted &&
              this.hasBytes(tile)
            )
              onTileReady?.(tile);
          })
        );
    }
    await abortable(Promise.all(waits), signal);
  }
  async decode(
    tile: ImageTileRef,
    signal: AbortSignal,
    context?: { retainProgressive?: boolean }
  ): Promise<ImageBitmap> {
    await this.open(signal);
    const state = this.levels.get(tile.level),
      cell = state?.cells.get(cellKey(tile.col, tile.row));
    if (!cell || !state?.parsedHeader)
      throw new RangeError(`No native AVIF cell ${tileKey(tile)}`);
    const key = tileKey(tile);
    if (!this.payloads.has(key)) await this.fetch([tile], signal);
    const payload = this.payloads.get(key);
    if (!payload)
      throw new Error(`AVIF cell ${key} was evicted before decoding`);
    this.payloads.delete(key);
    this.payloads.set(key, payload);
    const header = state.parsedHeader,
      item = header.items.get(cell.itemId)!;
    const fullIndex = this.nativeIndex!,
      fullCell = fullIndex.cells.find((c) => c.id === cell.itemId)!;
    const ispe = item.properties.find((p) => p.type === "ispe")!,
      dimensions = new DataView(Uint8Array.from(ispe.bytes).buffer);
    const fallback = async () => {
      signal.throwIfAborted();
      const file = makeAvifTile(header.index, item, payload);
      const bitmap = await createImageBitmap(
        new Blob([new Uint8Array(file)], { type: "image/avif" })
      );
      if (signal.aborted) {
        bitmap.close();
        signal.throwIfAborted();
      }
      return bitmap;
    };
    return this.decoders.decode(
      fullIndex,
      fullCell,
      payload,
      { width: dimensions.getUint32(12), height: dimensions.getUint32(16) },
      signal,
      fallback,
      context?.retainProgressive
    );
  }
  trimCompressedTo(maxBytes: number) {
    const limit = Math.max(0, maxBytes),
      ordered = [...this.payloads].sort(
        ([a], [b]) => Number(a.split(":")[0]) - Number(b.split(":")[0])
      );
    for (const [key, value] of ordered) {
      if (this.compressedBytes <= limit) break;
      this.payloads.delete(key);
      this.payloadBytes -= value.byteLength;
    }
    this.nativeSource?.trimCompressedTo(Math.max(0, limit - this.payloadBytes));
  }
  pause(options?: { retainDecoders?: boolean }) {
    this.downloads.abort();
    this.downloads = new AbortController();
    this.pending.clear();
    if (!options?.retainDecoders) this.decoders.trimTo(0);
  }
  dispose() {
    this.decoders.clear();
    if (this.ownsNativeSource) this.nativeSource?.dispose();
    this.nativeSource = undefined;
    this.nativeIndex = null;
    this.controller.abort();
    this.downloads.abort();
    this.payloads.clear();
    this.payloadBytes = 0;
  }
  private async load(signal: AbortSignal): Promise<ImagePyramid> {
    this.nativeSource = getRegisteredNativeAvif(this.url);
    if (!this.nativeSource) {
      this.nativeSource = new NativeAvifByteSource(this.url);
      this.ownsNativeSource = true;
    }
    return this.loadNative(signal, { prefetchBudget: this.prefetchBudget });
  }
  private async loadNative(
    signal: AbortSignal,
    context: ImageTileFetchContext
  ): Promise<ImagePyramid> {
    const bootstrap = await this.nativeSource!.open(signal, {
      priority: this.priority,
      prefetchBudget: context.prefetchBudget,
    });
    const { layout } = bootstrap;
    this.nativeIndex = layout.index;
    const levels: ImageLevel[] = [];
    for (const [level, index] of layout.levels) {
      if (
        this.options.allowedLevels &&
        !this.options.allowedLevels.includes(level)
      )
        continue;
      const cell = index.cells[0],
        ispe = cell.properties.find((p) => p.type === "ispe")!;
      const v = new DataView(Uint8Array.from(ispe.bytes).buffer),
        edgeX = v.getUint32(12),
        edgeY = v.getUint32(16);
      const items = new Map(index.cells.map((c) => [c.id, c])),
        entry = nativeLevelEntry(bootstrap, level);
      this.levels.set(level, {
        entry,
        tileEdge: edgeX,
        cells: new Map(
          index.cells.map((c, n) => [
            cellKey(n % layout.cols, Math.floor(n / layout.cols)),
            {
              x: n % layout.cols,
              y: Math.floor(n / layout.cols),
              itemId: c.id,
              ranges: c.ranges,
            },
          ])
        ),
        parsedHeader: { index, items },
      });
      levels.push({
        level,
        width: index.dimensions.width as DevicePixels,
        height: index.dimensions.height as DevicePixels,
        tileWidth: edgeX as DevicePixels,
        tileHeight: edgeY as DevicePixels,
        cols: layout.cols,
        rows: layout.rows,
        nativeScale: entry.nativeScale,
      });
    }
    const [width, height] = bootstrap.document?.pixelMapping
      .calibrationDimensions ?? [
      layout.index.dimensions.width,
      layout.index.dimensions.height,
    ];
    return {
      native: { width: width as DevicePixels, height: height as DevicePixels },
      levels,
    };
  }

  private fetchParts(
    parts: {
      tile: ImageTileRef;
      ranges: AvifRange[];
      header: Promise<LevelHeader>;
    }[],
    signal: AbortSignal,
    priority: "high" | "low",
    context: ImageTileFetchContext
  ): Promise<void> {
    const cells = parts.map((part) => {
      let resolve!: () => void;
      let reject!: (error: unknown) => void;
      const payload = new Promise<void>((yes, no) => {
        resolve = yes;
        reject = no;
      });
      const key = tileKey(part.tile);
      const tracked = Promise.all([payload, part.header])
        .then(() => undefined)
        .finally(() => {
          if (this.pending.get(key) === tracked) this.pending.delete(key);
        });
      this.pending.set(key, tracked);
      // The batch observes every tile even if its caller has already stopped waiting.
      void tracked.catch(() => undefined);
      return {
        key,
        resolve,
        reject,
        complete: false,
        pieces: part.ranges.map((range) => ({
          range,
          bytes: undefined as Uint8Array | undefined,
          covered: [] as AvifRange[],
        })),
      };
    });
    const accept = (range: AvifRange, bytes: Uint8Array) => {
      signal.throwIfAborted();
      for (const cell of cells) {
        if (cell.complete) continue;
        for (const piece of cell.pieces) {
          const left = Math.max(range.offset, piece.range.offset);
          const right = Math.min(
            range.offset + range.length,
            piece.range.offset + piece.range.length
          );
          if (right <= left) continue;
          piece.bytes ??= new Uint8Array(piece.range.length);
          piece.bytes.set(
            bytes.subarray(left - range.offset, right - range.offset),
            left - piece.range.offset
          );
          piece.covered = mergeRanges([
            ...piece.covered,
            { offset: left, length: right - left },
          ]);
        }
        if (
          cell.pieces.every(
            (piece) =>
              piece.covered.reduce((n, r) => n + r.length, 0) ===
              piece.range.length
          )
        ) {
          this.store(
            cell.key,
            concat(cell.pieces.map((piece) => piece.bytes!))
          );
          cell.complete = true;
          cell.resolve();
          // Do not retain another copy of completed cells behind slower siblings.
          for (const piece of cell.pieces) piece.bytes = undefined;
        }
      }
    };
    // Native cells share cumulative L4→L1 prefixes. Keep physical layers in
    // separate requests so a slow L1 part cannot hold back a ready L3 tile.
    // Dispatch all needed layers together; the byte source deduplicates shared
    // lower extents across concurrent underlay and target consumers.
    const reads = Promise.all(
      [4, 3, 2, 1].map((level) => {
        const ranges = parts.flatMap((part) =>
          part.ranges[4 - level] ? [part.ranges[4 - level]] : []
        );
        return ranges.length
          ? this.readParts(ranges, signal, priority, accept, context, level)
          : Promise.resolve();
      })
    );
    return reads
      .then(() => {
        if (cells.some((cell) => !cell.complete))
          throw new Error("Incomplete AVIF cells");
      })
      .catch((error) => {
        for (const cell of cells) cell.reject(error);
        throw error;
      });
  }

  private async readParts(
    ranges: readonly AvifRange[],
    signal: AbortSignal,
    priority: "high" | "low",
    accept: (range: AvifRange, bytes: Uint8Array) => void,
    context: ImageTileFetchContext,
    nativeLayer?: number
  ) {
    try {
      await this.nativeSource!.readRanges(
        ranges,
        signal,
        {
          priority,
          prefetchBudget: context.prefetchBudget,
          level: nativeLayer,
        },
        accept
      );
    } catch (error) {
      if (error instanceof AvifAssetChangedError) this.invalidateAsset(error);
      throw error;
    }
  }
  private invalidateAsset(error: AvifAssetChangedError) {
    this.decoders.clear();
    this.controller.abort(error);
    this.downloads.abort(error);
    this.payloads.clear();
    this.payloadBytes = 0;
    for (const state of this.levels.values()) state.parsedHeader = undefined;
  }
  private store(key: string, bytes: Uint8Array) {
    const limit = this.options.maxCompressedBytes ?? 64 * 1024 * 1024;
    const previous = this.payloads.get(key);
    if (previous) this.payloadBytes -= previous.byteLength;
    this.payloads.delete(key);
    // Own the bytes so a large merged response is not retained by one slice.
    this.payloads.set(
      key,
      bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
        ? bytes
        : bytes.slice()
    );
    this.payloadBytes += bytes.byteLength;
    for (const [oldest, value] of this.payloads) {
      if (this.payloadBytes <= limit) break;
      this.payloads.delete(oldest);
      this.payloadBytes -= value.byteLength;
    }
  }
}

/** Join overlapping or adjacent bytes only; sparse spans use multipart requests. */
export const mergeRanges = <T extends AvifRange>(
  ranges: readonly T[]
): AvifRange[] => {
  const sorted = [...ranges].sort((a, b) => a.offset - b.offset);
  const spans: AvifRange[] = [];
  for (const range of sorted) {
    const last = spans[spans.length - 1];
    const end = range.offset + range.length;
    if (
      last &&
      range.offset <= last.offset + last.length &&
      Math.max(end, last.offset + last.length) - last.offset <=
        MAX_REQUEST_BYTES
    )
      last.length = Math.max(end, last.offset + last.length) - last.offset;
    else spans.push({ offset: range.offset, length: range.length });
  }
  return spans;
};

const concat = (parts: readonly Uint8Array[]) => {
  if (parts.length === 1) return parts[0];
  const output = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let at = 0;
  for (const part of parts) {
    output.set(part, at);
    at += part.byteLength;
  }
  return output;
};

/** Let one caller stop waiting without cancelling shared work. */
export const abortable = <T>(
  promise: Promise<T>,
  signal: AbortSignal
): Promise<T> => {
  if (signal.aborted) {
    // The shared operation already exists; observe its eventual rejection even
    // when this caller has stopped waiting before subscribing.
    void promise.catch(() => undefined);
    return Promise.reject(signal.reason);
  }
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      }
    );
  });
};
