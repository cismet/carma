import {
  imageTileKey,
  planImageLevels,
  usedImageLevels,
  type ImageLevel,
  type ImageLevelPlan,
  type ImageLevelPlanOptions,
  type ImageTileWant,
  type ImageView,
} from "../core/image-level-plan";
import type { ImagePyramid, ImageTileSource } from "./image-tile-source";

export const IMAGE_STACK_WORK = {
  Full: "full",
  Visible: "visible",
  Prewarm: "prewarm",
  Paused: "paused",
} as const;
type ImageStackWork = (typeof IMAGE_STACK_WORK)[keyof typeof IMAGE_STACK_WORK];

export type ImageLevelStackOptions = Omit<
  ImageLevelPlanOptions,
  "decodedByteBudget" | "zoomIntent"
> & {
  /** Decoded RGBA bytes for one image from its physical viewport pixels. */
  decodedBudget?: (viewportPixels: number) => number;
  /** Decoded bytes kept while parked in a pool; the floor goes first into it. */
  parkedBudgetBytes?: number;
  maxFetches?: number;
  maxDecodes?: number;
  /** Compressed-only idle prefetch after all planned work is done. */
  idlePrefetch?: "none" | "next-level" | "pyramid";
};
export type ImageTileState = 0 | 1 | 2 | 3;
export type ImageLevelReadiness = Readonly<{
  level: number;
  width: number;
  height: number;
  cols: number;
  rows: number;
  /** 0 missing, 1 requested, 2 compressed locally, 3 decoded. */
  states: Uint8Array;
}>;
export type ImageLevelStackMetrics = Readonly<{
  decodedBytes: number;
  decodedTiles: number;
  budgetBytes: number;
  compressedBytes: number;
  requests: number;
  fetching: number;
  decoding: number;
  target: number | null;
  targetScale: number | null;
  /** Every visible target tile, or its parent underneath, is decoded. */
  visibleReady: boolean;
}>;
type Resident = {
  bitmap: ImageBitmap;
  bytes: number;
  used: number;
  level: number;
};

const CATEGORY = 1e9;
const MAX_BATCH_TILES = 32;
/**
 * Ten physical viewports of RGBA: the target alone needs up to four, plus whole
 * 512 tiles at the edges, the underlay, pan rings and the next finer level.
 */
const defaultBudget = (viewportPixels: number) =>
  Math.max(96 * 1024 * 1024, viewportPixels * 4 * 10);

/**
 * Decoded tiles for one image, kept per pyramid level and scheduled from the
 * current view. Rendering reads resident tiles synchronously every frame.
 */
export class ImageLevelStack {
  readonly ready: Promise<ImagePyramid>;
  private pyramidValue: ImagePyramid | null = null;
  private planValue: ImageLevelPlan | null = null;
  private view: ImageView | null = null;
  private viewportPixels = 0;
  private zoomIntent: "in" | "out" | null = null;
  private readonly resident = new Map<string, Resident>();
  private decodedBytes = 0;
  private readonly fetching = new Set<string>();
  private readonly decoding = new Set<string>();
  /** Decoded but refused for lack of budget; retried only after the next replan. */
  private readonly skipped = new Set<string>();
  private fetches = 0;
  private decodes = 0;
  private idleQueue: ImageTileWant[] | null = null;
  private controller = new AbortController();
  /** Aborted only on dispose; parking must not cancel opening the pyramid. */
  private readonly lifetime = new AbortController();
  private readonly listeners = new Set<() => void>();
  private readonly contentListeners = new Set<() => void>();
  private viewKey = "";
  private readonly evictListeners = new Set<
    (key: string, bitmap: ImageBitmap) => void
  >();
  private active = true;
  private work: ImageStackWork = IMAGE_STACK_WORK.Full;
  private disposed = false;
  error: string | null = null;

  private options: ImageLevelStackOptions;

  constructor(
    readonly source: ImageTileSource,
    options: ImageLevelStackOptions = {}
  ) {
    this.options = { ...options };
    this.ready = source.open(this.lifetime.signal);
    this.ready.then(
      (pyramid) => {
        this.pyramidValue = pyramid;
        this.replan();
      },
      (error) => {
        if (this.disposed) return;
        this.error = error instanceof Error ? error.message : String(error);
        this.emit();
      }
    );
  }

