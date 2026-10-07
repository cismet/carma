import type { DevicePixels } from "@carma-units";
import type { NativePreviewWindow } from "../../core/utils/native-preview-window";
import {
  parseAvifGridIndex,
  makeAvifTile,
  type AvifGridIndex,
  type AvifItem,
  type AvifRange,
} from "../../core/utils/avif-grid-index";
import { OffscreenCanvasPool } from "../utils/offscreen-canvas-pool";

type LevelEntry = {
  offset: number;
  length: number;
  width: number;
  height: number;
  scale: number;
  cellsIndex?: { offset: number; length: number };
};
type PyramidIndex = {
  schema: 1;
  format: "avif-independent-pyramid";
  baseLevel: 1;
  sourceSensorDimensions: [number, number];
  levels: Record<string, LevelEntry>;
};
type CellTable = {
  schema: 1;
  level: number;
  cells: { x: number; y: number; itemId: number; ranges: AvifRange[] }[];
};
export type AvifPreviewPage = {
  level: number;
  entry: LevelEntry;
  getWidth: () => number;
  getHeight: () => number;
};
type Grid = {
  index: AvifGridIndex;
  cols: number;
  edgeX: number;
  edgeY: number;
  absolute: Map<number, AvifRange[]>;
};
class AssetChanged extends Error {
  constructor() {
    super("AVIF asset changed during bounded read");
    this.name = "AvifAssetChangedError";
  }
}
const LIMIT = 8 * 1024 * 1024;
const concatenate = (parts: Uint8Array[]) => {
  const output = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let at = 0;
  for (const part of parts) {
    output.set(part, at);
    at += part.byteLength;
  }
  return output;
};

type PendingCell = {
  controller: AbortController;
  promise: Promise<{ bitmap: ImageBitmap; retained: boolean }>;
  consumers: number;
};
export type AvifWarmProgress = Readonly<{
  level: number;
  decodedCells: number;
  totalCells: number;
  completedLevels: number;
  totalLevels: number;
  residentBytes: number;
}>;

