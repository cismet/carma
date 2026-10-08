import type { DevicePixels } from "@carma-units";
import type { NativePreviewWindow } from "../core/image-viewport-window";
import {
  parseAvifGridIndex,
  makeAvifTile,
  type AvifGridIndex,
  type AvifItem,
  type AvifRange,
} from "../core/avif-grid-index";
import { OffscreenCanvasPool } from "./offscreen-canvas-pool";
import { BoundedImageRangeCache } from "./bounded-image-range-cache";

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
  baseLevel: 0 | 1;
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
  fetchedRanges: number;
  totalRanges: number;
  residentBytes: number;
}>;
export type AvifSourceMemoryMetrics = Readonly<{
  rangeBytes: number;
  decodedBytes: number;
  residentBytes: number;
  rangeCount: number;
  decodedTileCount: number;
  decodedPixels: number;
  largestDecodedTilePixels: number;
  decodeCanvasBytes: number;
  overviewBytes: number;
}>;
export type AvifLevelReadiness = Readonly<{
  level: number;
  width: number;
  height: number;
  cols: number;
  rows: number;
  tileWidth: number;
  tileHeight: number;
  /** 0 unknown/missing, 1 requested, 2 compressed locally, 3 currently decoded. */
  states: Uint8Array;
  wholeOverviewReady: boolean;
  /** Historical successful reads; persistent cache eviction cannot be verified synchronously. */
  previouslyFetchedCells: Uint8Array;
  persistentAvailabilityVerified: boolean;
  /** Inventory freshness deadline; ordinary reads still handle cross-worker/browser eviction. */
  persistentSnapshotExpiresAt: number | null;
}>;
type AvifWarmOptions = {
  onProgress?: (progress: AvifWarmProgress) => void;
  shouldYield?: () => boolean;
};