  get pyramid() {
    return this.pyramidValue;
  }
  get plan() {
    return this.planValue;
  }
  get budgetBytes() {
    return (this.options.decodedBudget ?? defaultBudget)(this.viewportPixels);
  }

  setView(
    view: ImageView,
    viewportPixels: number,
    zoomIntent: "in" | "out" | null = null
  ) {
    if (this.disposed) return;
    const { visible, density, focus } = view;
    const key = [
      visible.x,
      visible.y,
      visible.width,
      visible.height,
      density,
      focus?.x,
      focus?.y,
      viewportPixels,
      zoomIntent,
    ].join();
    // Hosts call this every frame; an unchanged view must not replan or notify.
    if (key === this.viewKey && this.active) return;
    this.viewKey = key;
    this.view = view;
    this.viewportPixels = viewportPixels;
    this.zoomIntent = zoomIntent;
    if (!this.active) {
      this.active = true;
      this.controller = new AbortController();
    }
    this.replan();
  }

  /** Pool admission, independent of visibility and decoded residency. */
  setWork(work: ImageStackWork) {
    if (this.disposed || this.work === work) return;
    const previous = this.work;
    this.work = work;
    if (work !== IMAGE_STACK_WORK.Paused)
      this.source.priority = work === IMAGE_STACK_WORK.Prewarm ? "low" : "high";
    // Restricting work interrupts speculative traffic. Promotion keeps its
    // in-flight target requests and already decoded tiles intact.
    if (
      work === IMAGE_STACK_WORK.Paused ||
      (previous === IMAGE_STACK_WORK.Full && work !== IMAGE_STACK_WORK.Full)
    ) {
      this.controller.abort();
      this.source.pause();
      this.controller = new AbortController();
    }
    this.pump();
  }

  /** Change planning options, e.g. foveation, for the next and current view. */
  configure(options: Partial<ImageLevelStackOptions>) {
    this.options = { ...this.options, ...options };
    this.replan();
  }

  /** Synchronous render access; marks the tile as recently used. */
  tile(level: number, col: number, row: number): ImageBitmap | undefined {
    const entry = this.resident.get(imageTileKey(level, col, row));
    if (entry) entry.used = performance.now();
    return entry?.bitmap;
  }
  isResident(level: number, col: number, row: number) {
    return this.resident.has(imageTileKey(level, col, row));
  }

  /** Any state change, for diagnostics. */
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  /** Resident tiles changed: renderers redraw only on this. */
  onContentChange(listener: () => void) {
    this.contentListeners.add(listener);
    return () => {
      this.contentListeners.delete(listener);
    };
  }
  /** Renderers release GPU copies of evicted tiles here. */
  onEvict(listener: (key: string, bitmap: ImageBitmap) => void) {
    this.evictListeners.add(listener);
    return () => {
      this.evictListeners.delete(listener);
    };
  }

  /** Diagnostics for the levels this stack uses, finest first. */
  readiness(): ImageLevelReadiness[] {
    return this.usedLevels().map((level) => {
      const states = new Uint8Array(level.cols * level.rows);
      for (let row = 0; row < level.rows; row++)
        for (let col = 0; col < level.cols; col++) {
          const key = imageTileKey(level.level, col, row);
          states[row * level.cols + col] = this.resident.has(key)
            ? 3
            : this.source.hasBytes({ level: level.level, col, row })
            ? 2
            : this.fetching.has(key) || this.decoding.has(key)
            ? 1
            : 0;
        }
      return {
        level: level.level,
        width: level.width,
        height: level.height,
        cols: level.cols,
        rows: level.rows,
        states,
      };
    });
  }

  get metrics(): ImageLevelStackMetrics {
    const plan = this.planValue;
    return {
      decodedBytes: this.decodedBytes,
      decodedTiles: this.resident.size,
      budgetBytes: this.budgetBytes,
      compressedBytes: this.source.compressedBytes,
      requests: this.source.requestCount,
      fetching: this.fetches,
      decoding: this.decodes,
      target: plan?.target ?? null,
      targetScale: plan ? plan.scale(plan.target) : null,
      visibleReady:
        !!plan &&
        plan.wants.every(
          (want) =>
            (want.role !== "target" && want.role !== "target-periphery") ||
            this.resident.has(want.key)
        ),
    };
  }

