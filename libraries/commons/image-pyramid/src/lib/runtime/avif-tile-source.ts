import {
  getRegisteredNativeAvif,
  nativeLevelEntry,
  probeNativeAvif,
  NativeAvifByteSource,
} from "./native-avif-byte-source";
import {
  AvifAssetChangedError,
  AvifRepresentationError,
} from "./avif-source-errors";
export {
  AvifAssetChangedError,
  AvifHttpError,
  AvifRepresentationError,
  NativeAvifFormatError,
} from "./avif-source-errors";
import type { DevicePixels } from "@carma-units";
import {
  makeAvifTile,
  parseAvifGridIndex,
  type AvifGridIndex,
  type AvifItem,
  type AvifRange,
} from "../core/avif-grid-index";
import type { ImageLevel } from "../core/image-level-plan";
import { sharedAvifRangeTransport } from "./avif-range-transport";
import { BoundedImageRangeCache } from "./bounded-image-range-cache";
import {
  reserveImagePrefetchBytes,
  type ImagePrefetchBudget,
} from "./image-tile-source";
import type {
  ImagePyramid,
  ImageTileRef,
  ImageTileSource,
} from "./image-tile-source";

type LevelEntry = {
  offset: number;
  length: number;
  width: number;
  height: number;
  cellsIndex?: { offset: number; length: number };
};
type PyramidIndex = {
  schema: 1;
  format: "avif-independent-pyramid";
  baseLevel: 0 | 1;
  sourceSensorDimensions: [number, number];
  tileEdge?: number;
  levels: Record<string, LevelEntry>;
};
type CellRecord = { x: number; y: number; itemId: number; ranges: AvifRange[] };
type LevelHeader = { index: AvifGridIndex; items: Map<number, AvifItem> };
type LevelState = {
  entry: LevelEntry;
  tileEdge: number;
  cells: Map<string, CellRecord>;
  header?: Promise<LevelHeader>;
  parsedHeader?: LevelHeader;
};

const PYRAMID_UUID = "9264b9097b6840af91dcb95a8d3a1b80";
const HEAD_BYTES = 16384;
const INDEX_BYTES = 4096;
const MAX_REQUEST_BYTES = 4 * 1024 * 1024;
/** Shared queue: speculative image pools cannot multiply HTTP concurrency. */
const rangeTransport = sharedAvifRangeTransport;
/** Levels this small are fetched whole: header and every cell in one request. */
const WHOLE_LEVEL_BYTES = 512 * 1024;

const boxHeader = (bytes: Uint8Array, at: number) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let size = view.getUint32(at);
  const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
  let headerBytes = 8;
  if (size === 1) {
    size = Number(view.getBigUint64(at + 8));
    headerBytes = 16;
  }
  if (!Number.isSafeInteger(size) || size < headerBytes)
    throw new Error("Invalid AVIF box size");
  return { size, type, headerBytes };
};

const cellKey = (col: number, row: number) => `${col}:${row}`;
const tileKey = ({ level, col, row }: ImageTileRef) => `${level}:${col}:${row}`;

/**
 * Range reader for single-file AVIF pyramids: one independent AVIF per level,
 * an index UUID box and absolute per-cell tables. No decoded state is kept here.
 */
export class AvifTileSource implements ImageTileSource {
  readonly kind = "avif" as const;
  priority: "high" | "low" = "high";
  prefetchBudget?: ImagePrefetchBudget;
  private nativeSource: NativeAvifByteSource | undefined;
  private ownsNativeSource = false;
  private version: string | null = null;
  private head: Uint8Array | null = null;
  private pyramid: Promise<ImagePyramid> | null = null;
  private readonly levels = new Map<number, LevelState>();
  private readonly payloads = new Map<string, Uint8Array>();
  private readonly pending = new Map<string, Promise<void>>();
  private payloadBytes = 0;
  private requests = 0;
  private readonly persistent: BoundedImageRangeCache;
  private readonly controller = new AbortController();
  /** Tile downloads only; replaced on pause so the pyramid index survives. */
  private downloads = new AbortController();