/** Existing preview worker backend: bounded native AVIF cell decode, no whole-photo bitmap. */
export class AvifPyramidPreviewSource {
  private index: PyramidIndex | null = null;
  private fileBytes = 0;
  private fileBytesInferred = false;
  private lastModified: string | null = null;
  private epoch = 0;
  private metadataRequest: Promise<PyramidIndex> | null = null;
  private metadataSignal: AbortSignal | null = null;
  private ranges = new Map<string, Uint8Array>();
  private rangeBytes = 0;
  private grids = new Map<number, Grid>();
  private bitmaps = new Map<string, ImageBitmap>();
  private bitmapBytes = 0;
  private pendingCells = new Map<string, PendingCell>();
  private decodedCells = new Map<number, number>();
  private decodeCanvases = new OffscreenCanvasPool({
    maxRetainedBytes: 4 * 1024 * 1024,
    maxRetainedCanvases: 1,
    contextOptions: { willReadFrequently: true },
  });
  private rangeLimit: number;
  private bitmapLimit: number;
  constructor(
    readonly url: string,
    budget = 64 * 1024 * 1024,
    readonly priority?: "low" | "high" | "auto"
  ) {
    this.rangeLimit = Math.min(32 * 1024 * 1024, budget / 3);
    this.bitmapLimit = Math.min(32 * 1024 * 1024, (budget * 2) / 3);
  }
  /** Admission threshold only: allocate decoded cells on demand, never a full-photo canvas. */
  setActiveCacheBudget(bytes = 768 * 1024 * 1024) {
    if (!Number.isSafeInteger(bytes) || bytes < 1)
      throw new RangeError("Invalid AVIF cache budget");
    this.rangeLimit = Math.min(32 * 1024 * 1024, bytes / 3);
    this.bitmapLimit = Math.min(512 * 1024 * 1024, (bytes * 2) / 3);
    this.trimResidentCaches();
  }
  /** Estimates retained encoded bytes + RGBA cells, excluding decoder scratch and GPU copies. */
  get residentBytes() {
    return this.rangeBytes + this.bitmapBytes;
  }
  get coverage() {
    return Object.keys(this.index?.levels ?? {})
      .map(Number)
      .sort((a, b) => b - a)
      .map((level) => {
        const totalCells = this.grids.get(level)?.index.cells.length ?? null;
        const decodedCells = this.decodedCells.get(level) ?? 0;
        return {
          level,
          decodedCells,
          totalCells,
          complete: totalCells !== null && decodedCells === totalCells,
        };
      });
  }
  get isFullyDecoded() {
    const levels = this.coverage;
    return levels.length > 0 && levels.every((level) => level.complete);
  }
  hasCached(page: AvifPreviewPage, bounds: [number, number, number, number]) {
    const grid = this.grids.get(page.level),
      entry = this.index?.levels[page.level];
    const [left, top, right, bottom] = bounds;
    if (
      !grid ||
      !entry ||
      entry !== page.entry ||
      !bounds.every(Number.isSafeInteger) ||
      left < 0 ||
      top < 0 ||
      right > entry.width ||
      bottom > entry.height ||
      right <= left ||
      bottom <= top
    )
      return false;
    for (
      let y = Math.floor(top / grid.edgeY);
      y < Math.ceil(bottom / grid.edgeY);
      y++
    )
      for (
        let x = Math.floor(left / grid.edgeX);
        x < Math.ceil(right / grid.edgeX);
        x++
      ) {
        const item = grid.index.cells[y * grid.cols + x];
        if (!item || !this.bitmaps.has(`${page.level}:${item.id}`))
          return false;
      }
    return true;
  }
  async warmAllLevels(
    nativeSize: { width: DevicePixels; height: DevicePixels },
    signal: AbortSignal,
    options: {
      onProgress?: (progress: AvifWarmProgress) => void;
      shouldYield?: () => boolean;
    } = {}
  ): Promise<void> {
    signal.throwIfAborted();
    const epoch = this.epoch,
      index = await this.metadata(signal);
    this.assertEpoch(epoch);
    if (
      index.sourceSensorDimensions[0] !== nativeSize.width ||
      index.sourceSensorDimensions[1] !== nativeSize.height
    )
      throw Error("AVIF sensor dimensions do not match camera calibration");
    const pause = async (milliseconds: number) => {
      await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
      signal.throwIfAborted();
      this.assertEpoch(epoch);
    };
    const waitForForeground = async () => {
      while (options.shouldYield?.()) await pause(4);
      signal.throwIfAborted();
      this.assertEpoch(epoch);
    };
    const levels = Object.entries(index.levels).sort(
      ([a], [b]) => Number(b) - Number(a)
    );
    for (const [number, entry] of levels) {
      await waitForForeground();
      const level = Number(number);
      if (
        level < 1 ||
        entry.width !== Math.ceil(nativeSize.width * entry.scale) ||
        entry.height !== Math.ceil(nativeSize.height * entry.scale)
      )
        throw Error("Invalid calibrated AVIF warm level");
      const page: AvifPreviewPage = {
        level,
        entry,
        getWidth: () => entry.width,
        getHeight: () => entry.height,
      };
      const grid = await this.grid(page, signal);
      this.assertEpoch(epoch);
      for (const item of grid.index.cells) {
        await waitForForeground();
        if (!this.bitmaps.has(`${level}:${item.id}`)) {
          const decoded = await this.cell(page, grid, item, signal);
          if (!decoded.retained) decoded.bitmap.close();
        }
        signal.throwIfAborted();
        this.assertEpoch(epoch);
        options.onProgress?.({
          level,
          decodedCells: this.decodedCells.get(level) ?? 0,
          totalCells: grid.index.cells.length,
          completedLevels: this.coverage.filter((entry) => entry.complete)
            .length,
          totalLevels: levels.length,
          residentBytes: this.residentBytes,
        });
        await pause(0);
      }
    }
  }
  private trimResidentCaches() {
    while (this.rangeBytes > this.rangeLimit && this.ranges.size) {
      const key = this.ranges.keys().next().value!;
      this.rangeBytes -= this.ranges.get(key)!.length;
      this.ranges.delete(key);
    }
    while (this.bitmapBytes > this.bitmapLimit && this.bitmaps.size) {
      const key = this.bitmaps.keys().next().value!,
        bitmap = this.bitmaps.get(key)!;
      this.bitmapBytes -= bitmap.width * bitmap.height * 4;
      const level = Number(key.split(":", 1)[0]);
      this.decodedCells.set(level, (this.decodedCells.get(level) ?? 1) - 1);
      bitmap.close();
      this.bitmaps.delete(key);
    }
  }
  park(budget: number) {
    this.rangeLimit = Math.min(this.rangeLimit, Math.max(0, budget / 3));
    this.bitmapLimit = Math.min(
      this.bitmapLimit,
      Math.max(0, (budget * 2) / 3)
    );
    this.trimResidentCaches();
    this.decodeCanvases.trim();
  }
  private assertEpoch(epoch: number) {
    if (epoch !== this.epoch) throw new AssetChanged();
  }
  private invalidateAsset(epoch: number) {
    if (epoch !== this.epoch) return;
    this.close();
  }
  private async withFreshAsset<T>(signal: AbortSignal, read: () => Promise<T>) {
    for (let attempt = 0; ; attempt++) {
      signal.throwIfAborted();
      try {
        return await read();
      } catch (error) {
        signal.throwIfAborted();
        if (!(error instanceof AssetChanged) || attempt !== 0) throw error;
      }
    }
  }
  close() {
    this.epoch++;
    for (const pending of this.pendingCells.values())
      pending.controller.abort();
    this.pendingCells.clear();
    this.decodedCells.clear();
    this.index = null;
    this.fileBytes = 0;
    this.fileBytesInferred = false;
    this.lastModified = null;
    this.metadataRequest = null;
    this.metadataSignal = null;
    for (const bitmap of this.bitmaps.values()) bitmap.close();
    this.bitmaps.clear();
    this.bitmapBytes = 0;
    this.ranges.clear();
    this.rangeBytes = 0;
    this.grids.clear();
    this.decodeCanvases.trim();
  }
  private async range(
    offset: number,
    length: number,
    signal: AbortSignal,
    allowShort = false
  ): Promise<Uint8Array> {
    signal.throwIfAborted();
    if (
      !Number.isSafeInteger(offset) ||
      !Number.isSafeInteger(length) ||
      offset < 0 ||
      length < 1 ||
      length > LIMIT ||
      (this.fileBytes && offset + length > this.fileBytes)
    )
      throw Error("Invalid bounded AVIF range");
    const epoch = this.epoch,
      key = `${offset}:${length}`,
      cached = this.ranges.get(key);
    if (cached) {
      this.ranges.delete(key);
      this.ranges.set(key, cached);
      return cached;
    }
    for (const [cachedKey, bytes] of this.ranges) {
      const start = Number(cachedKey.split(":", 1)[0]);
      if (start <= offset && start + bytes.length >= offset + length)
        return bytes.subarray(offset - start, offset - start + length);
    }
    const response = await fetch(this.url, {
      cache: "no-cache",
      headers: { Range: `bytes=${offset}-${offset + length - 1}` },
      signal,
      priority: this.priority,
    });
    if (response.status !== 206) {
      await response.body?.cancel();
      throw Error(
        `AVIF requires HTTP 206; refusing ${response.status} full-file response`
      );
    }
    const modified = response.headers.get("Last-Modified"),
      contentRange = response.headers.get("Content-Range"),
      total = contentRange && /\/(\d+)$/.exec(contentRange);
    if (
      epoch !== this.epoch ||
      (modified !== null &&
        this.lastModified !== null &&
        modified !== this.lastModified) ||
      (total &&
        !this.fileBytesInferred &&
        this.fileBytes > 0 &&
        Number(total[1]) !== this.fileBytes)
    ) {
      await response.body?.cancel();
      this.invalidateAsset(epoch);
      throw new AssetChanged();
    }
    if (this.lastModified === null && modified !== null)
      this.lastModified = modified;
    if (total && (this.fileBytes === 0 || this.fileBytesInferred)) {
      const lengthFromHeader = Number(total[1]);
      if (
        !Number.isSafeInteger(lengthFromHeader) ||
        lengthFromHeader <
          Math.max(offset + (allowShort ? 1 : length), this.fileBytes)
      ) {
        await response.body?.cancel();
        throw Error("Invalid AVIF range total");
      }
      this.fileBytes = lengthFromHeader;
      this.fileBytesInferred = false;
    }
    const declared = response.headers.get("Content-Length");
    if (
      declared !== null &&
      (!Number.isSafeInteger(Number(declared)) ||
        Number(declared) < 1 ||
        (allowShort ? Number(declared) > length : Number(declared) !== length))
    ) {
      await response.body?.cancel();
      throw Error("AVIF range length mismatch");
    }
    if (contentRange) {
      const parsed = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(contentRange);
      if (
        !parsed ||
        Number(parsed[1]) !== offset ||
        Number(parsed[2]) !==
          offset +
            (allowShort ? Math.min(length, this.fileBytes - offset) : length) -
            1 ||
        Number(parsed[3]) !== this.fileBytes
      ) {
        await response.body?.cancel();
        throw Error("AVIF Content-Range mismatch");
      }
    }
    const bytes = new Uint8Array(length),
      reader = response.body?.getReader();
    if (!reader) throw Error("AVIF range response has no body");
    let received = 0;
    try {
      while (true) {
        signal.throwIfAborted();
        this.assertEpoch(epoch);
        const chunk = await reader.read();
        this.assertEpoch(epoch);
        if (chunk.done) break;
        if (received + chunk.value.byteLength > length) {
          await reader.cancel();
          throw Error("AVIF range body exceeds requested budget");
        }
        bytes.set(chunk.value, received);
        received += chunk.value.byteLength;
      }
    } catch (error) {
      await reader.cancel();
      throw error;
    } finally {
      reader.releaseLock();
    }
    signal.throwIfAborted();
    this.assertEpoch(epoch);
    if (
      (allowShort ? received < 1 : received !== length) ||
      (declared !== null && received !== Number(declared))
    )
      throw Error("Incomplete AVIF range");
    const result = received === length ? bytes : bytes.subarray(0, received);
    if (bytes.length <= this.rangeLimit) {
      this.ranges.set(key, result);
      this.rangeBytes += result.length;
      while (this.rangeBytes > this.rangeLimit) {
        const oldest = this.ranges.keys().next().value!;
        this.rangeBytes -= this.ranges.get(oldest)!.length;
        this.ranges.delete(oldest);
      }
    }
    return result;
  }
  private metadata(signal: AbortSignal): Promise<PyramidIndex> {
    signal.throwIfAborted();
    if (this.index) return Promise.resolve(this.index);
    if (this.metadataRequest && this.metadataSignal === signal)
      return this.metadataRequest;
    const request = this.loadMetadata(signal, this.epoch).finally(() => {
      if (this.metadataRequest === request) {
        this.metadataRequest = null;
        this.metadataSignal = null;
      }
    });
    this.metadataRequest = request;
    this.metadataSignal = signal;
    return request;
  }
  private async loadMetadata(
    signal: AbortSignal,
    epoch: number
  ): Promise<PyramidIndex> {
    const initial = await this.range(0, 8192, signal, true);
    let offset = 0,
      uuidAt = -1,
      uuidSize = 0,
      uuidHeaderBytes = 24,
      previousType = "";
    for (let boxes = 0; boxes < 128; boxes++) {
      signal.throwIfAborted();
      this.assertEpoch(epoch);
      const header =
        offset + 16 <= initial.length
          ? initial.subarray(offset, offset + 16)
          : await this.range(
              offset,
              previousType === "mdat" ? 4120 : 16,
              signal
            );
      if (header.length < 8) throw Error("Incomplete AVIF BMFF header");
      const view = new DataView(
        header.buffer,
        header.byteOffset,
        header.byteLength
      );
      let size = view.getUint32(0);
      const type = new TextDecoder().decode(header.subarray(4, 8));
      let headerBytes = 8;
      if (size === 1) {
        if (header.length < 16) throw Error("Incomplete AVIF large box header");
        size = Number(view.getBigUint64(8));
        headerBytes = 16;
      }
      if (
        !Number.isSafeInteger(size) ||
        size < headerBytes ||
        !Number.isSafeInteger(offset + size)
      )
        throw Error("Invalid AVIF BMFF box size");
      if (boxes === 0 && type !== "ftyp")
        throw Error("AVIF ftyp header missing");
      if (this.fileBytes > 0 && offset + size > this.fileBytes)
        throw Error("AVIF box exceeds file bounds");
      if (type === "uuid") {
        uuidAt = offset;
        uuidSize = size;
        uuidHeaderBytes = headerBytes + 16;
        break;
      }
      offset += size;
      previousType = type;
    }
    if (uuidAt < 0 || uuidSize < uuidHeaderBytes + 4096 + 16)
      throw Error("AVIF pyramid UUID missing");
    const metadata = await this.range(uuidAt, uuidHeaderBytes + 4096, signal);
    const uuid = metadata.subarray(uuidHeaderBytes - 16, uuidHeaderBytes);
    if (
      Array.from(uuid, (value) => value.toString(16).padStart(2, "0")).join(
        ""
      ) !== "9264b9097b6840af91dcb95a8d3a1b80"
    )
      throw Error("Unsupported AVIF pyramid UUID");
    const end = uuidAt + uuidSize;
    if (this.fileBytes > 0 && this.fileBytes !== end)
      throw Error("AVIF pyramid UUID/file bounds mismatch");
    if (this.fileBytes === 0) {
      this.fileBytes = end;
      this.fileBytesInferred = true;
    }
    const at = uuidAt + uuidHeaderBytes;
    const parsed = JSON.parse(
      new TextDecoder()
        .decode(metadata.subarray(uuidHeaderBytes))
        .replace(/\0+$/, "")
    ) as PyramidIndex;
    if (
      parsed.schema !== 1 ||
      parsed.format !== "avif-independent-pyramid" ||
      parsed.baseLevel !== 1 ||
      !parsed.levels?.[1] ||
      !Array.isArray(parsed.sourceSensorDimensions) ||
      parsed.sourceSensorDimensions.length !== 2
    )
      throw Error("Unsupported calibrated AVIF pyramid");
    for (const entry of Object.values(parsed.levels)) {
      if (
        !Number.isSafeInteger(entry.offset) ||
        !Number.isSafeInteger(entry.length) ||
        entry.offset < 0 ||
        entry.length < 1 ||
        !Number.isSafeInteger(entry.offset + entry.length) ||
        entry.offset + entry.length > this.fileBytes - 16 ||
        !Number.isSafeInteger(entry.width) ||
        !Number.isSafeInteger(entry.height) ||
        entry.width < 1 ||
        entry.height < 1 ||
        !Number.isFinite(entry.scale) ||
        entry.scale <= 0
      )
        throw Error("Invalid AVIF level index");
    }
    for (const entry of Object.values(parsed.levels)) {
      const cell = entry.cellsIndex;
      if (
        cell &&
        (!Number.isSafeInteger(cell.offset) ||
          cell.offset < at + 4096 ||
          !Number.isSafeInteger(cell.length) ||
          cell.length < 1 ||
          !Number.isSafeInteger(cell.offset + cell.length) ||
          cell.offset + cell.length > this.fileBytes - 16)
      )
        throw Error("Invalid AVIF cell index bounds");
    }
    if (parsed.levels[1].offset !== 0 || parsed.levels[1].length !== uuidAt)
      throw Error("AVIF primary/index layout mismatch");
    signal.throwIfAborted();
    this.assertEpoch(epoch);
    this.index = parsed;
    return parsed;
  }
  async select(
    window: NativePreviewWindow,
    nativeSize: { width: DevicePixels; height: DevicePixels },
    signal: AbortSignal,
    maxDisplayPixelsPerSourcePixel = 1
  ) {
    return this.withFreshAsset(signal, () =>
      this.selectOnce(
        window,
        nativeSize,
        signal,
        maxDisplayPixelsPerSourcePixel
      )
    );
  }
  private async selectOnce(
    window: NativePreviewWindow,
    nativeSize: { width: DevicePixels; height: DevicePixels },
    signal: AbortSignal,
    maxDisplayPixelsPerSourcePixel: number
  ) {
    if (
      !(maxDisplayPixelsPerSourcePixel > 0) ||
      !Number.isFinite(maxDisplayPixelsPerSourcePixel)
    )
      throw Error("Invalid AVIF initial pixel size");
    signal.throwIfAborted();
    const epoch = this.epoch,
      index = await this.metadata(signal);
    signal.throwIfAborted();
    this.assertEpoch(epoch);
    if (
      index.sourceSensorDimensions[0] !== nativeSize.width ||
      index.sourceSensorDimensions[1] !== nativeSize.height
    )
      throw Error("AVIF sensor dimensions do not match camera calibration");
    const pages = Object.entries(index.levels)
      .map(
        ([level, entry]): AvifPreviewPage => ({
          level: Number(level),
          entry,
          getWidth: () => entry.width,
          getHeight: () => entry.height,
        })
      )
      .sort((a, b) => a.level - b.level);
    for (const page of pages) {
      if (
        page.entry.width !== Math.ceil(nativeSize.width * page.entry.scale) ||
        page.entry.height !== Math.ceil(nativeSize.height * page.entry.scale)
      )
        throw Error("AVIF level scale does not match sensor extent");
    }
    const densityX = window.target.width / window.source.width,
      densityY = window.target.height / window.source.height;
    const choose = (factor: number) =>
      [...pages]
        .reverse()
        .find(
          (p) =>
            p.getWidth() / nativeSize.width >= densityX / factor &&
            p.getHeight() / nativeSize.height >= densityY / factor
        ) ?? pages[0]!;
    const initial = choose(maxDisplayPixelsPerSourcePixel),
      finest = choose(1),
      refinements = pages
        .filter((p) => p.level < initial.level && p.level >= finest.level)
        .reverse();
    return { image: initial, refinements };
  }
  private async grid(
    page: AvifPreviewPage,
    signal: AbortSignal
  ): Promise<Grid> {
    const epoch = this.epoch,
      cached = this.grids.get(page.level);
    if (cached) return cached;
    const entry = page.entry;
    let header = await this.range(
      entry.offset,
      Math.min(8192, entry.length),
      signal
    );
    for (let at = 0; at + 8 <= header.length; ) {
      const size = new DataView(header.buffer, header.byteOffset).getUint32(at),
        type = String.fromCharCode(...header.subarray(at + 4, at + 8));
      if (size < 8) throw Error("Invalid AVIF BMFF box");
      if (type === "meta" && at + size > header.length) {
        if (at + size > 256 * 1024 || at + size > entry.length)
          throw Error("AVIF metadata exceeds budget");
        header = concatenate([
          header,
          await this.range(
            entry.offset + header.length,
            at + size - header.length,
            signal
          ),
        ]);
        break;
      }
      at += size;
    }
    const index = parseAvifGridIndex(header);
    if (
      index.dimensions.width !== entry.width ||
      index.dimensions.height !== entry.height
    )
      throw Error("AVIF BMFF/index dimension mismatch");
    let cols = 1;
    const absolute = new Map<number, AvifRange[]>();
    if (index.cells.length) {
      const extent = index.primary.ranges[0];
      if (!extent) throw Error("Missing AVIF grid descriptor");
      let descriptor = header.subarray(
        extent.offset,
        extent.offset + extent.length
      );
      if (descriptor.length !== extent.length)
        descriptor = await this.range(
          entry.offset + extent.offset,
          extent.length,
          signal
        );
      cols = descriptor[3] + 1;
    } else index.cells = [index.primary];
    if (entry.cellsIndex) {
      const table = JSON.parse(
        new TextDecoder().decode(
          await this.range(
            entry.cellsIndex.offset,
            entry.cellsIndex.length,
            signal
          )
        )
      ) as CellTable;
      if (
        table.schema !== 1 ||
        table.level !== page.level ||
        !Array.isArray(table.cells)
      )
        throw Error("Invalid AVIF absolute cell index");
      for (const cell of table.cells) {
        for (const r of cell.ranges)
          if (
            !Number.isSafeInteger(r.offset) ||
            !Number.isSafeInteger(r.length) ||
            r.length < 1 ||
            r.offset < entry.offset ||
            r.offset + r.length > entry.offset + entry.length
          )
            throw Error("Absolute AVIF cell range outside selected level");
        absolute.set(cell.itemId, cell.ranges);
      }
    }
    const ispe = index.cells[0]?.properties.find((p) => p.type === "ispe");
    if (!ispe) throw Error("Missing AVIF cell dimensions");
    const view = new DataView(Uint8Array.from(ispe.bytes).buffer),
      edgeX = view.getUint32(12),
      edgeY = view.getUint32(16);
    if (edgeX < 1 || edgeY < 1 || edgeX > 4096 || edgeY > 4096)
      throw Error("AVIF cell exceeds decode budget");
    const result = { index, cols, edgeX, edgeY, absolute };
    this.assertEpoch(epoch);
    this.grids.set(page.level, result);
    return result;
  }
  private async cell(
    page: AvifPreviewPage,
    grid: Grid,
    item: AvifItem,
    signal: AbortSignal
  ) {
    signal.throwIfAborted();
    const key = `${page.level}:${item.id}`;
    if (this.bitmaps.has(key) || grid.edgeX * grid.edgeY * 4 > this.bitmapLimit)
      return this.loadCell(page, grid, item, signal);
    let pending = this.pendingCells.get(key);
    if (!pending) {
      const controller = new AbortController();
      pending = {
        controller,
        consumers: 0,
        promise: this.loadCell(page, grid, item, controller.signal),
      };
      const current = pending;
      this.pendingCells.set(key, current);
      void current.promise
        .finally(() => {
          if (this.pendingCells.get(key) === current)
            this.pendingCells.delete(key);
        })
        .catch(() => {});
    }
    const current = pending;
    current.consumers++;
    return new Promise<{ bitmap: ImageBitmap; retained: boolean }>(
      (resolve, reject) => {
        let active = true;
        const detach = () => {
          if (!active) return false;
          active = false;
          signal.removeEventListener("abort", abort);
          current.consumers--;
          return true;
        };
        const abort = () => {
          if (!detach()) return;
          if (current.consumers === 0) {
            if (this.pendingCells.get(key) === current)
              this.pendingCells.delete(key);
            current.controller.abort();
          }
          reject(signal.reason);
        };
        signal.addEventListener("abort", abort, { once: true });
        current.promise.then(
          (result) => {
            if (detach()) resolve(result);
          },
          (error) => {
            if (detach()) reject(error);
          }
        );
        if (signal.aborted) abort();
      }
    );
  }
  private async loadCell(
    page: AvifPreviewPage,
    grid: Grid,
    item: AvifItem,
    signal: AbortSignal
  ) {
    const epoch = this.epoch,
      key = `${page.level}:${item.id}`,
      cached = this.bitmaps.get(key);
    if (cached) {
      this.bitmaps.delete(key);
      this.bitmaps.set(key, cached);
      return { bitmap: cached, retained: true };
    }
    const ranges =
      grid.absolute.get(item.id) ??
      item.ranges.map((r) => ({
        offset: r.offset + page.entry.offset,
        length: r.length,
      }));
    const payload = concatenate(
      await Promise.all(
        ranges.map((r) => this.range(r.offset, r.length, signal))
      )
    );
    signal.throwIfAborted();
    this.assertEpoch(epoch);
    const bytes = makeAvifTile(grid.index, item, payload),
      bitmap = await createImageBitmap(
        new Blob([bytes], { type: "image/avif" }),
        { premultiplyAlpha: "none" }
      );
    if (signal.aborted || epoch !== this.epoch) {
      bitmap.close();
      signal.throwIfAborted();
      this.assertEpoch(epoch);
    }
    const size = bitmap.width * bitmap.height * 4;
    let retained = false;
    if (size <= this.bitmapLimit) {
      this.bitmaps.set(key, bitmap);
      this.bitmapBytes += size;
      this.decodedCells.set(
        page.level,
        (this.decodedCells.get(page.level) ?? 0) + 1
      );
      retained = true;
      this.trimResidentCaches();
    }
    return { bitmap, retained };
  }
  async read(
    page: AvifPreviewPage,
    bounds: [number, number, number, number],
    signal: AbortSignal
  ): Promise<Uint8ClampedArray> {
    return this.withFreshAsset(signal, async () => {
      const epoch = this.epoch,
        index = await this.metadata(signal),
        entry = index.levels[page.level];
      this.assertEpoch(epoch);
      if (
        !entry ||
        entry.width !== page.getWidth() ||
        entry.height !== page.getHeight()
      )
        throw Error("Replacement AVIF level differs from calibrated extent");
      const currentPage =
        entry === page.entry
          ? page
          : {
              level: page.level,
              entry,
              getWidth: () => entry.width,
              getHeight: () => entry.height,
            };
      return this.readOnce(currentPage, bounds, signal);
    });
  }
  private async readOnce(
    page: AvifPreviewPage,
    bounds: [number, number, number, number],
    signal: AbortSignal
  ): Promise<Uint8ClampedArray> {
    signal.throwIfAborted();
    const epoch = this.epoch,
      grid = await this.grid(page, signal),
      [left, top, right, bottom] = bounds,
      width = right - left,
      height = bottom - top;
    if (
      !bounds.every(Number.isSafeInteger) ||
      left < 0 ||
      top < 0 ||
      right > page.getWidth() ||
      bottom > page.getHeight() ||
      width < 1 ||
      height < 1 ||
      width * height > 4 * 1024 * 1024
    )
      throw Error("AVIF ROI exceeds viewport budget");
    const output = new Uint8ClampedArray(width * height * 4);
    for (
      let y = Math.floor(top / grid.edgeY);
      y < Math.ceil(bottom / grid.edgeY);
      y++
    )
      for (
        let x = Math.floor(left / grid.edgeX);
        x < Math.ceil(right / grid.edgeX);
        x++
      ) {
        signal.throwIfAborted();
        this.assertEpoch(epoch);
        const item = grid.index.cells[y * grid.cols + x];
        if (!item) throw Error("Missing AVIF grid cell");
        const decoded = await this.cell(page, grid, item, signal),
          bitmap = decoded.bitmap;
        try {
          signal.throwIfAborted();
          this.assertEpoch(epoch);
        } catch (error) {
          if (!decoded.retained) bitmap.close();
          throw error;
        }
        const lease = this.decodeCanvases.acquire({
          width: bitmap.width as DevicePixels,
          height: bitmap.height as DevicePixels,
        });
        try {
          lease.context.drawImage(bitmap, 0, 0);
          const clippedLeft = Math.max(left, x * grid.edgeX),
            clippedTop = Math.max(top, y * grid.edgeY),
            clippedRight = Math.min(right, x * grid.edgeX + bitmap.width),
            clippedBottom = Math.min(bottom, y * grid.edgeY + bitmap.height);
          const crop = lease.context.getImageData(
            clippedLeft - x * grid.edgeX,
            clippedTop - y * grid.edgeY,
            clippedRight - clippedLeft,
            clippedBottom - clippedTop
          );
          for (let row = 0; row < crop.height; row++)
            output.set(
              crop.data.subarray(
                row * crop.width * 4,
                (row + 1) * crop.width * 4
              ),
              ((clippedTop - top + row) * width + clippedLeft - left) * 4
            );
        } finally {
          lease.release();
          if (!decoded.retained) bitmap.close();
        }
      }
    signal.throwIfAborted();
    this.assertEpoch(epoch);
    return output;
  }
}