  /** Stop scheduling and shrink to the parked budget, keeping the most useful tiles. */
  park() {
    if (this.disposed || !this.active) return;
    this.active = false;
    this.controller.abort();
    // Another image has the focus: stop this one's network traffic, keep its tiles.
    this.source.pause();
    this.idleQueue = null;
    const budget = this.options.parkedBudgetBytes ?? 8 * 1024 * 1024;
    const rank = this.rankByPlan();
    const keep = [...this.resident.entries()].sort(
      (a, b) => rank(a[0]) - rank(b[0])
    );
    let bytes = 0;
    for (const [key, entry] of keep) {
      bytes += entry.bytes;
      if (bytes > budget) this.evict(key);
    }
    this.emit();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.controller.abort();
    this.lifetime.abort();
    for (const key of [...this.resident.keys()]) this.evict(key);
    this.source.dispose();
    this.listeners.clear();
    this.contentListeners.clear();
    this.evictListeners.clear();
  }

  private usedLevels() {
    const pyramid = this.pyramidValue;
    return pyramid
      ? usedImageLevels(pyramid.levels, this.options.minLevelEdge)
      : [];
  }

  private replan() {
    const pyramid = this.pyramidValue,
      view = this.view;
    if (!pyramid || !view || this.disposed) return;
    this.planValue = planImageLevels(pyramid.levels, pyramid.native, view, {
      ...this.options,
      decodedByteBudget: this.budgetBytes,
      zoomIntent: this.zoomIntent,
    });
    this.idleQueue = null;
    this.skipped.clear();
    this.trim(this.budgetBytes);
    // Let the pool suspend background work before admitting this view's demand.
    this.emit();
    this.pump();
  }

  private rankByPlan() {
    const priorities = new Map(
      (this.planValue?.wants ?? [])
        .filter((want) => want.decode)
        .map((want) => [want.key, want.priority])
    );
    return (key: string) => priorities.get(key) ?? Infinity;
  }

  /** Evict tiles outside the decoded plan first, least recently drawn first. */
  private trim(budget: number, outsidePlanOnly = false) {
    if (this.decodedBytes <= budget) return;
    const rank = this.rankByPlan();
    const floor = this.planValue?.floor;
    const candidates = [...this.resident.entries()]
      .filter(
        ([key, entry]) =>
          entry.level !== floor && (!outsidePlanOnly || rank(key) === Infinity)
      )
      .sort((a, b) => rank(b[0]) - rank(a[0]) || a[1].used - b[1].used);
    for (const [key] of candidates) {
      if (this.decodedBytes <= budget) break;
      this.evict(key);
    }
  }

  private evict(key: string) {
    const entry = this.resident.get(key);
    if (!entry) return;
    this.resident.delete(key);
    this.decodedBytes -= entry.bytes;
    for (const listener of this.evictListeners) listener(key, entry.bitmap);
    entry.bitmap.close();
    for (const listener of this.contentListeners) listener();
  }

  private pump() {
    const plan = this.planValue;
    if (
      !plan ||
      !this.active ||
      this.disposed ||
      this.work === IMAGE_STACK_WORK.Paused
    )
      return;
    const warming = this.work === IMAGE_STACK_WORK.Prewarm;
    const maxDecodes = warming ? 1 : this.options.maxDecodes ?? 4;
    const maxFetches = warming ? 1 : this.options.maxFetches ?? 3;
    const wants =
      this.work === IMAGE_STACK_WORK.Full
        ? plan.wants
        : plan.wants.filter(
            (want) =>
              want.role === "floor" ||
              want.role === "underlay" ||
              want.role === "target" ||
              want.role === "target-periphery"
          );
    for (const want of wants) {
      if (this.decodes >= maxDecodes) break;
      if (
        !want.decode ||
        this.resident.has(want.key) ||
        this.decoding.has(want.key) ||
        this.skipped.has(want.key)
      )
        continue;
      if (this.source.hasBytes(want)) this.decode(want);
    }
    while (this.fetches < maxFetches) {
      const batch = this.nextBatch(wants);
      if (!batch.length) break;
      this.fetch(
        batch,
        warming || batch[0].priority >= 7 * CATEGORY ? "low" : "high"
      );
    }
    if (this.work === IMAGE_STACK_WORK.Full && !this.fetches && !this.decodes)
      this.idle();
  }