  constructor(
    readonly url: string,
    private readonly options: {
      maxCompressedBytes?: number;
      /** Known producer layout: stream the L4 prefix in the initial GET. */
      format?: "native";
      /** Limit metadata and available levels for a dedicated coarse source only. */
      allowedLevels?: readonly number[];
    } = {}
  ) {
    this.persistent = new BoundedImageRangeCache(url);
  }

  get compressedBytes() {
    return this.nativeSource
      ? this.nativeSource.compressedBytes + this.payloadBytes
      : this.payloadBytes;
  }
  get requestCount() {
    return this.requests + (this.nativeSource?.requestCount ?? 0);
  }

  open(signal: AbortSignal): Promise<ImagePyramid> {
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
    onTileReady?: (tile: ImageTileRef) => void
  ): Promise<void> {
    await this.open(signal);
    signal.throwIfAborted();
    const byLevel = new Map<number, ImageTileRef[]>();
    for (const tile of tiles) {
      if (this.hasBytes(tile)) onTileReady?.(tile);
      else byLevel.set(tile.level, [...(byLevel.get(tile.level) ?? []), tile]);
    }
    const downloadSignal = this.downloads.signal;
    const parts: {
      tile: ImageTileRef;
      ranges: AvifRange[];
      header: Promise<LevelHeader>;
    }[] = [];
    const waits: Promise<unknown>[] = [];
    const ready = (tile: ImageTileRef) => {
      if (!signal.aborted && !downloadSignal.aborted && this.hasBytes(tile))
        onTileReady?.(tile);
    };
    for (const [level, refs] of byLevel) {
      const state = this.levels.get(level);
      if (!state) throw new RangeError(`No AVIF level ${level}`);
      if (!this.nativeSource && state.entry.length <= WHOLE_LEVEL_BYTES) {
        waits.push(
          this.fetchWholeLevel(level, state, downloadSignal, priority).then(
            () => refs.forEach(ready)
          )
        );
        continue;
      }
      // Begin headers before payload dispatch; decoder slots never wait for HTTP.
      const header = this.levelHeader(level, state, downloadSignal, priority);
      waits.push(header);
      for (const tile of refs) {
        const key = tileKey(tile);
        const cell = state.cells.get(cellKey(tile.col, tile.row));
        if (!cell) throw new RangeError(`No AVIF cell ${key}`);
        if (this.payloads.has(key)) waits.push(header.then(() => ready(tile)));
        else if (!this.pending.has(key))
          parts.push({ tile, ranges: cell.ranges, header });
      }
    }
    if (parts.length)
      waits.push(this.fetchParts(parts, downloadSignal, priority));
    for (const refs of byLevel.values())
      for (const tile of refs) {
        const pending = this.pending.get(tileKey(tile));
        if (pending) waits.push(pending.then(() => ready(tile)));
      }
    await abortable(Promise.all(waits), signal);
  }

  async decode(tile: ImageTileRef, signal: AbortSignal): Promise<ImageBitmap> {
    await this.open(signal);
    const state = this.levels.get(tile.level);
    const cell = state?.cells.get(cellKey(tile.col, tile.row));
    if (!state || !cell) throw new RangeError(`No AVIF cell ${tileKey(tile)}`);
    const key = tileKey(tile);
    if (!this.payloads.has(key)) await this.fetch([tile], signal);
    const header = await this.levelHeader(tile.level, state, signal);
    const payload = this.payloads.get(key);
    if (!payload)
      throw new Error(`AVIF cell ${key} was evicted before decoding`);
    this.payloads.delete(key);
    this.payloads.set(key, payload);
    const item = header.items.get(cell.itemId) ?? header.index.primary;
    const file = makeAvifTile(header.index, item, payload);
    signal.throwIfAborted();
    return createImageBitmap(
      new Blob([new Uint8Array(file)], { type: "image/avif" })
    );
  }