/** Existing preview worker backend: bounded native AVIF cell decode, no whole-photo bitmap. */
export class AvifPyramidPreviewSource {
  private index: PyramidIndex | null = null;
  private fileBytes = 0;
  private fileBytesInferred = false;
  private lastModified: string | null = null;
  private etag: string | null = null;
  private readonly persistentRanges: BoundedImageRangeCache;
  private epoch = 0;
  private metadataRequest: Promise<PyramidIndex> | null = null;
  private metadataSignal: AbortSignal | null = null;
  private ranges = new Map<string, Uint8Array>();
  private rangeBytes = 0;
  private grids = new Map<number, Grid>();
  private bitmaps = new Map<string, ImageBitmap>();
  private protectedOverviewKey: string | null = null;
  private overviewRequest: { signal: AbortSignal; promise: Promise<AvifPreviewPage | null> } | null = null;
  private bitmapBytes = 0;
  private pendingCells = new Map<string, PendingCell>();
  private pendingRanges = new Map<string, { range: AvifRange; consumers: number }>();
  private fetchedRanges = new Map<string, AvifRange>();
  private decodedCells = new Map<number, number>();
  private wholeDecodeUnsupported = new Set<number>();
  private decodeCanvases = new OffscreenCanvasPool({
    maxRetainedBytes: 4 * 1024 * 1024,
    maxRetainedCanvases: 1,
    contextOptions: { willReadFrequently: true },
  });
  private cacheBudget: number;
  private rangeLimit: number;
  private bitmapLimit: number;
  private readonly fetchUrl: string;
  constructor(
    readonly url: string,
    budget = 64 * 1024 * 1024,
    readonly priority?: "low" | "high" | "auto"
  ) {
    const asset = new URL(url, globalThis.location?.href);
    if (asset.searchParams.has("pyramid")) asset.searchParams.delete("pyramid");
    this.fetchUrl = asset.href;
    this.persistentRanges = new BoundedImageRangeCache(this.fetchUrl);
    this.cacheBudget = budget;
    this.rangeLimit = Math.min(8 * 1024 * 1024, Math.floor(budget / 3));
    this.bitmapLimit = Math.min(32 * 1024 * 1024, (budget * 2) / 3);
  }
  /** Admission threshold only: allocate decoded cells on demand, never a full-photo canvas. */
  setActiveCacheBudget(bytes = 64 * 1024 * 1024) {
    if (!Number.isSafeInteger(bytes) || bytes < 0)
      throw new RangeError("Invalid AVIF cache budget");
    this.cacheBudget = bytes;
    this.rangeLimit = Math.min(8 * 1024 * 1024, Math.floor(bytes / 3));
    this.bitmapLimit = Math.min(32 * 1024 * 1024, (bytes * 2) / 3);
    this.trimResidentCaches();
  }
  /** Estimates retained encoded bytes + RGBA cells, excluding decoder scratch and GPU copies. */
  get residentBytes() {
    return (
      this.rangeBytes +
      this.bitmapBytes +
      this.decodeCanvases.stats.activeBytes +
      this.decodeCanvases.stats.retainedBytes
    );
  }
  get maxSourceDensity() {
    return this.index ? Math.max(...Object.values(this.index.levels).map((entry) => entry.scale)) : null;
  }
  private get overviewBytes() {
    const bitmap = this.protectedOverviewKey ? this.bitmaps.get(this.protectedOverviewKey) : undefined;
    return bitmap ? bitmap.width * bitmap.height * 4 : 0;
  }
  get memoryMetrics(): AvifSourceMemoryMetrics {
    let decodedPixels = 0;
    for (const bitmap of this.bitmaps.values())
      decodedPixels += bitmap.width * bitmap.height;
    return {
      rangeBytes: this.rangeBytes,
      overviewBytes: this.overviewBytes,
      decodedBytes: this.bitmapBytes,
      residentBytes: this.residentBytes,
      decodeCanvasBytes:
        this.decodeCanvases.stats.activeBytes +
        this.decodeCanvases.stats.retainedBytes,
      rangeCount: this.ranges.size,
      decodedTileCount: this.bitmaps.size,
      decodedPixels,
      largestDecodedTilePixels: Math.max(
        0,
        ...[...this.bitmaps.values()].map(
          (bitmap) => bitmap.width * bitmap.height
        )
      ),
    };
  }
  get levelReadiness(): AvifLevelReadiness[] {
    const { ranges: encodedRanges, persistent } = this.locallyAvailableRanges(),
      pendingRanges = [...this.pendingRanges.values()].map(({ range }) => range),
      fetchedRanges = this.mergeIntervals([...this.fetchedRanges.values()]);
    return Object.entries(this.index?.levels ?? {}).map(([number, entry]) => {
      const level = Number(number), grid = this.grids.get(level),
        whole = this.bitmaps.has(`${level}:whole`),
        cells = grid?.index.cells ?? [],
        states = new Uint8Array(cells.length || (whole ? 1 : 0)),
        fetched = new Uint8Array(states.length);
      for (const [n, item] of cells.entries()) {
        const key = `${level}:${item.id}`,
          ranges = grid!.absolute.get(item.id) ?? item.ranges.map((range) => ({ offset: entry.offset + range.offset, length: range.length }));
        fetched[n] = ranges.length && ranges.every((range) => this.intervalCovered(range, fetchedRanges)) ? 1 : 0;
        states[n] = whole || this.bitmaps.has(key) ? 3
          : this.pendingCells.has(key) || ranges.some((range) => pendingRanges.some((pending) => pending.offset < range.offset + range.length && pending.offset + pending.length > range.offset)) ? 1
          : ranges.length && ranges.every((range) => this.intervalCovered(range, encodedRanges)) ? 2 : 0;
      }
      if (whole && !cells.length) { states[0] = 3; fetched[0] = 1; }
      return {
        level, width: entry.width, height: entry.height,
        cols: grid?.cols ?? (whole ? 1 : 0),
        rows: grid ? Math.ceil(cells.length / grid.cols) : whole ? 1 : 0,
        tileWidth: grid?.edgeX ?? (whole ? entry.width : 0),
        tileHeight: grid?.edgeY ?? (whole ? entry.height : 0),
        states, previouslyFetchedCells: fetched,
        wholeOverviewReady: this.protectedOverviewKey === `${level}:whole` && whole,
        persistentAvailabilityVerified: persistent !== undefined,
        persistentSnapshotExpiresAt: persistent?.validUntil ?? null,
      };
    }).sort((a, b) => a.level - b.level);
  }
  private locallyAvailableRanges() {
    const version = this.etag ?? this.lastModified;
    const snapshot = version
      ? this.persistentRanges.knownRanges(version)
      : undefined;
    const persistent =
      snapshot && snapshot.validUntil > Date.now() ? snapshot : undefined;
    return {
      ranges: this.mergeIntervals([
        ...[...this.ranges.entries()].map(([key, bytes]) => ({
          offset: Number(key.split(":", 1)[0]),
          length: bytes.byteLength,
        })),
        ...(persistent?.ranges ?? []),
      ]),
      persistent,
    };
  }
  private mergeIntervals(ranges: ReadonlyArray<Readonly<AvifRange>>): AvifRange[] {
    const merged: AvifRange[] = [];
    for (const range of [...ranges].sort((a, b) => a.offset - b.offset)) {
      const previous = merged[merged.length - 1];
      if (previous && range.offset <= previous.offset + previous.length)
        previous.length = Math.max(previous.length, range.offset + range.length - previous.offset);
      else merged.push({ offset: range.offset, length: range.length });
    }
    return merged;
  }
  private intervalCovered(range: AvifRange, intervals: AvifRange[]) {
    let low = 0, high = intervals.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (intervals[middle].offset <= range.offset) low = middle + 1;
      else high = middle;
    }
    const interval = intervals[low - 1];
    return interval !== undefined && interval.offset + interval.length >= range.offset + range.length;
  }
  async overviewPage(signal: AbortSignal): Promise<AvifPreviewPage | null> {
    const index = await this.metadata(signal);
    const selected = Object.entries(index.levels)
      .filter(([, entry]) => Math.max(entry.width, entry.height) <= 1024)
      .sort(([, a], [, b]) => b.width * b.height - a.width * a.height)[0];
    if (!selected) return null;
    const [number, entry] = selected;
    return { level: Number(number), entry, getWidth: () => entry.width, getHeight: () => entry.height };
  }
  ensureOverview(signal: AbortSignal): Promise<AvifPreviewPage | null> {
    if (this.overviewRequest?.signal === signal) return this.overviewRequest.promise;
    const promise = this.withFreshAsset(signal, async () => {
      const epoch = this.epoch, page = await this.overviewPage(signal);
      if (!page) return null;
      const key = `${page.level}:whole`;
      if (this.bitmaps.has(key)) { this.protectedOverviewKey = key; return page; }
      const bytes = await this.range(page.entry.offset, page.entry.length, signal);
      let bitmap: ImageBitmap | null = null;
      try {
        bitmap = await createImageBitmap(new Blob([bytes], { type: "image/avif" }), { premultiplyAlpha: "none" });
        if (bitmap.width !== page.entry.width || bitmap.height !== page.entry.height) { bitmap.close(); bitmap = null; }
      } catch {
        signal.throwIfAborted(); this.assertEpoch(epoch);
      }
      if (!bitmap) {
        this.wholeDecodeUnsupported.add(page.level);
        const pixels = await this.read(page, [0, 0, page.entry.width, page.entry.height], signal);
        const lease = this.decodeCanvases.acquire({ width: page.entry.width as DevicePixels, height: page.entry.height as DevicePixels });
        try {
          lease.context.putImageData(new ImageData(new Uint8ClampedArray(pixels), page.entry.width, page.entry.height), 0, 0);
          bitmap = await createImageBitmap(lease.canvas, { premultiplyAlpha: "none" });
        } finally { lease.release(); }
      }
      if (signal.aborted || epoch !== this.epoch) {
        bitmap?.close(); signal.throwIfAborted(); this.assertEpoch(epoch);
      }
      if (!bitmap) throw Error("AVIF overview decode produced no bitmap");
      const existing = this.bitmaps.get(key);
      if (existing) bitmap.close();
      else { this.bitmaps.set(key, bitmap); this.bitmapBytes += bitmap.width * bitmap.height * 4; }
      this.protectedOverviewKey = key;
      this.trimResidentCaches();
      return page;
    }).finally(() => { if (this.overviewRequest?.promise === promise) this.overviewRequest = null; });
    this.overviewRequest = { signal, promise };
    return promise;
  }
  get coverage() {
    return Object.keys(this.index?.levels ?? {})
      .map(Number)
      .sort((a, b) => b - a)
      .map((level) => {
        const whole = this.bitmaps.has(`${level}:whole`);
        const totalCells = whole
          ? 1
          : this.grids.get(level)?.index.cells.length ?? null;
        const decodedCells = whole ? 1 : this.decodedCells.get(level) ?? 0;
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
    if (this.bitmaps.has(`${page.level}:whole`)) return true;
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
  /** Revalidate expired local metadata before deciding whether to skip coarse stages. */
  async ensureLocalAvailability(signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    if (this.etag ?? this.lastModified)
      await this.persistentRanges.ensureKnownRanges(signal);
    signal.throwIfAborted();
  }

  /** All ROI cells can be decoded locally; never probes storage or the network. */
  hasLocallyAvailable(
    page: AvifPreviewPage,
    bounds: [number, number, number, number]
  ): boolean {
    const entry = this.index?.levels[page.level];
    const [left, top, right, bottom] = bounds;
    if (
      !entry ||
      entry !== page.entry ||
      bounds.length !== 4 ||
      !bounds.every(Number.isSafeInteger) ||
      left < 0 ||
      top < 0 ||
      right > entry.width ||
      bottom > entry.height ||
      right <= left ||
      bottom <= top
    )
      return false;
    if (this.hasCached(page, bounds)) return true;
    const grid = this.grids.get(page.level);
    if (!grid) return false;
    const { ranges: available } = this.locallyAvailableRanges();
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
        if (!item) return false;
        if (this.bitmaps.has(`${page.level}:${item.id}`)) continue;
        const payloads =
          grid.absolute.get(item.id) ??
          item.ranges.map((range) => ({
            offset: entry.offset + range.offset,
            length: range.length,
          }));
        if (
          !payloads.length ||
          !payloads.every((range) => this.intervalCovered(range, available))
        )
          return false;
      }
    return true;
  }
  /** Protect a small overview, warm next-detail pixels within budget, then retain encoded pyramid ranges. */
  async prewarm(
    window: NativePreviewWindow,
    nativeSize: { width: DevicePixels; height: DevicePixels },
    signal: AbortSignal,
    options: AvifWarmOptions = {}
  ): Promise<void> {
    const epoch = this.epoch;
    const { image: current } = await this.select(window, nativeSize, signal, 1);
    const index = await this.metadata(signal);
    const pages = Object.entries(index.levels)
      .map(
        ([level, entry]): AvifPreviewPage => ({
          level: Number(level),
          entry,
          getWidth: () => entry.width,
          getHeight: () => entry.height,
        })
      )
      .sort((a, b) => a.entry.scale - b.entry.scale);
    const pause = async () => {
      do {
        signal.throwIfAborted();
        this.assertEpoch(epoch);
        await new Promise<void>((resolve) => setTimeout(resolve, 4));
      } while (options.shouldYield?.());
      signal.throwIfAborted();
      this.assertEpoch(epoch);
    };
    await pause();
    try { await this.ensureOverview(signal); }
    catch { signal.throwIfAborted(); this.assertEpoch(epoch); }
    const nextFiner = pages.find((page) => page.entry.scale > current.entry.scale);
    for (const visible of [true, false]) {
      for (const page of pages) {
        if (visible && page.entry.scale <= current.entry.scale) continue;
        await pause();
        const grid = await this.grid(page, signal);
        const sx = page.entry.width / nativeSize.width;
        const sy = page.entry.height / nativeSize.height;
        const left = window.source.x * sx;
        const top = window.source.y * sy;
        const right = (window.source.x + window.source.width) * sx;
        const bottom = (window.source.y + window.source.height) * sy;
        const cells = grid.index.cells.filter((_, n) => {
          const x = n % grid.cols,
            y = Math.floor(n / grid.cols);
          const intersects =
            x * grid.edgeX < right &&
            (x + 1) * grid.edgeX > left &&
            y * grid.edgeY < bottom &&
            (y + 1) * grid.edgeY > top;
          return visible
            ? intersects
            : page.entry.scale <= current.entry.scale || !intersects;
        });
        const ranges = this.cellRanges(page, grid, cells);
        for (const [n, range] of ranges.entries()) {
          await pause();
          await this.range(range.offset, range.length, signal, false, true);
          options.onProgress?.({
            level: page.level,
            fetchedRanges: n + 1,
            totalRanges: ranges.length,
            residentBytes: this.residentBytes,
          });
        }
        if (visible && page === nextFiner)
          await this.warmDecodedPage(page, window, nativeSize, signal, options);
      }
    }
  }
  /** Prepare only visible decoded cells that fit without displacing already useful pixels. */
  async warmVisibleDecoded(
    window: NativePreviewWindow,
    nativeSize: { width: DevicePixels; height: DevicePixels },
    signal: AbortSignal,
    options: AvifWarmOptions = {}
  ): Promise<void> {
    const { image } = await this.select(window, nativeSize, signal, 1);
    await this.warmDecodedPage(image, window, nativeSize, signal, options);
  }
  private async warmDecodedPage(
    page: AvifPreviewPage,
    window: NativePreviewWindow,
    nativeSize: { width: DevicePixels; height: DevicePixels },
    signal: AbortSignal,
    options: AvifWarmOptions
  ) {
    const epoch = this.epoch;
    if (this.bitmaps.has(`${page.level}:whole`)) return;
    const grid = await this.grid(page, signal),
      sx = page.entry.width / nativeSize.width, sy = page.entry.height / nativeSize.height,
      left = window.source.x * sx, top = window.source.y * sy,
      right = (window.source.x + window.source.width) * sx,
      bottom = (window.source.y + window.source.height) * sy,
      centerX = (left + right) / 2, centerY = (top + bottom) / 2;
    const cells = grid.index.cells.map((item, n) => ({ item, x: n % grid.cols, y: Math.floor(n / grid.cols) }))
      .filter(({ x, y }) => x * grid.edgeX < right && (x + 1) * grid.edgeX > left && y * grid.edgeY < bottom && (y + 1) * grid.edgeY > top)
      .sort((a, b) => ((a.x + .5) * grid.edgeX - centerX) ** 2 + ((a.y + .5) * grid.edgeY - centerY) ** 2 - (((b.x + .5) * grid.edgeX - centerX) ** 2 + ((b.y + .5) * grid.edgeY - centerY) ** 2));
    for (const { item } of cells) {
      signal.throwIfAborted(); this.assertEpoch(epoch);
      while (options.shouldYield?.()) {
        await new Promise<void>((resolve) => setTimeout(resolve, 4));
        signal.throwIfAborted(); this.assertEpoch(epoch);
      }
      if (this.bitmaps.has(`${page.level}:${item.id}`)) continue;
      const available = this.unprotectedDecodedLimit() - (this.bitmapBytes - this.overviewBytes);
      if (grid.edgeX * grid.edgeY * 4 > available) break;
      const decoded = await this.cell(page, grid, item, signal);
      if (!decoded.retained) { decoded.bitmap.close(); break; }
      options.onProgress?.({ level: page.level, fetchedRanges: 0, totalRanges: cells.length, residentBytes: this.residentBytes });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
  /** Merge adjacent payloads without downloading gaps, bounded to one MiB per request. */
  private cellRanges(
    page: AvifPreviewPage,
    grid: Grid,
    cells: AvifItem[]
  ): AvifRange[] {
    const ranges = cells
      .flatMap(
        (item) =>
          grid.absolute.get(item.id) ??
          item.ranges.map((range) => ({
            offset: range.offset + page.entry.offset,
            length: range.length,
          }))
      )
      .sort((a, b) => a.offset - b.offset);
    const merged: AvifRange[] = [];
    const limit = Math.max(
      1,
      Math.min(1024 * 1024, Math.floor(this.rangeLimit) || 1024 * 1024)
    );
    for (const range of ranges) {
      let offset = range.offset;
      const end = offset + range.length;
      while (offset < end) {
        const length = Math.min(limit, end - offset);
        const previous = merged[merged.length - 1];
        if (
          previous &&
          offset <= previous.offset + previous.length &&
          offset + length - previous.offset <= limit
        ) {
          previous.length = Math.max(
            previous.length,
            offset + length - previous.offset
          );
        } else merged.push({ offset, length });
        offset += length;
      }
    }
    return merged;
  }
  private trimResidentCaches() {
    // Idle scratch surfaces share the source budget; native decoder-internal memory is not observable.
    const scratch = this.decodeCanvases.stats;
    if (
      scratch.activeBytes + scratch.retainedBytes >
      Math.max(this.cacheBudget, this.overviewBytes) - this.rangeBytes - this.bitmapBytes
    )
      this.decodeCanvases.trim();
    while (this.rangeBytes > this.rangeLimit && this.ranges.size) {
      const key = this.ranges.keys().next().value!;
      this.rangeBytes -= this.ranges.get(key)!.length;
      this.ranges.delete(key);
    }
    const decodedLimit = this.overviewBytes + this.unprotectedDecodedLimit();
    while (this.bitmapBytes > decodedLimit && this.bitmaps.size) {
      const key = [...this.bitmaps.keys()].find((key) => key !== this.protectedOverviewKey);
      if (!key) break;
      const bitmap = this.bitmaps.get(key)!;
      this.bitmapBytes -= bitmap.width * bitmap.height * 4;
      const level = Number(key.split(":", 1)[0]);
      if (!key.endsWith(":whole"))
        this.decodedCells.set(level, (this.decodedCells.get(level) ?? 1) - 1);
      bitmap.close();
      this.bitmaps.delete(key);
    }
  }
  private unprotectedDecodedLimit() {
    return Math.min(this.bitmapLimit, Math.max(0, this.cacheBudget - this.overviewBytes - this.rangeBytes - this.decodeCanvases.stats.activeBytes - this.decodeCanvases.stats.retainedBytes));
  }
  park(budget: number) {
    if (budget < this.overviewBytes) this.protectedOverviewKey = null;
    this.cacheBudget = Math.max(0, budget);
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
    this.wholeDecodeUnsupported.clear();
    this.protectedOverviewKey = null;
    this.overviewRequest = null;
    this.pendingRanges.clear();
    this.fetchedRanges.clear();
    this.index = null;
    this.fileBytes = 0;
    this.fileBytesInferred = false;
    this.lastModified = null;
    this.etag = null;
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
    allowShort = false,
    persistBeforeReturn = false
  ): Promise<Uint8Array> {
    const epoch = this.epoch, key = `${offset}:${length}`,
      pending = this.pendingRanges.get(key) ?? { range: { offset, length }, consumers: 0 };
    pending.consumers++;
    this.pendingRanges.set(key, pending);
    try {
      const bytes = await this.loadRange(offset, length, signal, allowShort, persistBeforeReturn);
      this.assertEpoch(epoch);
      this.fetchedRanges.set(key, { offset, length: bytes.length });
      return bytes;
    } finally {
      if (this.epoch === epoch && --pending.consumers === 0) this.pendingRanges.delete(key);
    }
  }
  private async loadRange(
    offset: number,
    length: number,
    signal: AbortSignal,
    allowShort: boolean,
    persistBeforeReturn: boolean
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
    // Fragmented RAM coverage is just as local as one containing buffer.
    // Do not wait on disk availability before assembling an all-RAM request.
    const residentCoverage = this.mergeIntervals(
      [...this.ranges.entries()].map(([cachedKey, bytes]) => ({
        offset: Number(cachedKey.split(":", 1)[0]), length: bytes.length,
      }))
    );
    if (!allowShort && this.intervalCovered({ offset, length }, residentCoverage)) {
      const assembled = await this.readLocalRangeParts(
        offset, length, signal, persistBeforeReturn
      );
      signal.throwIfAborted();
      this.assertEpoch(epoch);
      if (assembled) {
        this.retainRange(key, assembled);
        return assembled;
      }
    }
    const version = this.etag ?? this.lastModified;
    if (version && offset !== 0) {
      const persisted = await this.persistentRanges.get(
        offset,
        length,
        version,
        signal
      );
      signal.throwIfAborted();
      this.assertEpoch(epoch);
      if (persisted) {
        this.retainRange(key, persisted);
        return persisted;
      }
    }
    if (!allowShort) {
      const assembled = await this.readLocalRangeParts(
        offset, length, signal, persistBeforeReturn
      );
      signal.throwIfAborted();
      this.assertEpoch(epoch);
      if (assembled) {
        this.retainRange(key, assembled);
        return assembled;
      }
    }
    return this.fetchRange(offset, length, signal, allowShort, persistBeforeReturn);
  }
  /** Reuse fragmented local payloads and fetch only gaps in this bounded range. */
  private async readLocalRangeParts(
    offset: number,
    length: number,
    signal: AbortSignal,
    persistBeforeReturn: boolean
  ): Promise<Uint8Array | undefined> {
    const epoch = this.epoch;
    const end = offset + length;
    const version = this.etag ?? this.lastModified;
    const snapshot = version && offset !== 0
      ? this.persistentRanges.knownRanges(version)
      : undefined;
    const disk = this.mergeIntervals(
      snapshot && snapshot.validUntil > Date.now() ? snapshot.ranges : []
    ).filter((range) => range.offset < end && range.offset + range.length > offset);
    const resident = [...this.ranges.entries()].map(([key, bytes]) => ({
      offset: Number(key.split(":", 1)[0]), bytes,
    })).filter((range) => range.offset < end && range.offset + range.bytes.length > offset);
    if (!resident.length && !disk.length) return undefined;
    // This is at most the already validated request size (eight MiB), never a
    // whole level or photograph. References keep RAM slices valid across awaits.
    const output = new Uint8Array(length);
    let at = offset;
    while (at < end) {
      signal.throwIfAborted();
      this.assertEpoch(epoch);
      let memory: (typeof resident)[number] | undefined;
      let nextMemory = end;
      for (const range of resident) {
        const rangeEnd = range.offset + range.bytes.length;
        if (range.offset > at) nextMemory = Math.min(nextMemory, range.offset);
        else if (rangeEnd > at && (!memory || rangeEnd > memory.offset + memory.bytes.length))
          memory = range;
      }
      if (memory) {
        const right = Math.min(end, memory.offset + memory.bytes.length);
        output.set(memory.bytes.subarray(at - memory.offset, right - memory.offset), at - offset);
        at = right;
        continue;
      }
      const stored = disk.find((range) => range.offset <= at && range.offset + range.length > at);
      let right = Math.min(end, nextMemory);
      if (stored) right = Math.min(right, stored.offset + stored.length);
      else for (const range of disk)
        if (range.offset > at) right = Math.min(right, range.offset);
      let bytes = stored && version
        ? await this.persistentRanges.get(at, right - at, version, signal)
        : undefined;
      signal.throwIfAborted();
      this.assertEpoch(epoch);
      // Inventory is an expiring hint: eviction or a failed disk read falls
      // through to one ordinary GET for this gap, without probing the server.
      bytes ??= await this.fetchRange(at, right - at, signal, false, persistBeforeReturn);
      signal.throwIfAborted();
      this.assertEpoch(epoch);
      output.set(bytes, at - offset);
      at = right;
    }
    return output;
  }
  private async fetchRange(
    offset: number,
    length: number,
    signal: AbortSignal,
    allowShort: boolean,
    persistBeforeReturn: boolean
  ): Promise<Uint8Array> {
    const epoch = this.epoch;
    const key = `${offset}:${length}`;
    const response = await fetch(this.fetchUrl, {
      cache: offset === 0 ? "no-cache" : "default",
      headers: { Range: `bytes=${offset}-${offset + length - 1}` },
      signal,
      priority: persistBeforeReturn ? "low" : this.priority,
    });
    if (response.status !== 206) {
      await response.body?.cancel();
      throw Error(
        `AVIF requires HTTP 206; refusing ${response.status} full-file response`
      );
    }
    const modified = response.headers.get("Last-Modified"),
      etag = response.headers.get("ETag"),
      contentRange = response.headers.get("Content-Range"),
      total = contentRange && /\/(\d+)$/.exec(contentRange);
    if (
      epoch !== this.epoch ||
      (etag !== null && this.etag !== null && etag !== this.etag) ||
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
    if (this.etag === null && etag !== null) this.etag = etag;
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
    this.retainRange(key, result);
    const updatedVersion = this.etag ?? this.lastModified;
    if (updatedVersion) {
      const write = this.persistentRanges.put(offset, result, updatedVersion);
      if (persistBeforeReturn) await write;
      else void write;
    }
    return result;
  }
  private retainRange(key: string, bytes: Uint8Array) {
    if (bytes.byteLength > this.rangeLimit) return;
    this.rangeBytes -= this.ranges.get(key)?.byteLength ?? 0;
    this.ranges.delete(key);
    this.ranges.set(key, bytes);
    this.rangeBytes += bytes.byteLength;
    this.trimResidentCaches();
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
    const initial = await this.range(0, 16384, signal, true);
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
      (parsed.baseLevel !== 0 && parsed.baseLevel !== 1) ||
      !parsed.levels?.[parsed.baseLevel] ||
      !Array.isArray(parsed.sourceSensorDimensions) ||
      parsed.sourceSensorDimensions.length !== 2
    )
      throw Error("Unsupported AVIF pyramid");
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
    if (
      parsed.levels[parsed.baseLevel].offset !== 0 ||
      parsed.levels[parsed.baseLevel].length !== uuidAt
    )
      throw Error("AVIF primary/index layout mismatch");
    signal.throwIfAborted();
    this.assertEpoch(epoch);
    this.index = parsed;
    return parsed;
  }
  /** Image-only consumers can initialize their crop without a photogrammetric camera record. */
  async getDimensions(
    signal: AbortSignal
  ): Promise<{ width: DevicePixels; height: DevicePixels }> {
    const index = await this.withFreshAsset(signal, () =>
      this.metadata(signal)
    );
    return {
      width: index.sourceSensorDimensions[0] as DevicePixels,
      height: index.sourceSensorDimensions[1] as DevicePixels,
    };
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
      throw Error("AVIF source dimensions do not match the requested extent");
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
        throw Error("AVIF level scale does not match source extent");
    }
    const requiredPixels = (target: number, factor: number) =>
      // Outward integer crops followed by ceil(target) can add less than one
      // display pixel. That alone must not fetch the whole next pyramid level.
      factor === 1 && target > 1 ? Math.max(1, target - 1) : target / factor;
    const choose = (factor: number) =>
      [...pages]
        .reverse()
        .find(
          (p) =>
            window.source.width * p.getWidth() / nativeSize.width >= requiredPixels(window.target.width, factor) &&
            window.source.height * p.getHeight() / nativeSize.height >= requiredPixels(window.target.height, factor)
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
        new Blob([new Uint8Array(bytes)], { type: "image/avif" }),
        { premultiplyAlpha: "none" }
      );
    if (signal.aborted || epoch !== this.epoch) {
      bitmap.close();
      signal.throwIfAborted();
      this.assertEpoch(epoch);
    }
    const size = bitmap.width * bitmap.height * 4;
    let retained = false;
    if (size <= this.unprotectedDecodedLimit()) {
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
    const wholeKey = String(page.level) + ":whole";
    let whole = this.bitmaps.get(wholeKey);
    const levelPixels = page.getWidth() * page.getHeight();
    if (
      !whole &&
      page.level >= 3 &&
      page.entry.cellsIndex &&
      page.entry.length <= 2 * 1024 * 1024 &&
      levelPixels * 4 <= this.bitmapLimit &&
      levelPixels * 4 <= this.unprotectedDecodedLimit() &&
      width * height >= levelPixels / 4 &&
      !this.wholeDecodeUnsupported.has(page.level)
    ) {
      // One bounded native AVIF sub-file is cheaper than many cell round trips for a broad coarse view.
      const bytes = await this.range(
        page.entry.offset,
        page.entry.length,
        signal
      );
      try {
        whole = await createImageBitmap(
          new Blob([bytes], { type: "image/avif" }),
          { premultiplyAlpha: "none" }
        );
      } catch {
        signal.throwIfAborted();
        this.assertEpoch(epoch);
        this.wholeDecodeUnsupported.add(page.level);
      }
      if (
        whole &&
        (whole.width !== page.getWidth() || whole.height !== page.getHeight())
      ) {
        whole.close();
        whole = undefined;
        this.wholeDecodeUnsupported.add(page.level);
      }
      if (whole) {
        try {
          signal.throwIfAborted();
          this.assertEpoch(epoch);
        } catch (error) {
          whole.close();
          throw error;
        }
        if (levelPixels * 4 <= this.unprotectedDecodedLimit()) {
          this.bitmaps.set(wholeKey, whole);
          this.bitmapBytes += levelPixels * 4;
          this.trimResidentCaches();
        }
      }
    }
    if (whole) {
      const retained = this.bitmaps.get(wholeKey) === whole;
      if (retained) {
        this.bitmaps.delete(wholeKey);
        this.bitmaps.set(wholeKey, whole);
      }
      const lease = this.decodeCanvases.acquire({
        width: width as DevicePixels,
        height: height as DevicePixels,
      });
      try {
        lease.context.drawImage(
          whole,
          left,
          top,
          width,
          height,
          0,
          0,
          width,
          height
        );
        return lease.context.getImageData(0, 0, width, height).data;
      } finally {
        lease.release();
        this.trimResidentCaches();
        if (!retained) whole.close();
      }
    }
    const grid = await this.grid(page, signal);
    const output = new Uint8ClampedArray(width * height * 4);
    const cells: { x: number; y: number; item: AvifItem }[] = [];
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
        cells.push({ x, y, item });
      }
    for (let at = 0; at < cells.length; at += 4) {
      const batch = cells.slice(at, at + 4);
      const missing = batch.filter(
        ({ item }) => !this.bitmaps.has(`${page.level}:${item.id}`)
      );
      const ranges = this.cellRanges(
        page,
        grid,
        missing.map(({ item }) => item)
      );
      // Keep this batch resident until its cells have been drawn; larger batches stay on the cell path.
      if (
        ranges.reduce((size, range) => size + range.length, 0) <=
        this.rangeLimit
      )
        for (const range of ranges)
          await this.range(range.offset, range.length, signal);
      for (const { x, y, item } of batch) {
        signal.throwIfAborted();
        this.assertEpoch(epoch);
        const decoded = await this.cell(page, grid, item, signal),
          bitmap = decoded.bitmap;
        try {
          signal.throwIfAborted();
          this.assertEpoch(epoch);
        } catch (error) {
          if (!decoded.retained) bitmap.close();
          throw error;
        }
        const clippedLeft = Math.max(left, x * grid.edgeX),
          clippedTop = Math.max(top, y * grid.edgeY),
          clippedRight = Math.min(right, x * grid.edgeX + bitmap.width),
          clippedBottom = Math.min(bottom, y * grid.edgeY + bitmap.height),
          cropWidth = clippedRight - clippedLeft,
          cropHeight = clippedBottom - clippedTop;
        const lease = this.decodeCanvases.acquire({
          width: cropWidth as DevicePixels,
          height: cropHeight as DevicePixels,
        });
        try {
          lease.context.drawImage(
            bitmap,
            clippedLeft - x * grid.edgeX,
            clippedTop - y * grid.edgeY,
            cropWidth,
            cropHeight,
            0,
            0,
            cropWidth,
            cropHeight
          );
          const crop = lease.context.getImageData(0, 0, cropWidth, cropHeight);
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
          this.trimResidentCaches();
          if (!decoded.retained) bitmap.close();
        }
      }
    }
    signal.throwIfAborted();
    this.assertEpoch(epoch);
    return output;
  }
}
