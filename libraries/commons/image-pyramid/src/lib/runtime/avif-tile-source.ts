import type { DevicePixels } from "@carma-units";
import {
  makeAvifTile,
  parseAvifGridIndex,
  type AvifGridIndex,
  type AvifItem,
  type AvifRange,
} from "../core/avif-grid-index";
import type { ImageLevel } from "../core/image-level-plan";
import { BoundedImageRangeCache } from "./bounded-image-range-cache";
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
type LevelState = {
  entry: LevelEntry;
  tileEdge: number;
  cells: Map<string, CellRecord>;
  header?: Promise<{ index: AvifGridIndex; items: Map<number, AvifItem> }>;
};

const PYRAMID_UUID = "9264b9097b6840af91dcb95a8d3a1b80";
const HEAD_BYTES = 16384;
const INDEX_BYTES = 4096;
const MAX_REQUEST_BYTES = 4 * 1024 * 1024;
/** Unrequested bytes worth downloading to save a request. */
const MERGE_GAP_BYTES = 64 * 1024;
/** Levels this small are fetched whole: header and every cell in one request. */
const WHOLE_LEVEL_BYTES = 512 * 1024;

export class AvifAssetChangedError extends Error {
  constructor() {
    super("AVIF asset changed while reading");
    this.name = "AvifAssetChangedError";
  }
}

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
    private readonly options: { maxCompressedBytes?: number } = {}
  ) {
    this.persistent = new BoundedImageRangeCache(url);
  }

  get compressedBytes() {
    return this.payloadBytes;
  }
  get requestCount() {
    return this.requests;
  }

  open(signal: AbortSignal): Promise<ImagePyramid> {
    this.pyramid ??= this.load(this.controller.signal);
    return abortable(this.pyramid, signal);
  }

  hasBytes(tile: ImageTileRef) {
    return this.payloads.has(tileKey(tile));
  }

  async fetch(
    tiles: readonly ImageTileRef[],
    signal: AbortSignal,
    priority: "high" | "low" = "high"
  ): Promise<void> {
    await this.open(signal);
    const byLevel = new Map<number, ImageTileRef[]>();
    for (const tile of tiles)
      if (!this.payloads.has(tileKey(tile)))
        byLevel.set(tile.level, [...(byLevel.get(tile.level) ?? []), tile]);
    const parts: { key: string; ranges: AvifRange[] }[] = [];
    const waits: Promise<void>[] = [];
    for (const [level, refs] of byLevel) {
      const state = this.levels.get(level);
      if (!state) continue;
      if (state.entry.length <= WHOLE_LEVEL_BYTES) {
        waits.push(this.fetchWholeLevel(level, state, signal, priority));
        continue;
      }
      for (const ref of refs) {
        const key = tileKey(ref);
        const inFlight = this.pending.get(key);
        if (inFlight) waits.push(inFlight);
        else {
          const cell = state.cells.get(cellKey(ref.col, ref.row));
          if (cell) parts.push({ key, ranges: cell.ranges });
        }
      }
    }
    if (parts.length) waits.push(this.fetchParts(parts, signal, priority));
    await Promise.all(waits);
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
  }

  dispose() {
    this.controller.abort();
    this.downloads.abort();
    this.payloads.clear();
    this.payloadBytes = 0;
  }

  private async load(signal: AbortSignal): Promise<ImagePyramid> {
    const head = await this.read(0, HEAD_BYTES, signal, {
      revalidate: true,
      allowShort: true,
    });
    this.head = head;
    await this.persistent.ensureKnownRanges(signal).catch(() => undefined);
    let offset = 0;
    let uuid: { at: number; size: number; headerBytes: number } | null = null;
    for (let count = 0; count < 64 && !uuid; count++) {
      const header =
        offset + 16 <= head.length
          ? head.subarray(offset, offset + 16)
          : await this.read(offset, 16, signal);
      const box = boxHeader(header, 0);
      if (count === 0 && box.type !== "ftyp")
        throw new Error("AVIF ftyp missing");
      if (box.type === "uuid")
        uuid = {
          at: offset,
          size: box.size,
          headerBytes: box.headerBytes + 16,
        };
      else offset += box.size;
    }
    if (!uuid) throw new Error("AVIF pyramid index missing");
    const indexBytes = await this.read(
      uuid.at,
      uuid.headerBytes + INDEX_BYTES,
      signal
    );
    const id = Array.from(
      indexBytes.subarray(uuid.headerBytes - 16, uuid.headerBytes),
      (v) => v.toString(16).padStart(2, "0")
    ).join("");
    if (id !== PYRAMID_UUID) throw new Error("Unsupported AVIF pyramid UUID");
    const index = JSON.parse(
      new TextDecoder()
        .decode(indexBytes.subarray(uuid.headerBytes))
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
      .filter(({ level }) => Number.isSafeInteger(level) && level >= 0);
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

  private levelHeader(level: number, state: LevelState, signal: AbortSignal) {
    state.header ??= (async () => {
      let bytes =
        state.entry.offset === 0 && this.head
          ? this.head
          : await this.read(
              state.entry.offset,
              Math.min(8192, state.entry.length),
              signal
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
              signal
            ),
          ]);
          break;
        }
        if (box.type === "meta") break;
        at += box.size;
      }
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
      return { index, items };
    })();
    state.header.catch(() => {
      state.header = undefined;
    });
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
      request = (async () => {
        const bytes = await this.read(
          state.entry.offset,
          state.entry.length,
          this.downloads.signal,
          {
            priority,
          }
        );
        state.header ??= Promise.resolve().then(() => {
          const index = parseAvifGridIndex(bytes);
          const items = new Map<number, AvifItem>([
            [index.primary.id, index.primary],
          ]);
          for (const cell of index.cells) items.set(cell.id, cell);
          return { index, items };
        });
        for (const [cell, record] of state.cells) {
          const [col, row] = cell.split(":").map(Number);
          this.store(
            tileKey({ level, col, row }),
            concat(
              record.ranges.map((r) =>
                bytes.subarray(
                  r.offset - state.entry.offset,
                  r.offset - state.entry.offset + r.length
                )
              )
            )
          );
        }
      })().finally(() => this.pending.delete(key));
      this.pending.set(key, request);
    }
    return abortable(request, signal);
  }

  private fetchParts(
    parts: { key: string; ranges: AvifRange[] }[],
    signal: AbortSignal,
    priority: "high" | "low"
  ): Promise<void> {
    const pieces = parts.flatMap((part) =>
      part.ranges.map((range, index) => ({ ...range, key: part.key, index }))
    );
    // Locally persisted cells are read alone; only missing ones are merged into network spans.
    const known = this.version
      ? this.persistent.knownRanges(this.version)
      : undefined;
    const local = known && known.validUntil > Date.now() ? known.ranges : [];
    const persisted = (piece: AvifRange) =>
      local.some(
        (r) =>
          r.offset <= piece.offset &&
          r.offset + r.length >= piece.offset + piece.length
      );
    const spans = [
      ...pieces
        .filter(persisted)
        .map(({ offset, length }) => ({ offset, length })),
      ...mergeRanges(pieces.filter((piece) => !persisted(piece))),
    ];
    const received = new Map<string, Uint8Array[]>();
    const requests = spans.map(async (span) => {
      const bytes = await this.read(
        span.offset,
        span.length,
        this.downloads.signal,
        { priority }
      );
      for (const piece of pieces)
        if (
          piece.offset >= span.offset &&
          piece.offset + piece.length <= span.offset + span.length
        ) {
          const chunks = received.get(piece.key) ?? [];
          chunks[piece.index] = bytes.subarray(
            piece.offset - span.offset,
            piece.offset - span.offset + piece.length
          );
          received.set(piece.key, chunks);
        }
    });
    const all = Promise.all(requests).then(() => {
      for (const part of parts) {
        const chunks = received.get(part.key);
        if (chunks && chunks.length === part.ranges.length)
          this.store(part.key, concat(chunks));
      }
    });
    const tracked = all.finally(() => {
      for (const part of parts)
        if (this.pending.get(part.key) === tracked)
          this.pending.delete(part.key);
    });
    for (const part of parts) this.pending.set(part.key, tracked);
    return abortable(tracked, signal);
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
      const stored = await this.persistent
        .get(offset, length, this.version, signal)
        .catch(() => undefined);
      if (stored?.byteLength === length) return stored;
    }
    this.requests++;
    const response = await fetch(this.url, {
      headers: { Range: `bytes=${offset}-${offset + length - 1}` },
      cache: options.revalidate ? "no-cache" : "default",
      signal,
      priority: options.priority ?? this.priority,
    });
    if (response.status !== 206) {
      await response.body?.cancel();
      throw new Error(
        `AVIF range request answered ${response.status}; refusing a full download`
      );
    }
    // Cross-origin responses expose Last-Modified; ETag only when the server allows it.
    const version =
      response.headers.get("ETag") ?? response.headers.get("Last-Modified");
    if (this.version && version && version !== this.version) {
      await response.body?.cancel();
      throw new AvifAssetChangedError();
    }
    this.version ??= version;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (
      bytes.byteLength > length ||
      (!options.allowShort && bytes.byteLength !== length)
    )
      throw new Error("AVIF range length mismatch");
    if (this.version && offset !== 0)
      void this.persistent
        .put(offset, bytes, this.version)
        .catch(() => undefined);
    return bytes;
  }
}

/** Sort and join ranges whose gaps are small, bounded per request. */
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
      range.offset - (last.offset + last.length) <= MERGE_GAP_BYTES &&
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