  pause() {
    this.downloads.abort();
    this.downloads = new AbortController();
    this.pending.clear();
    for (const state of this.levels.values())
      if (!state.parsedHeader) state.header = undefined;
  }

  dispose() {
    if (this.ownsNativeSource) this.nativeSource?.dispose();
    this.nativeSource = undefined;
    this.controller.abort();
    this.downloads.abort();
    this.payloads.clear();
    this.payloadBytes = 0;
  }

  private async load(signal: AbortSignal): Promise<ImagePyramid> {
    this.nativeSource = getRegisteredNativeAvif(this.url);
    if (this.nativeSource) return this.loadNative(signal);
    if (this.options.format === "native") {
      this.nativeSource = new NativeAvifByteSource(this.url);
      this.ownsNativeSource = true;
      return this.loadNative(signal);
    }
    // Inventory disk storage while the mandatory revalidation is in flight.
    void this.persistent.ensureKnownRanges(signal).catch(() => undefined);
    const head = await this.read(0, HEAD_BYTES, signal, {
      revalidate: true,
      allowShort: true,
    });
    this.head = head;
    const native = await probeNativeAvif(
      this.url,
      head,
      (offset, length) => this.read(offset, length, signal),
      signal,
      () => this.version
    );
    if (signal.aborted) {
      native?.dispose();
      signal.throwIfAborted();
    }
    if (native) {
      this.head = null;
      this.nativeSource = native;
      this.ownsNativeSource = true;
      return this.loadNative(signal);
    }
    let offset = 0;
    let indexBytes: Uint8Array | null = null;
    let indexHeaderBytes = 0;
    for (let count = 0; count < 64 && !indexBytes; count++) {
      // Read a remote box header and potential UUID payload together. The first
      // head often already contains the whole index; reuse it without refetching.
      const bytes =
        offset + 32 + INDEX_BYTES <= head.length
          ? head.subarray(offset)
          : offset + 16 <= head.length &&
            String.fromCharCode(...head.subarray(offset + 4, offset + 8)) !==
              "uuid"
          ? head.subarray(offset)
          : await this.read(offset, 32 + INDEX_BYTES, signal, {
              allowShort: true,
            });
      const box = boxHeader(bytes, 0);
      if (count === 0 && box.type !== "ftyp")
        throw new Error("AVIF ftyp missing");
      if (box.type === "uuid") {
        const headerBytes = box.headerBytes + 16;
        const id = Array.from(
          bytes.subarray(box.headerBytes, headerBytes),
          (v) => v.toString(16).padStart(2, "0")
        ).join("");
        if (id === PYRAMID_UUID) {
          indexBytes = bytes.subarray(0, box.size);
          indexHeaderBytes = headerBytes;
        }
      }
      offset += box.size;
    }
    if (!indexBytes) throw new Error("AVIF pyramid index missing");
    const index = JSON.parse(
      new TextDecoder()
        // UUID boxes may also own the following cell tables. Only the fixed
        // JSON reservation belongs to this document, even in a coalesced read.
        .decode(
          indexBytes.subarray(indexHeaderBytes, indexHeaderBytes + INDEX_BYTES)
        )
        .replace(/\0+$/, "")
    ) as PyramidIndex;
    if (
      index.schema !== 1 ||
      index.format !== "avif-independent-pyramid" ||
      !index.levels?.[index.baseLevel] ||
      index.sourceSensorDimensions?.length !== 2
    )
      throw new Error("Unsupported AVIF pyramid");
    const entries = Object.entries(index.levels)
      .map(([level, entry]) => ({ level: Number(level), entry }))
      .filter(({ level }) => Number.isSafeInteger(level) && level >= 0)
      .filter(
        ({ level }) =>
          !this.options.allowedLevels ||
          this.options.allowedLevels.includes(level)
      );
    const tables = entries.filter(({ entry }) => entry.cellsIndex);
    for (const span of mergeRanges(
      tables.map(({ entry }) => ({
        offset: entry.cellsIndex!.offset,
        length: entry.cellsIndex!.length,
      }))
    )) {
      const bytes = await this.read(span.offset, span.length, signal);
      for (const { level, entry } of tables) {
        const table = entry.cellsIndex!;
        if (
          table.offset < span.offset ||
          table.offset + table.length > span.offset + span.length
        )
          continue;
        const parsed = JSON.parse(
          new TextDecoder().decode(
            bytes.subarray(
              table.offset - span.offset,
              table.offset - span.offset + table.length
            )
          )
        ) as { level: number; tileEdge?: number; cells: CellRecord[] };
        if (parsed.level !== level)
          throw new Error("AVIF cell table level mismatch");
        this.levels.set(level, {
          entry,
          tileEdge: parsed.tileEdge ?? index.tileEdge ?? 512,
          cells: new Map(
            parsed.cells.map((cell) => [cellKey(cell.x, cell.y), cell])
          ),
        });
      }
    }
    for (const { level, entry } of entries)
      if (!this.levels.has(level)) {
        const state: LevelState = {
          entry,
          tileEdge: entry.width,
          cells: new Map(),
        };
        this.levels.set(level, state);
        await this.cellsFromHeader(level, state, signal);
      }
    const levels: ImageLevel[] = [...this.levels.entries()]
      .map(([level, { entry, tileEdge }]) => ({
        level,
        width: entry.width as DevicePixels,
        height: entry.height as DevicePixels,
        tileWidth: Math.min(tileEdge, entry.width) as DevicePixels,
        tileHeight: Math.min(tileEdge, entry.height) as DevicePixels,
        cols: Math.ceil(entry.width / Math.min(tileEdge, entry.width)),
        rows: Math.ceil(entry.height / Math.min(tileEdge, entry.height)),
      }))
      .sort((a, b) => a.level - b.level);
    const [width, height] = index.sourceSensorDimensions;
    return {
      native: { width: width as DevicePixels, height: height as DevicePixels },
      levels,
    };
  }

