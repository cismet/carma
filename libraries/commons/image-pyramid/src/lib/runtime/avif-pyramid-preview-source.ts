import {
  getRegisteredNativeAvif,
  nativeLevelEntry,
  type NativeAvifBootstrap,
  NativeAvifByteSource,
} from "./native-avif-byte-source";
import { AvifAssetChangedError as AssetChanged } from "./avif-source-errors";
import type { DevicePixels } from "@carma-units";
import type { NativePreviewWindow } from "../core/image-viewport-window";
import {
  makeAvifTile,
  type AvifGridIndex,
  type AvifItem,
  type AvifRange,
} from "../core/avif-grid-index";
import { NativeAvifCellDecoders } from "./native-avif-cell-decoder";
import { OffscreenCanvasPool } from "./offscreen-canvas-pool";
import { BoundedImageRangeCache } from "./bounded-image-range-cache";

type LevelEntry = {
  offset: number;
  length: number;
  width: number;
  height: number;
  scale: number;
};
type PyramidIndex = {
  sourceSensorDimensions: [number, number];
  levels: Record<string, LevelEntry>;
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
export type AvifNeighborhoodRole = "next-finer" | "current" | "parent";
export type AvifNeighborhoodReadiness = Readonly<{
  level: number;
  role: AvifNeighborhoodRole;
  nativeBounds: readonly [number, number, number, number];
  totalTiles: number;
  encoded: number;
  decoded: number;
  requiredBytes: number;
}>;
export type AvifWarmProgress = Readonly<{
  level: number;
  role?: AvifNeighborhoodRole;
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
  nativeCompositionCanvasBytes: number;
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
export type AvifWarmOptions = {
  onProgress?: (progress: AvifWarmProgress) => void;
  shouldYield?: () => boolean;
  /** Encoded ranges are still warmed when decoded residency is disabled. */
  decode?: boolean;
};

/** Existing preview worker backend: bounded native AVIF cell decode, no whole-photo bitmap. */
export class AvifPyramidPreviewSource {
  private readonly decoders = new NativeAvifCellDecoders();
  private nativeBootstrap: NativeAvifBootstrap | null = null;
  private nativeSource: NativeAvifByteSource | undefined;
  private ownsNativeSource = false;
  private index: PyramidIndex | null = null;
  private fileBytes = 0;
  private readonly persistentRanges: BoundedImageRangeCache;
  private epoch = 0;
  private metadataRequest: Promise<PyramidIndex> | null = null;
  private metadataSignal: AbortSignal | null = null;
  private grids = new Map<number, Grid>();
  private neighborhood: {
    page: AvifPreviewPage;
    grid: Grid;
    role: AvifNeighborhoodRole;
    bounds: [number, number, number, number];
    cells: AvifItem[];
  }[] = [];
  private bitmaps = new Map<string, ImageBitmap>();
  private protectedOverviewKey: string | null = null;
  private overviewRequest: {
    signal: AbortSignal;
    promise: Promise<AvifPreviewPage | null>;
  } | null = null;
  private bitmapBytes = 0;
  private pendingCells = new Map<string, PendingCell>();
  private pendingRanges = new Map<
    string,
    { range: AvifRange; consumers: number }
  >();
  private fetchedRanges = new Map<string, AvifRange>();
  private decodedCells = new Map<number, number>();
  private decodeCanvases = new OffscreenCanvasPool({
    maxRetainedBytes: 4 * 1024 * 1024,
    maxRetainedCanvases: 1,
    contextOptions: { willReadFrequently: true },
  });
  private nativeCanvases = new OffscreenCanvasPool({
    maxRetainedBytes: 32 * 1024 * 1024,
    maxRetainedCanvases: 1,
    contextOptions: { alpha: false },
  });
  private get canvasBytes() {
    const decode = this.decodeCanvases.stats,
      native = this.nativeCanvases.stats;
    return (
      decode.activeBytes +
      decode.retainedBytes +
      native.activeBytes +
      native.retainedBytes
    );
  }
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
    this.bitmapLimit = Math.min(96 * 1024 * 1024, budget - this.rangeLimit);
  }
  /** Admission threshold only: allocate decoded cells on demand, never a full-photo canvas. */
  setActiveCacheBudget(bytes = 64 * 1024 * 1024) {
    if (!Number.isSafeInteger(bytes) || bytes < 0)
      throw new RangeError("Invalid AVIF cache budget");
    this.cacheBudget = bytes;
    this.rangeLimit = Math.min(8 * 1024 * 1024, Math.floor(bytes / 3));
    this.bitmapLimit = Math.min(96 * 1024 * 1024, bytes - this.rangeLimit);
    this.trimResidentCaches();
  }
  /** Estimates retained encoded bytes + RGBA cells, excluding decoder scratch and GPU copies. */
  get residentBytes() {
    return (
      (this.nativeSource?.compressedBytes ?? 0) +
      this.bitmapBytes +
      this.canvasBytes +
      this.decoders.workingBytes
    );
  }
  get decoderWorkingBytes() {
    return this.decoders.workingBytes;
  }
  get maxSourceDensity() {
    return this.index
      ? Math.max(
          ...Object.values(this.index.levels).map((entry) => entry.scale)
        )
      : null;
  }
  private get overviewBytes() {
    const bitmap = this.protectedOverviewKey
      ? this.bitmaps.get(this.protectedOverviewKey)
      : undefined;
    return bitmap ? bitmap.width * bitmap.height * 4 : 0;
  }
  get memoryMetrics(): AvifSourceMemoryMetrics {
    let decodedPixels = 0;
    for (const bitmap of this.bitmaps.values())
      decodedPixels += bitmap.width * bitmap.height;
    return {
      rangeBytes: this.nativeSource?.compressedBytes ?? 0,
      overviewBytes: this.overviewBytes,
      decodedBytes: this.bitmapBytes,
      residentBytes: this.residentBytes,
      decodeCanvasBytes: this.canvasBytes,
      nativeCompositionCanvasBytes:
        this.nativeCanvases.stats.activeBytes +
        this.nativeCanvases.stats.retainedBytes,
      rangeCount: this.nativeSource?.availableRanges.length ?? 0,
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
      pendingRanges = [...this.pendingRanges.values()].map(
        ({ range }) => range
      ),
      fetchedRanges = this.mergeIntervals([...this.fetchedRanges.values()]);
    return Object.entries(this.index?.levels ?? {})
      .map(([number, entry]) => {
        const level = Number(number),
          grid = this.grids.get(level),
          whole = this.bitmaps.has(`${level}:whole`),
          cells = grid?.index.cells ?? [],
          states = new Uint8Array(cells.length || (whole ? 1 : 0)),
          fetched = new Uint8Array(states.length);
        for (const [n, item] of cells.entries()) {
          const key = `${level}:${item.id}`,
            ranges =
              grid!.absolute.get(item.id) ??
              item.ranges.map((range) => ({
                offset: entry.offset + range.offset,
                length: range.length,
              }));
          fetched[n] =
            ranges.length &&
            ranges.every((range) => this.intervalCovered(range, fetchedRanges))
              ? 1
              : 0;
          states[n] =
            whole || this.bitmaps.has(key)
              ? 3
              : this.pendingCells.has(key) ||
                ranges.some((range) =>
                  pendingRanges.some(
                    (pending) =>
                      pending.offset < range.offset + range.length &&
                      pending.offset + pending.length > range.offset
                  )
                )
              ? 1
              : ranges.length &&
                ranges.every((range) =>
                  this.intervalCovered(range, encodedRanges)
                )
              ? 2
              : 0;
        }
        if (whole && !cells.length) {
          states[0] = 3;
          fetched[0] = 1;
        }
        return {
          level,
          width: entry.width,
          height: entry.height,
          cols: grid?.cols ?? (whole ? 1 : 0),
          rows: grid ? Math.ceil(cells.length / grid.cols) : whole ? 1 : 0,
          tileWidth: grid?.edgeX ?? (whole ? entry.width : 0),
          tileHeight: grid?.edgeY ?? (whole ? entry.height : 0),
          states,
          previouslyFetchedCells: fetched,
          wholeOverviewReady:
            this.protectedOverviewKey === `${level}:whole` && whole,
          persistentAvailabilityVerified: persistent !== undefined,
          persistentSnapshotExpiresAt: persistent?.validUntil ?? null,
        };
      })
      .sort((a, b) => a.level - b.level);
  }
  private locallyAvailableRanges() {
    const version = this.nativeSource?.cacheRevision;
    const snapshot = version
      ? this.persistentRanges.knownRanges(version)
      : undefined;
    const persistent =
      snapshot && snapshot.validUntil > Date.now() ? snapshot : undefined;
    return {
      ranges: this.mergeIntervals([
        ...(this.nativeSource?.availableRanges ?? []),
        ...(persistent?.ranges ?? []),
      ]),
      persistent,
    };
  }
  private mergeIntervals(
    ranges: ReadonlyArray<Readonly<AvifRange>>
  ): AvifRange[] {
    const merged: AvifRange[] = [];
    for (const range of [...ranges].sort((a, b) => a.offset - b.offset)) {
      const previous = merged[merged.length - 1];
      if (previous && range.offset <= previous.offset + previous.length)
        previous.length = Math.max(
          previous.length,
          range.offset + range.length - previous.offset
        );
      else merged.push({ offset: range.offset, length: range.length });
    }
    return merged;
  }
  private intervalCovered(range: AvifRange, intervals: AvifRange[]) {
    let low = 0,
      high = intervals.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (intervals[middle].offset <= range.offset) low = middle + 1;
      else high = middle;
    }
    const interval = intervals[low - 1];
    return (
      interval !== undefined &&
      interval.offset + interval.length >= range.offset + range.length
    );
  }
  async overviewPage(signal: AbortSignal): Promise<AvifPreviewPage | null> {
    const index = await this.metadata(signal);
    const selected = Object.entries(index.levels)
      .filter(([level]) => Number(level) === 4)
      .sort(([, a], [, b]) => b.width * b.height - a.width * a.height)[0];
    if (!selected) return null;
    const [number, entry] = selected;
    return {
      level: Number(number),
      entry,
      getWidth: () => entry.width,
      getHeight: () => entry.height,
    };
  }
  ensureOverview(signal: AbortSignal): Promise<AvifPreviewPage | null> {
    if (this.overviewRequest?.signal === signal)
      return this.overviewRequest.promise;
    const promise = this.withFreshAsset(signal, async () => {
      const epoch = this.epoch,
        page = await this.overviewPage(signal);
      if (!page) return null;
      const key = `${page.level}:whole`;
      if (this.bitmaps.has(key)) {
        this.protectedOverviewKey = key;
        return page;
      }
      let bitmap: ImageBitmap | null = null;
      if (!bitmap) {
        const pixels = await this.read(
          page,
          [0, 0, page.entry.width, page.entry.height],
          signal
        );
        const lease = this.decodeCanvases.acquire({
          width: page.entry.width as DevicePixels,
          height: page.entry.height as DevicePixels,
        });
        try {
          lease.context.putImageData(
            new ImageData(
              new Uint8ClampedArray(pixels),
              page.entry.width,
              page.entry.height
            ),
            0,
            0
          );
          bitmap = await createImageBitmap(lease.canvas, {
            premultiplyAlpha: "none",
          });
        } finally {
          lease.release();
        }
      }
      if (signal.aborted || epoch !== this.epoch) {
        bitmap?.close();
        signal.throwIfAborted();
        this.assertEpoch(epoch);
      }
      if (!bitmap) throw Error("AVIF overview decode produced no bitmap");
      const existing = this.bitmaps.get(key);
      if (existing) bitmap.close();
      else {
        this.bitmaps.set(key, bitmap);
        this.bitmapBytes += bitmap.width * bitmap.height * 4;
      }
      this.protectedOverviewKey = key;
      this.trimResidentCaches();
      return page;
    }).finally(() => {
      if (this.overviewRequest?.promise === promise)
        this.overviewRequest = null;
    });
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
    if (this.nativeSource?.cacheRevision)
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
    try {
      await this.ensureOverview(signal);
    } catch {
      signal.throwIfAborted();
      this.assertEpoch(epoch);
    }
    const nextFiner = pages.find(
      (page) => page.entry.scale > current.entry.scale
    );
    for (const visible of [true, false]) {
      for (const page of pages) {
        if (visible && page.entry.scale <= current.entry.scale) continue;
        await pause();
        const grid = await this.grid(page, signal);
        const sx = page.entry.scale;
        const sy = page.entry.scale;
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
        if (this.nativeSource) {
          await this.readNativeCells(
            page,
            grid,
            cells,
            signal,
            "low",
            (done, total) =>
              options.onProgress?.({
                level: page.level,
                fetchedRanges: done,
                totalRanges: total,
                residentBytes: this.residentBytes,
              })
          );
        } else {
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
        }
        if (visible && page === nextFiner)
          await this.warmDecodedPage(page, window, nativeSize, signal, options);
      }
    }
  }
  /** Keep just the immediately finer level encoded locally; never decode a whole photograph. */
  async prewarmNextLevel(
    window: NativePreviewWindow,
    nativeSize: { width: DevicePixels; height: DevicePixels },
    signal: AbortSignal,
    options: AvifWarmOptions = {}
  ): Promise<void> {
    const epoch = this.epoch,
      { image: current } = await this.select(window, nativeSize, signal, 1);
    const index = await this.metadata(signal);
    const selected = Object.entries(index.levels)
      .filter(([, entry]) => entry.scale > current.entry.scale)
      .sort(([, a], [, b]) => a.scale - b.scale)[0];
    if (!selected) return;
    const [number, entry] = selected;
    const page: AvifPreviewPage = {
      level: Number(number),
      entry,
      getWidth: () => entry.width,
      getHeight: () => entry.height,
    };
    await this.warmPause(signal, epoch, options);
    const grid = await this.grid(page, signal);
    await this.warmCells(
      page,
      grid,
      grid.index.cells,
      signal,
      { ...options, decode: false },
      "next-finer"
    );
  }
  /** Current viewport children first, then a bounded guard and parent; never the rest of the image. */
  async warmNeighborhood(
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
    const nextFiner = pages.find(
      (page) => page.entry.scale > current.entry.scale
    );
    const parent = [...pages]
      .reverse()
      .find((page) => page.entry.scale < current.entry.scale);
    // A quarter viewport, capped at one physical composition tile, anticipates
    // ordinary zoom-out/pan without an unconditional tile-grid neighbourhood.
    const guardX =
      (Math.min(512, window.target.width / 4) * window.source.width) /
      window.target.width;
    const guardY =
      (Math.min(512, window.target.height / 4) * window.source.height) /
      window.target.height;
    const left = Math.max(0, Math.floor(window.source.x - guardX));
    const top = Math.max(0, Math.floor(window.source.y - guardY));
    const right = Math.min(
      nativeSize.width,
      Math.ceil(window.source.x + window.source.width + guardX)
    );
    const bottom = Math.min(
      nativeSize.height,
      Math.ceil(window.source.y + window.source.height + guardY)
    );
    const guard: NativePreviewWindow = {
      source: {
        x: left as DevicePixels,
        y: top as DevicePixels,
        width: (right - left) as DevicePixels,
        height: (bottom - top) as DevicePixels,
      },
      target: {
        width: Math.ceil(
          ((right - left) * window.target.width) / window.source.width
        ) as DevicePixels,
        height: Math.ceil(
          ((bottom - top) * window.target.height) / window.source.height
        ) as DevicePixels,
      },
    };
    const requested = [
      ...(nextFiner
        ? [{ page: nextFiner, window, role: "next-finer" as const }]
        : []),
      { page: current, window: guard, role: "current" as const },
      ...(parent
        ? [{ page: parent, window: guard, role: "parent" as const }]
        : []),
    ];
    this.neighborhood = [];
    for (const planned of requested) {
      await this.warmPause(signal, epoch, options);
      const selection = await this.windowCells(
        planned.page,
        planned.window,
        nativeSize,
        signal
      );
      this.neighborhood.push({
        page: planned.page,
        role: planned.role,
        ...selection,
      });
      await this.warmCells(
        planned.page,
        selection.grid,
        selection.cells,
        signal,
        options,
        planned.role
      );
    }
  }
  /** Cheap live residency for the last local plan; fetch history is deliberately excluded. */
  get neighborhoodReadiness(): AvifNeighborhoodReadiness[] {
    const { ranges } = this.locallyAvailableRanges();
    return this.neighborhood.map(({ page, grid, role, bounds, cells }) => {
      const whole = this.bitmaps.has(`${page.level}:whole`);
      const decoded = cells.filter(
        (item) => whole || this.bitmaps.has(`${page.level}:${item.id}`)
      ).length;
      const encoded = cells.filter(
        (item) =>
          whole ||
          this.bitmaps.has(`${page.level}:${item.id}`) ||
          (
            grid.absolute.get(item.id) ??
            item.ranges.map((r) => ({
              offset: page.entry.offset + r.offset,
              length: r.length,
            }))
          ).every((range) => this.intervalCovered(range, ranges))
      ).length;
      return {
        level: page.level,
        role,
        nativeBounds: [
          Math.min(
            this.index!.sourceSensorDimensions[0],
            bounds[0] / page.entry.scale
          ),
          Math.min(
            this.index!.sourceSensorDimensions[1],
            bounds[1] / page.entry.scale
          ),
          Math.min(
            this.index!.sourceSensorDimensions[0],
            bounds[2] / page.entry.scale
          ),
          Math.min(
            this.index!.sourceSensorDimensions[1],
            bounds[3] / page.entry.scale
          ),
        ] as const,
        totalTiles: cells.length,
        encoded,
        decoded,
        requiredBytes: cells.length * grid.edgeX * grid.edgeY * 4,
      };
    });
  }
  /** Prepare visible cells plus one source pixel for native linear interpolation. */
  async warmVisibleDecoded(
    window: NativePreviewWindow,
    nativeSize: { width: DevicePixels; height: DevicePixels },
    signal: AbortSignal,
    options: AvifWarmOptions = {}
  ): Promise<void> {
    const { image } = await this.select(window, nativeSize, signal, 1);
    await this.warmDecodedPage(image, window, nativeSize, signal, options);
  }
  private async warmPause(
    signal: AbortSignal,
    epoch: number,
    options: AvifWarmOptions
  ) {
    signal.throwIfAborted();
    this.assertEpoch(epoch);
    while (options.shouldYield?.()) {
      await new Promise<void>((resolve) => setTimeout(resolve, 4));
      signal.throwIfAborted();
      this.assertEpoch(epoch);
    }
  }
  private windowBounds(
    page: AvifPreviewPage,
    window: NativePreviewWindow,
    nativeSize: { width: DevicePixels; height: DevicePixels }
  ): [number, number, number, number] {
    const sx = page.entry.scale,
      sy = page.entry.scale;
    return [
      Math.max(0, Math.floor(window.source.x * sx) - 1),
      Math.max(0, Math.floor(window.source.y * sy) - 1),
      Math.min(
        page.entry.width,
        Math.ceil((window.source.x + window.source.width) * sx) + 1
      ),
      Math.min(
        page.entry.height,
        Math.ceil((window.source.y + window.source.height) * sy) + 1
      ),
    ];
  }
  /** Return one uniformly decoded viewport at target/finer (<=2x display) or its immediate parent. */
  availablePage(
    window: NativePreviewWindow,
    nativeSize: { width: DevicePixels; height: DevicePixels },
    target: AvifPreviewPage
  ): AvifPreviewPage | null {
    if (
      !this.index ||
      nativeSize.width !== this.index.sourceSensorDimensions[0] ||
      nativeSize.height !== this.index.sourceSensorDimensions[1]
    )
      return null;
    const density = Math.max(
      window.target.width / window.source.width,
      window.target.height / window.source.height
    );
    const tolerance = Math.max(1 / nativeSize.width, 1 / nativeSize.height);
    const pages = Object.entries(this.index.levels)
      .map(
        ([level, entry]): AvifPreviewPage => ({
          level: Number(level),
          entry,
          getWidth: () => entry.width,
          getHeight: () => entry.height,
        })
      )
      .filter(
        (page) =>
          page.entry.scale >= target.entry.scale / 2 &&
          page.entry.scale <= density * 2 + tolerance
      )
      .sort((a, b) => b.entry.scale - a.entry.scale);
    return (
      pages.find((page) =>
        this.hasCached(page, this.windowBounds(page, window, nativeSize))
      ) ?? null
    );
  }
  /** Native linear bitmap drawing with a bounded seam-free ROI stitch, never RGBA readback. */
  async drawBBoxTo(
    page: AvifPreviewPage,
    bounds: [number, number, number, number],
    context: OffscreenCanvasRenderingContext2D,
    destination: { x: number; y: number; width: number; height: number },
    signal: AbortSignal
  ): Promise<void> {
    return this.withFreshAsset(signal, async () => {
      const index = await this.metadata(signal),
        entry = index.levels[page.level];
      if (
        !entry ||
        entry.width !== page.getWidth() ||
        entry.height !== page.getHeight()
      )
        throw Error("Replacement AVIF level differs from calibrated extent");
      const current =
        entry === page.entry
          ? page
          : {
              level: page.level,
              entry,
              getWidth: () => entry.width,
              getHeight: () => entry.height,
            };
      await this.drawBBoxOnce(current, bounds, context, destination, signal);
    });
  }
  private async drawBBoxOnce(
    page: AvifPreviewPage,
    bounds: [number, number, number, number],
    context: OffscreenCanvasRenderingContext2D,
    destination: { x: number; y: number; width: number; height: number },
    signal: AbortSignal
  ): Promise<void> {
    signal.throwIfAborted();
    const [left, top, right, bottom] = bounds;
    if (
      !bounds.every(Number.isFinite) ||
      left < 0 ||
      top < 0 ||
      right > page.entry.width ||
      bottom > page.entry.height ||
      right <= left ||
      bottom <= top ||
      !Object.values(destination).every(Number.isFinite) ||
      destination.width <= 0 ||
      destination.height <= 0
    )
      throw Error("Invalid AVIF bitmap viewport");
    const epoch = this.epoch,
      index = await this.metadata(signal);
    if (index.levels[page.level] !== page.entry) throw new AssetChanged();
    const sx = destination.width / (right - left),
      sy = destination.height / (bottom - top);
    context.save();
    context.beginPath();
    context.rect(
      destination.x,
      destination.y,
      destination.width,
      destination.height
    );
    context.clip();
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "low";
    try {
      const whole = this.bitmaps.get(`${page.level}:whole`);
      if (whole) {
        context.drawImage(
          whole,
          left,
          top,
          right - left,
          bottom - top,
          destination.x,
          destination.y,
          destination.width,
          destination.height
        );
        return;
      }
      const grid = await this.grid(page, signal);
      const nativeLeft = Math.max(0, Math.floor(left) - 1);
      const nativeRight = Math.min(page.entry.width, Math.ceil(right) + 1);
      const stitchWidth = nativeRight - nativeLeft;
      // Fractional scaled edges of separate opaque tiles can leave dark seams.
      // Join integer native pixels first, then interpolate once across tile edges.
      // Tall crops are split on integral output rows so this never creates a full-photo canvas.
      const tileRowWorkingBytes = Math.min(
        16 * 1024 * 1024,
        stitchWidth * (grid.edgeY + 3) * 4
      );
      // A zero retained-cache budget still needs a practical streaming working set.
      // One native tile row avoids decoding the same 512px cells once per output row.
      const stitchByteLimit = Math.min(
        32 * 1024 * 1024,
        Math.max(tileRowWorkingBytes, this.cacheBudget / 2)
      );
      const sourceRows = Math.max(
        1,
        Math.floor(stitchByteLimit / (stitchWidth * 4)) - 3
      );
      const outputRows = Math.max(1, Math.floor(sourceRows * sy));
      for (
        let outputY = 0;
        outputY < destination.height;
        outputY += outputRows
      ) {
        signal.throwIfAborted();
        this.assertEpoch(epoch);
        const outputHeight = Math.min(outputRows, destination.height - outputY);
        const bandTop = top + outputY / sy,
          bandBottom = top + (outputY + outputHeight) / sy;
        const nativeTop = Math.max(0, Math.floor(bandTop) - 1);
        const nativeBottom = Math.min(
          page.entry.height,
          Math.ceil(bandBottom) + 1
        );
        const lease = this.nativeCanvases.acquire({
          width: stitchWidth as DevicePixels,
          height: (nativeBottom - nativeTop) as DevicePixels,
        });
        this.trimResidentCaches();
        try {
          const cells: { item: AvifItem; x: number; y: number }[] = [];
          for (
            let y = Math.floor(nativeTop / grid.edgeY);
            y < Math.ceil(nativeBottom / grid.edgeY);
            y++
          )
            for (
              let x = Math.floor(nativeLeft / grid.edgeX);
              x < Math.ceil(nativeRight / grid.edgeX);
              x++
            ) {
              const item = grid.index.cells[y * grid.cols + x];
              if (!item) throw Error("Missing AVIF viewport cell");
              cells.push({ item, x: x * grid.edgeX, y: y * grid.edgeY });
            }
          const missing = cells.filter(
            ({ item }) => !this.bitmaps.has(`${page.level}:${item.id}`)
          );
          if (this.nativeSource)
            await this.readNativeCells(
              page,
              grid,
              missing.map(({ item }) => item),
              signal,
              this.priority === "low" ? "low" : "high"
            );
          else
            for (const range of this.cellRanges(
              page,
              grid,
              missing.map(({ item }) => item)
            )) {
              signal.throwIfAborted();
              this.assertEpoch(epoch);
              await this.range(range.offset, range.length, signal);
            }
          lease.context.imageSmoothingEnabled = false;
          for (const { item, x, y } of cells) {
            signal.throwIfAborted();
            this.assertEpoch(epoch);
            const decoded = await this.cell(page, grid, item, signal);
            try {
              signal.throwIfAborted();
              this.assertEpoch(epoch);
              const width = Math.min(
                decoded.bitmap.width,
                page.entry.width - x
              );
              const height = Math.min(
                decoded.bitmap.height,
                page.entry.height - y
              );
              lease.context.drawImage(
                decoded.bitmap,
                0,
                0,
                width,
                height,
                x - nativeLeft,
                y - nativeTop,
                width,
                height
              );
            } finally {
              if (!decoded.retained) decoded.bitmap.close();
            }
          }
          context.drawImage(
            lease.canvas,
            left - nativeLeft,
            bandTop - nativeTop,
            right - left,
            bandBottom - bandTop,
            destination.x,
            destination.y + outputY,
            destination.width,
            outputHeight
          );
        } finally {
          lease.release();
          this.trimResidentCaches();
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    } finally {
      context.restore();
    }
  }
  private async windowCells(
    page: AvifPreviewPage,
    window: NativePreviewWindow,
    nativeSize: { width: DevicePixels; height: DevicePixels },
    signal: AbortSignal
  ) {
    const grid = await this.grid(page, signal);
    const bounds = this.windowBounds(page, window, nativeSize);
    const [left, top, right, bottom] = bounds;
    const centerX = (left + right) / 2,
      centerY = (top + bottom) / 2;
    const cells: { item: AvifItem; distance: number }[] = [];
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
        if (item)
          cells.push({
            item,
            distance:
              ((x + 0.5) * grid.edgeX - centerX) ** 2 +
              ((y + 0.5) * grid.edgeY - centerY) ** 2,
          });
      }
    return {
      grid,
      bounds,
      cells: cells
        .sort((a, b) => a.distance - b.distance)
        .map(({ item }) => item),
    };
  }
  private async warmCells(
    page: AvifPreviewPage,
    grid: Grid,
    cells: AvifItem[],
    signal: AbortSignal,
    options: AvifWarmOptions,
    role?: AvifNeighborhoodRole
  ) {
    const epoch = this.epoch;
    if (this.bitmaps.has(`${page.level}:whole`)) return;
    // Coalesce adjacent payloads before any decode. Persistence keeps batches
    // useful even when their compressed RAM entries exceed the active budget.
    const missing = cells.filter(
      (item) => !this.bitmaps.has(`${page.level}:${item.id}`)
    );
    let totalRanges = 0;
    if (this.nativeSource) {
      await this.warmPause(signal, epoch, options);
      await this.readNativeCells(
        page,
        grid,
        missing,
        signal,
        "low",
        (done, total) => {
          totalRanges = total;
          options.onProgress?.({
            level: page.level,
            role,
            fetchedRanges: done,
            totalRanges: total,
            residentBytes: this.residentBytes,
          });
        }
      );
    } else {
      const ranges = this.cellRanges(page, grid, missing);
      totalRanges = ranges.length;
      for (const [n, range] of ranges.entries()) {
        await this.warmPause(signal, epoch, options);
        await this.range(range.offset, range.length, signal, false, true);
        options.onProgress?.({
          level: page.level,
          role,
          fetchedRanges: n + 1,
          totalRanges,
          residentBytes: this.residentBytes,
        });
      }
    }
    if (options.decode === false) return;
    for (const item of cells) {
      await this.warmPause(signal, epoch, options);
      if (this.bitmaps.has(`${page.level}:${item.id}`)) continue;
      const available =
        this.unprotectedDecodedLimit() -
        (this.bitmapBytes - this.overviewBytes);
      if (grid.edgeX * grid.edgeY * 4 > available) break;
      const decoded = await this.cell(page, grid, item, signal);
      if (!decoded.retained) {
        decoded.bitmap.close();
        break;
      }
      options.onProgress?.({
        level: page.level,
        role,
        fetchedRanges: totalRanges,
        totalRanges,
        residentBytes: this.residentBytes,
      });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
  private async warmDecodedPage(
    page: AvifPreviewPage,
    window: NativePreviewWindow,
    nativeSize: { width: DevicePixels; height: DevicePixels },
    signal: AbortSignal,
    options: AvifWarmOptions
  ) {
    if (this.bitmaps.has(`${page.level}:whole`)) return;
    const { grid, cells } = await this.windowCells(
      page,
      window,
      nativeSize,
      signal
    );
    if (
      options.decode !== false &&
      grid.edgeX * grid.edgeY * 4 >
        this.unprotectedDecodedLimit() - (this.bitmapBytes - this.overviewBytes)
    )
      return;
    await this.warmCells(page, grid, cells, signal, options);
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
    this.decoders.configureBudget(
      Math.max(
        0,
        this.cacheBudget -
          this.bitmapBytes -
          (this.nativeSource?.compressedBytes ?? 0) -
          this.canvasBytes
      )
    );
    // Idle scratch surfaces share the source budget; native decoder-internal memory is not observable.
    if (
      this.canvasBytes >
      Math.max(this.cacheBudget, this.overviewBytes) -
        (this.nativeSource?.compressedBytes ?? 0) -
        this.bitmapBytes
    ) {
      this.decodeCanvases.trim();
      this.nativeCanvases.trim();
    }
    const decodedLimit = this.overviewBytes + this.unprotectedDecodedLimit();
    while (this.bitmapBytes > decodedLimit && this.bitmaps.size) {
      const key = [...this.bitmaps.keys()].find(
        (key) => key !== this.protectedOverviewKey
      );
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
    return Math.min(
      this.bitmapLimit,
      Math.max(
        0,
        this.cacheBudget -
          this.overviewBytes -
          (this.nativeSource?.compressedBytes ?? 0) -
          this.canvasBytes -
          this.decoders.workingBytes
      )
    );
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
    this.nativeCanvases.trim();
    this.decoders.trimTo(0);
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
    this.decoders.clear();
    if (this.ownsNativeSource) this.nativeSource?.dispose();
    this.nativeSource = undefined;
    this.ownsNativeSource = false;
    this.epoch++;
    for (const pending of this.pendingCells.values())
      pending.controller.abort();
    this.pendingCells.clear();
    this.decodedCells.clear();
    this.protectedOverviewKey = null;
    this.overviewRequest = null;
    this.pendingRanges.clear();
    this.fetchedRanges.clear();
    this.index = null;
    this.nativeBootstrap = null;
    this.fileBytes = 0;
    this.metadataRequest = null;
    this.metadataSignal = null;
    for (const bitmap of this.bitmaps.values()) bitmap.close();
    this.bitmaps.clear();
    this.bitmapBytes = 0;
    this.grids.clear();
    this.neighborhood = [];
    this.decodeCanvases.trim();
    this.nativeCanvases.trim();
  }
  private async range(
    offset: number,
    length: number,
    signal: AbortSignal,
    allowShort = false,
    persistBeforeReturn = false
  ): Promise<Uint8Array> {
    const epoch = this.epoch,
      key = `${offset}:${length}`,
      pending = this.pendingRanges.get(key) ?? {
        range: { offset, length },
        consumers: 0,
      };
    pending.consumers++;
    this.pendingRanges.set(key, pending);
    try {
      const bytes = await this.loadRange(
        offset,
        length,
        signal,
        allowShort,
        persistBeforeReturn
      );
      this.assertEpoch(epoch);
      this.fetchedRanges.set(key, { offset, length: bytes.length });
      return bytes;
    } finally {
      if (this.epoch === epoch && --pending.consumers === 0)
        this.pendingRanges.delete(key);
    }
  }
  private async loadRange(
    offset: number,
    length: number,
    signal: AbortSignal,
    _allowShort: boolean,
    persistBeforeReturn: boolean
  ): Promise<Uint8Array> {
    signal.throwIfAborted();
    const native = this.nativeSource;
    if (!native) throw Error("Native AVIF metadata unavailable");
    try {
      return await native.read(offset, length, signal, {
        priority:
          persistBeforeReturn || this.priority === "low" ? "low" : "high",
      });
    } catch (error) {
      if (error instanceof AssetChanged) this.invalidateAsset(this.epoch);
      throw error;
    }
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
  private async nativeMetadata(
    native: NativeAvifByteSource,
    signal: AbortSignal,
    epoch: number
  ): Promise<PyramidIndex> {
    const bootstrap = await native.open(signal, {
      priority: this.priority === "low" ? "low" : "high",
    });
    this.assertEpoch(epoch);
    this.nativeBootstrap = bootstrap;
    this.fileBytes = bootstrap.layout.fileBytes;
    const levels = Object.fromEntries(
      [...bootstrap.layout.levels.keys()].map((level) => [
        String(level),
        nativeLevelEntry(bootstrap, level),
      ])
    );
    return (this.index = {
      sourceSensorDimensions: bootstrap.document?.pixelMapping
        .calibrationDimensions ?? [
        bootstrap.layout.index.dimensions.width,
        bootstrap.layout.index.dimensions.height,
      ],
      levels,
    });
  }

  private async loadMetadata(
    signal: AbortSignal,
    epoch: number
  ): Promise<PyramidIndex> {
    let native = this.nativeSource ?? getRegisteredNativeAvif(this.fetchUrl);
    if (!native) {
      native = new NativeAvifByteSource(this.fetchUrl);
      this.ownsNativeSource = true;
    }
    this.nativeSource = native;
    return this.nativeMetadata(native, signal, epoch);
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
            window.source.width * p.entry.scale >=
              requiredPixels(window.target.width, factor) &&
            window.source.height * p.entry.scale >=
              requiredPixels(window.target.height, factor)
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
    const cached = this.grids.get(page.level);
    if (cached) return cached;
    signal.throwIfAborted();
    if (!this.nativeBootstrap)
      throw new Error("Native AVIF metadata is unavailable");
    const index = this.nativeBootstrap.layout.levels.get(page.level)!;
    const ispe = index.cells[0].properties.find((p) => p.type === "ispe")!;
    const v = new DataView(Uint8Array.from(ispe.bytes).buffer);
    const grid = {
      index,
      cols: this.nativeBootstrap.layout.cols,
      edgeX: v.getUint32(12),
      edgeY: v.getUint32(16),
      absolute: new Map(index.cells.map((c) => [c.id, c.ranges])),
    };
    this.grids.set(page.level, grid);
    return grid;
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
  private async readNativeCells(
    page: AvifPreviewPage,
    grid: Grid,
    cells: readonly AvifItem[],
    signal: AbortSignal,
    priority: "high" | "low",
    onRange?: (done: number, total: number) => void
  ) {
    const native = this.nativeSource!;
    const epoch = this.epoch;
    const ready = new Map<string, Uint8Array>();
    const byLayer = [4, 3, 2, 1].map((level) => ({
      level,
      ranges: cells.flatMap((item) => {
        const range = (grid.absolute.get(item.id) ??
          item.ranges.map((range) => ({
            offset: range.offset + page.entry.offset,
            length: range.length,
          })))[4 - level];
        return range ? [range] : [];
      }),
    }));
    const total = byLayer.reduce((sum, layer) => sum + layer.ranges.length, 0);
    let done = 0;
    try {
      // Launch every required physical layer together; a slow enhancement
      // cannot hold another consumer's already complete coarse prefix.
      await Promise.all(
        byLayer.map(({ level, ranges }) =>
          native.readRanges(
            ranges,
            signal,
            { priority, level },
            (range, bytes) => {
              this.assertEpoch(epoch);
              const key = `${range.offset}:${range.length}`;
              ready.set(key, bytes);
              this.fetchedRanges.set(key, range);
              onRange?.(++done, total);
            }
          )
        )
      );
    } catch (error) {
      if (error instanceof AssetChanged) this.invalidateAsset(epoch);
      throw error;
    }
    return ready;
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
    let parts: Uint8Array[];
    if (this.nativeSource) {
      const ready = await this.readNativeCells(
        page,
        grid,
        [item],
        signal,
        this.priority === "low" ? "low" : "high"
      );
      parts = ranges.map(
        (range) => ready.get(`${range.offset}:${range.length}`)!
      );
    } else
      parts = await Promise.all(
        ranges.map((r) => this.range(r.offset, r.length, signal))
      );
    const payload = concatenate(parts);
    signal.throwIfAborted();
    this.assertEpoch(epoch);
    const fallback = () => {
      const bytes = makeAvifTile(grid.index, item, payload);
      return createImageBitmap(
        new Blob([new Uint8Array(bytes)], { type: "image/avif" }),
        { premultiplyAlpha: "none" }
      );
    };
    const fullIndex = this.nativeBootstrap?.layout.index;
    const fullCell = fullIndex?.cells.find((cell) => cell.id === item.id);
    this.decoders.configureBudget(
      Math.max(
        0,
        this.cacheBudget -
          this.bitmapBytes -
          (this.nativeSource?.compressedBytes ?? 0) -
          this.canvasBytes
      )
    );
    const retain = this.neighborhood.some(
      (candidate) =>
        candidate.page.level < page.level &&
        candidate.cells.some((cell) => cell.id === item.id)
    );
    const bitmap =
      fullIndex && fullCell
        ? await this.decoders.decode(
            fullIndex,
            fullCell,
            payload,
            { width: grid.edgeX, height: grid.edgeY },
            signal,
            fallback,
            retain
          )
        : await fallback();
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
    const whole = this.bitmaps.get(wholeKey);
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
      if (this.nativeSource)
        await this.readNativeCells(
          page,
          grid,
          missing.map(({ item }) => item),
          signal,
          this.priority === "low" ? "low" : "high"
        );
      else if (
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