  private needsBytes(want: ImageTileWant) {
    return (
      !this.resident.has(want.key) &&
      !this.fetching.has(want.key) &&
      !this.source.hasBytes(want)
    );
  }

  /** Next missing tiles of one level and priority class, so they share merged requests. */
  private nextBatch(wants: readonly ImageTileWant[]) {
    const first = wants.find((want) => this.needsBytes(want));
    if (!first) return [];
    const category = Math.floor(first.priority / CATEGORY);
    return wants
      .filter(
        (want) =>
          want.level === first.level &&
          Math.floor(want.priority / CATEGORY) === category &&
          this.needsBytes(want)
      )
      .slice(0, MAX_BATCH_TILES);
  }

  private fetch(batch: readonly ImageTileWant[], priority: "high" | "low") {
    const signal = this.controller.signal;
    this.fetches++;
    for (const want of batch) {
      this.fetching.add(want.key);
    }
    this.source
      .fetch(batch, signal, priority)
      .catch((error) => this.fail(error, signal))
      .finally(() => {
        this.fetches--;
        for (const want of batch) this.fetching.delete(want.key);
        if (!this.disposed) {
          this.pump();
          this.emit();
        }
      });
  }

  private decode(want: ImageTileWant) {
    const signal = this.controller.signal;
    this.decodes++;
    this.decoding.add(want.key);
    this.source
      .decode(want, signal)
      .then((bitmap) => this.admit(want, bitmap, signal))
      .catch((error) => this.fail(error, signal))
      .finally(() => {
        this.decodes--;
        this.decoding.delete(want.key);
        if (!this.disposed) this.pump();
      });
  }

  private admit(want: ImageTileWant, bitmap: ImageBitmap, signal: AbortSignal) {
    if (this.disposed || signal.aborted || this.resident.has(want.key)) {
      bitmap.close();
      return;
    }
    const bytes = bitmap.width * bitmap.height * 4;
    // Room comes only from tiles outside the plan; planned tiles never evict
    // each other, which would decode them in turn forever.
    this.trim(this.budgetBytes - bytes, true);
    if (this.decodedBytes + bytes > this.budgetBytes && want.role !== "floor") {
      bitmap.close();
      this.skipped.add(want.key);
      return;
    }
    this.resident.set(want.key, {
      bitmap,
      bytes,
      used: performance.now(),
      level: want.level,
    });
    this.decodedBytes += bytes;
    for (const listener of this.contentListeners) listener();
    this.emit();
  }

  private fail(error: unknown, signal: AbortSignal) {
    if (signal.aborted || this.disposed) return;
    this.error = error instanceof Error ? error.message : String(error);
  }

  /** Compressed prefetch while nothing planned is pending: next finer level, then the pyramid. */
  private idle() {
    const mode = this.options.idlePrefetch ?? "pyramid";
    const plan = this.planValue,
      pyramid = this.pyramidValue;
    if (mode === "none" || !plan || !pyramid) return;
    if (!this.idleQueue) {
      const levels = this.usedLevels();
      const order: ImageLevel[] = [];
      const finer = levels.find((level) => level.level === plan.finer);
      if (finer) order.push(finer);
      if (mode === "pyramid")
        order.push(
          ...levels
            .filter((level) => level !== finer)
            .sort((a, b) => b.level - a.level)
        );
      this.idleQueue = order.flatMap((level) =>
        Array.from({ length: level.cols * level.rows }, (_, i) => ({
          key: imageTileKey(
            level.level,
            i % level.cols,
            Math.floor(i / level.cols)
          ),
          level: level.level,
          col: i % level.cols,
          row: Math.floor(i / level.cols),
          role: "finer-ring" as const,
          priority: 9 * CATEGORY + i,
          decode: false,
          bytes: 0,
        }))
      );
    }
    const batch = this.nextBatch(this.idleQueue);
    if (batch.length) this.fetch(batch, "low");
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }
}