  private async loadNative(signal: AbortSignal): Promise<ImagePyramid> {
    const bootstrap = await this.nativeSource!.open(signal, {
      priority: this.priority,
      prefetchBudget: this.prefetchBudget,
    });
    const { layout } = bootstrap;
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
      const items = new Map(index.cells.map((c) => [c.id, c]));
      this.levels.set(level, {
        entry: nativeLevelEntry(bootstrap, level),
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

  /** Files without absolute cell tables describe cells only in each level's grid header. */
  private async cellsFromHeader(
    level: number,
    state: LevelState,
    signal: AbortSignal
  ) {
    const { index } = await this.levelHeader(level, state, signal);
    const cells = index.cells.length ? index.cells : [index.primary];
    const edge = cells[0].properties.find((p) => p.type === "ispe");
    const tileEdge = edge
      ? new DataView(Uint8Array.from(edge.bytes).buffer).getUint32(12)
      : state.entry.width;
    const cols = Math.ceil(state.entry.width / tileEdge);
    state.tileEdge = tileEdge;
    cells.forEach((item, i) =>
      state.cells.set(cellKey(i % cols, Math.floor(i / cols)), {
        x: i % cols,
        y: Math.floor(i / cols),
        itemId: item.id,
        ranges: item.ranges.map((r) => ({
          offset: r.offset + state.entry.offset,
          length: r.length,
        })),
      })
    );
  }

  private parseHeader(state: LevelState, bytes: Uint8Array): LevelHeader {
    const index = parseAvifGridIndex(bytes);
    if (
      index.dimensions.width !== state.entry.width ||
      index.dimensions.height !== state.entry.height
    )
      throw new Error("AVIF level dimensions differ from the pyramid index");
    const items = new Map<number, AvifItem>([
      [index.primary.id, index.primary],
    ]);
    for (const cell of index.cells) items.set(cell.id, cell);
    return (state.parsedHeader = { index, items });
  }

  private levelHeader(
    level: number,
    state: LevelState,
    signal: AbortSignal,
    priority = this.priority
  ) {
    if (state.parsedHeader) return Promise.resolve(state.parsedHeader);
    if (!state.header) {
      const request = (async () => {
        let bytes =
          state.entry.offset === 0 && this.head
            ? this.head
            : await this.read(
                state.entry.offset,
                Math.min(8192, state.entry.length),
                signal,
                { priority }
              );
        for (let at = 0; at + 8 <= bytes.length; ) {
          const box = boxHeader(bytes, at);
          if (box.type === "meta" && at + box.size > bytes.length) {
            if (at + box.size > Math.min(256 * 1024, state.entry.length))
              throw new Error("AVIF level metadata exceeds budget");
            bytes = concat([
              bytes,
              await this.read(
                state.entry.offset + bytes.length,
                at + box.size - bytes.length,
                signal,
                { priority }
              ),
            ]);
            break;
          }
          if (box.type === "meta") break;
          at += box.size;
        }
        signal.throwIfAborted();
        return this.parseHeader(state, bytes);
      })();
      state.header = request;
      void request.catch(() => {
        if (state.header === request) state.header = undefined;
      });
    }
    return abortable(state.header, signal);
  }

  private fetchWholeLevel(
    level: number,
    state: LevelState,
    signal: AbortSignal,
    priority: "high" | "low"
  ) {
    const key = `${level}:whole`;
    let request = this.pending.get(key);
    if (!request) {
      const tracked = (async () => {
        const bytes = await this.read(
          state.entry.offset,
          state.entry.length,
          signal,
          { priority }
        );
        signal.throwIfAborted();
        const header = state.parsedHeader ?? this.parseHeader(state, bytes);
        state.header = Promise.resolve(header);
        for (const [cell, record] of state.cells) {
          const [col, row] = cell.split(":").map(Number);
          this.store(
            tileKey({ level, col, row }),
            concat(
              record.ranges.map((range) => {
                const start = range.offset - state.entry.offset;
                if (start < 0 || start + range.length > bytes.length)
                  throw new Error("AVIF cell outside its level");
                return bytes.subarray(start, start + range.length);
              })
            )
          );
        }
      })().finally(() => {
        if (this.pending.get(key) === tracked) this.pending.delete(key);
      });
      request = tracked;
      this.pending.set(key, request);
    }
    return abortable(request, signal);
  }

  private fetchParts(
    parts: {
      tile: ImageTileRef;
      ranges: AvifRange[];
      header: Promise<LevelHeader>;
    }[],
    signal: AbortSignal,
    priority: "high" | "low"
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
    return this.readParts(
      parts.flatMap((part) => part.ranges),
      signal,
      priority,
      accept
    )
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
    accept: (range: AvifRange, bytes: Uint8Array) => void
  ) {
    if (this.nativeSource) {
      try {
        await this.nativeSource.readRanges(
          ranges,
          signal,
          { priority, prefetchBudget: this.prefetchBudget },
          accept
        );
      } catch (error) {
        if (error instanceof AvifAssetChangedError) this.invalidateAsset(error);
        throw error;
      }
      return;
    }
    const known = this.version
      ? this.persistent.knownRanges(this.version)
      : undefined;
    const local =
      known && known.validUntil > Date.now()
        ? mergeRanges(known.ranges)
        : undefined;
    const remote: AvifRange[] = [];
    const cached: AvifRange[] = [];
    const misses: AvifRange[] = [];
    const fetchRanges = async (missing: AvifRange[]) => {
      if (!missing.length) return;
      await rangeTransport.read({
        url: this.url,
        ranges: missing,
        signal,
        priority,
        onRequest: (requested) => this.reserveRequest(requested),
        onResponse: (response) => this.checkVersion(response),
        onProgress: accept,
        onPart: (range, bytes) => {
          accept(range, bytes);
          this.persist(range.offset, bytes);
        },
      });
    };
    // Partition at cell extents before joining adjacent ranges: a newly exposed
    // tile must not cause its already cached neighbour to be downloaded again.
    for (const range of ranges) {
      const mayBeStored =
        !local ||
        local.some(
          (stored) =>
            stored.offset <= range.offset &&
            stored.offset + stored.length >= range.offset + range.length
        );
      if (this.version && mayBeStored) cached.push(range);
      else remote.push(range);
    }
    const lookups = mergeRanges(cached).map(async (span) => {
      const stored = await this.persistent
        .get(span.offset, span.length, this.version!, signal)
        .catch(() => undefined);
      signal.throwIfAborted();
      if (stored) accept(span, stored);
      else misses.push(span);
    });
    // Known network misses start immediately. Unknown inventory misses still
    // form one adaptive batch instead of falling back to one GET per extent.
    await Promise.all([
      fetchRanges(remote),
      Promise.all(lookups).then(() => fetchRanges(misses)),
    ]);
  }

  private reserveRequest(ranges: readonly AvifRange[]) {
    reserveImagePrefetchBytes(
      this.prefetchBudget,
      ranges.reduce((n, r) => n + r.length, 0)
    );
    this.requests++;
  }

  private checkVersion(response: Response) {
    const coding = response.headers.get("Content-Encoding");
    if (coding && coding !== "identity")
      throw new AvifRepresentationError(
        "AVIF byte ranges require an unchanged representation"
      );
    const version =
      response.headers.get("ETag") ?? response.headers.get("Last-Modified");
    if (this.version && version && version !== this.version) {
      const error = new AvifAssetChangedError();
      this.invalidateAsset(error);
      throw error;
    }
    this.version ??= version;
  }

  private invalidateAsset(error: AvifAssetChangedError) {
    this.controller.abort(error);
    this.downloads.abort(error);
    this.payloads.clear();
    this.payloadBytes = 0;
    for (const state of this.levels.values()) {
      state.header = undefined;
      state.parsedHeader = undefined;
    }
  }

  private persist(offset: number, bytes: Uint8Array) {
    if (this.version && offset !== 0)
      void this.persistent
        .put(offset, bytes, this.version)
        .catch(() => undefined);
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

  private async read(
    offset: number,
    length: number,
    signal: AbortSignal,
    options: {
      revalidate?: boolean;
      allowShort?: boolean;
      priority?: "high" | "low";
    } = {}
  ): Promise<Uint8Array> {
    signal.throwIfAborted();
    if (this.version && !options.revalidate) {
      const known = this.persistent.knownRanges(this.version);
      const local =
        known && known.validUntil > Date.now()
          ? mergeRanges(known.ranges)
          : undefined;
      const mayBeStored =
        !local ||
        local.some(
          (range) =>
            range.offset <= offset &&
            range.offset + range.length >= offset + length
        );
      // Do not defer an uncached floor/header behind detail requests merely
      // to confirm the same absence through an asynchronous storage lookup.
      if (mayBeStored) {
        const stored = await this.persistent
          .get(offset, length, this.version, signal)
          .catch(() => undefined);
        if (stored?.byteLength === length) return stored;
      }
    }
    let bytes: Uint8Array | undefined;
    await rangeTransport.read({
      url: this.url,
      ranges: [{ offset, length }],
      signal,
      cache: options.revalidate ? "no-cache" : "default",
      priority: options.priority ?? this.priority,
      allowShort: options.allowShort,
      onRequest: (ranges) => this.reserveRequest(ranges),
      onResponse: (response) => this.checkVersion(response),
      onPart: (range, part) => {
        if (
          (range.offset === offset && range.length === length) ||
          options.allowShort
        )
          bytes = part;
        else {
          bytes ??= new Uint8Array(length);
          bytes.set(part, range.offset - offset);
        }
        this.persist(range.offset, part);
      },
    });
    if (!bytes) throw new Error("Empty AVIF range response");
    return bytes;
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
