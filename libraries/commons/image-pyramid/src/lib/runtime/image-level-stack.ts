import type { DevicePixels } from "@carma-units";
import {
  imageTileKey,
  planImageLevels,
  usedImageLevels,
  type ImageLevel,
  type ImageLevelPlan,
  type ImageLevelPlanOptions,
  type ImageTileRange,
  type ImageTileWant,
  type ImageView,
} from "../core/image-level-plan";
import {
  ImagePrefetchBudgetExceeded,
  type ImagePyramid,
  type ImagePrefetchBudget,
  type ImageTileFetchContext,
  type ImageTileRef,
  type ImageTileSource,
} from "./image-tile-source";

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
  /** Optional parked decoded budget; the floor remains available for thumbnails. */
  parkedBudgetBytes?: number;
  maxFetches?: number;
  maxDecodes?: number;
  /** Compressed-only idle prefetch; a resolver can follow the selected source format. */
  idlePrefetch?:
    | "none"
    | "next-level"
    | "pyramid"
    | (() => "none" | "next-level" | "pyramid");
  idlePyramidDelayMs?: number;
  prefetchGate?: {
    isOpen: () => boolean;
    subscribe: (listener: () => void) => () => void;
  };
};
export type ImageTileState = 0 | 1 | 2 | 3;
export type ImageLevelContentChange = Readonly<{
  /** Newly resident pixels; consumers may redraw only this tile's source area. */
  tile?: ImageTileRef;
  /** Previously composed coverage is no longer reusable. */
  reset?: boolean;
}>;
export type ImageLevelReadiness = Readonly<{
  /** Physical tile edges; optional for older diagnostic snapshot providers. */
  tileWidth?: number;
  tileHeight?: number;
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
  /** Estimated codec storage, not an additional resident bitmap count or RSS. */
  decoderWorkingBytes?: number;
  decodedTiles: number;
  budgetBytes: number;
  compressedBytes: number;
  requests: number;
  fetching: number;
  decoding: number;
  target: number | null;
  targetScale: number | null;
  /** Every visible target tile is decoded, also when the target is the floor. */
  visibleReady: boolean;
}>;
/** Independent viewport demand sharing the source and decoded tile residency. */
export type ImageLevelStackDemand = Readonly<{
  setView: (
    view: ImageView,
    viewportPixels: number,
    zoomIntent?: "in" | "out" | null
  ) => void;
  plan: ImageLevelPlan | null;
  visibleReady: boolean;
  /** This query's allowance was refused; unrelated consumers stay usable. */
  prefetchExhausted: boolean;
  release: () => void;
}>;
type DemandState = {
  priority: "high" | "low";
  coarseOnly: boolean;
  decode: boolean;
  level?: number;
  prefetchBudget?: ImagePrefetchBudget;
  view: ImageView | null;
  viewportPixels: number;
  zoomIntent: "in" | "out" | null;
  key: string;
  plan: ImageLevelPlan | null;
};
type Resident = {
  bitmap: ImageBitmap;
  bytes: number;
  used: number;
  level: number;
};

const CATEGORY = 1e9;
const MAX_BATCH_TILES = 32;
const criticalWant = (want: ImageTileWant) =>
  want.role === "floor" ||
  want.role === "underlay" ||
  want.role === "target" ||
  want.role === "target-periphery";
const imageViewKey = (
  { visible, density, focus }: ImageView,
  viewportPixels: number,
  zoomIntent: "in" | "out" | null
) =>
  [
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
  private primaryActive = true;
  private readonly demands = new Set<DemandState>();
  private primaryPrefetchBudget: ImagePrefetchBudget | undefined;
  private readonly tileBudgets = new Map<
    string,
    ImagePrefetchBudget | undefined
  >();
  private readonly exhaustedBudgets = new WeakSet<ImagePrefetchBudget>();
  private wants: readonly ImageTileWant[] = [];
  private demandDecodedBytes = 0;
  private readonly highCriticalKeys = new Set<string>();
  private readonly criticalKeys = new Set<string>();
  private readonly highTargetKeys = new Set<string>();
  private viewportPixels = 0;
  private zoomIntent: "in" | "out" | null = null;
  private readonly resident = new Map<string, Resident>();
  private decodedBytes = 0;
  private decoderBudgetBytes = Infinity;
  private readonly fetching = new Set<string>();
  private readonly decoding = new Set<string>();
  /** Decoded but refused for lack of budget; retried only after the next replan. */
  private readonly skipped = new Set<string>();
  private fetches = 0;
  private foregroundFetches = 0;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private lastViewAt = 0;
  private unsubscribePrefetchGate: (() => void) | undefined;
  private decodes = 0;
  private tileWakeQueued = false;
  private idleQueue: ImageTileWant[] | null = null;
  private controller = new AbortController();
  /** Aborted only on dispose; parking must not cancel opening the pyramid. */
  private readonly lifetime = new AbortController();
  private readonly listeners = new Set<() => void>();
  private readonly contentListeners = new Set<
    (event?: ImageLevelContentChange) => void
  >();
  private viewKey = "";
  private readonly evictListeners = new Set<
    (key: string, bitmap: ImageBitmap) => void
  >();
  private active = true;
  private work: ImageStackWork = IMAGE_STACK_WORK.Full;
  private disposed = false;
  error: string | null = null;
  prefetchExhausted = false;

  private options: ImageLevelStackOptions;

  constructor(
    readonly source: ImageTileSource,
    options: ImageLevelStackOptions = {}
  ) {
    this.options = { ...options };
    this.unsubscribePrefetchGate = options.prefetchGate?.subscribe(() =>
      this.pump()
    );
    this.ready = source.open(this.lifetime.signal);
    this.ready.then(
      (pyramid) => {
        if (this.disposed) return;
        this.pyramidValue = pyramid;
        this.replan();
        for (const listener of this.contentListeners) listener({ reset: true });
      },
      (error) => {
        if (this.disposed) return;
        if (error instanceof ImagePrefetchBudgetExceeded)
          this.prefetchExhausted = true;
        else
          this.error = error instanceof Error ? error.message : String(error);
        this.emit();
      }
    );
  }

  get pyramid() {
    return this.pyramidValue;
  }
  get plan() {
    if (this.planValue) return this.planValue;
    for (const demand of this.demands) if (demand.plan) return demand.plan;
    return null;
  }
  get budgetBytes() {
    const budget = this.options.decodedBudget ?? defaultBudget;
    let pixels = this.primaryActive ? this.viewportPixels : 0;
    for (const demand of this.demands) {
      if (demand.view) pixels = Math.max(pixels, demand.viewportPixels);
    }
    // Multiple consumers may need disjoint crops. Reserve their deduplicated
    // decoded union instead of letting one viewport evict another's pixels.
    return Math.max(budget(pixels), this.demandDecodedBytes);
  }

  acquireDemand(
    options: {
      priority?: "high" | "low";
      coarseOnly?: boolean;
      /** False warms compressed tiles without allocating decoded bitmaps. */
      decode?: boolean;
      /** Restrict a prechecked snapshot demand to one exact stored level. */
      level?: number;
      /** Captured for this query's tile requests, independent of other consumers. */
      prefetchBudget?: ImagePrefetchBudget;
    } = {}
  ): ImageLevelStackDemand {
    const state: DemandState = {
      priority: options.priority ?? "high",
      coarseOnly: options.coarseOnly ?? false,
      decode: options.decode ?? true,
      level: options.level,
      prefetchBudget: options.prefetchBudget,
      view: null,
      viewportPixels: 0,
      zoomIntent: null,
      key: "",
      plan: null,
    };
    const stack = this;
    if (!this.disposed) {
      this.demands.add(state);
      // A new, explicitly bounded query may try a smaller fallback level.
      if (state.prefetchBudget)
        this.exhaustedBudgets.delete(state.prefetchBudget);
    }
    return {
      setView(view, viewportPixels, zoomIntent = null) {
        if (stack.disposed || !stack.demands.has(state)) return;
        const key = imageViewKey(view, viewportPixels, zoomIntent);
        if (state.key === key) return;
        Object.assign(state, { view, viewportPixels, zoomIntent, key });
        if (!stack.active) {
          stack.active = true;
          stack.controller = new AbortController();
        }
        stack.replan(false);
      },
      get plan() {
        return state.plan;
      },
      get visibleReady() {
        return stack.demands.has(state) && stack.demandReady(state);
      },
      get prefetchExhausted() {
        return (
          state.priority === "low" &&
          !!state.prefetchBudget &&
          stack.exhaustedBudgets.has(state.prefetchBudget)
        );
      },
      release() {
        if (!stack.demands.delete(state)) return;
        state.plan = null;
        stack.stopWhenUnused();
        stack.replan(false);
      },
    };
  }

  setView(
    view: ImageView,
    viewportPixels: number,
    zoomIntent: "in" | "out" | null = null
  ) {
    if (this.disposed) return;
    const key = imageViewKey(view, viewportPixels, zoomIntent);
    // Hosts call this every frame; an unchanged view must not replan or notify.
    const budget = this.source.prefetchBudget;
    if (
      key === this.viewKey &&
      this.primaryActive &&
      this.active &&
      budget === this.primaryPrefetchBudget
    )
      return;
    this.primaryPrefetchBudget = budget;
    if (budget) this.exhaustedBudgets.delete(budget);
    this.primaryActive = true;
    this.viewKey = key;
    this.lastViewAt = performance.now();
    clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
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
    const promotedPrimary =
      this.primaryPrefetchBudget !== undefined &&
      (work === IMAGE_STACK_WORK.Full || work === IMAGE_STACK_WORK.Visible);
    if (promotedPrimary) this.primaryPrefetchBudget = undefined;
    if (work === IMAGE_STACK_WORK.Full || work === IMAGE_STACK_WORK.Visible)
      this.prefetchExhausted = false;
    if (work !== IMAGE_STACK_WORK.Paused)
      this.source.priority = work === IMAGE_STACK_WORK.Prewarm ? "low" : "high";
    // Restricting work interrupts speculative traffic. Promotion keeps its
    // in-flight target requests and already decoded tiles intact.
    if (
      work === IMAGE_STACK_WORK.Paused ||
      (previous === IMAGE_STACK_WORK.Full && work !== IMAGE_STACK_WORK.Full)
    ) {
      this.controller.abort();
      this.source.pause({ retainDecoders: work === IMAGE_STACK_WORK.Visible });
      this.controller = new AbortController();
    }
    if (promotedPrimary) this.replan(false);
    else this.pump();
  }

  /** Change planning options, e.g. foveation, for the next and current view. */
  configure(options: Partial<ImageLevelStackOptions>) {
    this.options = { ...this.options, ...options };
    this.replan();
  }

  /** Undefined lets the pool set retention from its shared memory pressure. */
  configureParkedBudget(maxBytes?: number) {
    this.options.parkedBudgetBytes = maxBytes;
    if (!this.primaryActive && maxBytes !== undefined)
      this.trimDecodedTo(maxBytes, { protectDemand: false });
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
  onContentChange(listener: (event?: ImageLevelContentChange) => void) {
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
        tileWidth: level.tileWidth,
        tileHeight: level.tileHeight,
        states,
      };
    });
  }

  get visibleReady() {
    const plan = this.plan;
    return !!plan && this.allResident(plan.visibleTarget);
  }
  get foregroundPending() {
    if (
      !this.active ||
      this.disposed ||
      this.error ||
      this.work === IMAGE_STACK_WORK.Prewarm ||
      this.work === IMAGE_STACK_WORK.Paused
    )
      return false;
    if (
      this.primaryActive &&
      (this.view || !this.demands.size) &&
      !this.visibleReady
    )
      return true;
    for (const demand of this.demands)
      if (
        demand.priority === "high" &&
        demand.view &&
        !this.demandReady(demand)
      )
        return true;
    return false;
  }

  get metrics(): ImageLevelStackMetrics {
    const plan = this.plan;
    return {
      decodedBytes: this.decodedBytes,
      decoderWorkingBytes: this.source.decoderWorkingBytes ?? 0,
      decodedTiles: this.resident.size,
      budgetBytes: this.budgetBytes,
      compressedBytes: this.source.compressedBytes,
      requests: this.source.requestCount,
      fetching: this.fetches,
      decoding: this.decodes,
      target: plan?.target ?? null,
      targetScale: plan ? plan.scale(plan.target) : null,
      visibleReady: !!plan && this.allResident(plan.visibleTarget),
    };
  }

  /** By tile range, not want role: a thumbnail's target tiles are floor wants. */
  private allResident(range: ImageTileRange | null) {
    if (!range) return true;
    for (let row = range.row0; row < range.row1; row++)
      for (let col = range.col0; col < range.col1; col++)
        if (!this.resident.has(imageTileKey(range.level, col, row)))
          return false;
    return true;
  }

  private demandReady(demand: DemandState) {
    if (!demand.plan) return false;
    const range = demand.plan.visibleTarget;
    if (demand.decode) return this.allResident(range);
    if (!range) return true;
    for (let row = range.row0; row < range.row1; row++)
      for (let col = range.col0; col < range.col1; col++)
        if (!this.source.hasBytes({ level: range.level, col, row }))
          return false;
    return true;
  }

  /** Retire the primary view without cancelling independent query consumers. */
  park() {
    if (this.disposed || !this.primaryActive) return;
    this.primaryActive = false;
    this.idleQueue = null;
    clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
    this.stopWhenUnused();
    this.replan(false);
    if (this.options.parkedBudgetBytes !== undefined)
      this.trimDecodedTo(this.options.parkedBudgetBytes, {
        protectDemand: false,
      });
  }

  private stopWhenUnused() {
    if (
      (this.primaryActive && this.view) ||
      [...this.demands].some((demand) => demand.view)
    )
      return;
    this.active = false;
    this.controller.abort();
    this.source.pause();
  }

  /** Pool shares its existing RAM allowance between image pixels and codec state. */
  configureDecoderWorkingBudget(maxBytes: number) {
    this.decoderBudgetBytes = Math.max(0, maxBytes);
    this.syncDecoderBudget();
  }

  private syncDecoderBudget(additionalPixels = 0) {
    const activeDetail =
      (this.work === IMAGE_STACK_WORK.Full ||
        this.work === IMAGE_STACK_WORK.Visible) &&
      ((this.primaryActive &&
        this.view &&
        this.planValue &&
        this.planValue.target !== this.planValue.floor) ||
        [...this.demands].some(
          (demand) =>
            demand.priority === "high" &&
            demand.decode &&
            !demand.coarseOnly &&
            demand.plan &&
            demand.plan.target !== demand.plan.floor
        ));
    const available = Number.isFinite(this.decoderBudgetBytes)
      ? this.decoderBudgetBytes
      : this.budgetBytes - this.decodedBytes;
    this.source.configureDecoderWorkingBudget?.(
      activeDetail ? Math.max(0, available - additionalPixels) : 0
    );
  }

  /** Trim decoded pixels only; compressed source/cache ownership stays intact. */
  trimDecodedTo(
    maxBytes: number,
    options: { includeFloor?: boolean; protectDemand?: boolean } = {}
  ): number {
    const before = this.decodedBytes;
    this.trim(
      maxBytes,
      options.protectDemand ?? true,
      options.includeFloor ?? false
    );
    const freed = before - this.decodedBytes;
    this.syncDecoderBudget();
    if (freed) this.emit();
    return freed;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.controller.abort();
    this.lifetime.abort();
    for (const demand of this.demands) demand.plan = null;
    this.demands.clear();
    this.wants = [];
    this.tileBudgets.clear();
    this.demandDecodedBytes = 0;
    for (const key of [...this.resident.keys()]) this.evict(key);
    clearTimeout(this.idleTimer);
    this.unsubscribePrefetchGate?.();
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

  private replan(rebuildPrimary = true) {
    const pyramid = this.pyramidValue;
    if (!pyramid || this.disposed) return;
    const previousLayers = this.plan?.layers.join(",");
    const makePlan = (
      view: ImageView,
      pixels: number,
      zoomIntent: "in" | "out" | null,
      decode = true,
      levels: readonly ImageLevel[] = pyramid.levels
    ) =>
      planImageLevels(levels, pyramid.native, view, {
        ...this.options,
        // Compressed prewarming may use tiny stored levels without changing
        // the decoded renderer's whole-tile floor.
        minLevelEdge: decode ? this.options.minLevelEdge : (0 as DevicePixels),
        decodedByteBudget: (this.options.decodedBudget ?? defaultBudget)(
          pixels
        ),
        zoomIntent,
      });
    if (this.view && (rebuildPrimary || !this.planValue))
      this.planValue = makePlan(
        this.view,
        this.viewportPixels,
        this.zoomIntent
      );
    for (const demand of this.demands) {
      if (!demand.view) continue;
      const levels =
        demand.level === undefined
          ? pyramid.levels
          : pyramid.levels.filter((level) => level.level === demand.level);
      if (!levels.length) {
        demand.plan = null;
        continue;
      }
      const plan = makePlan(
        demand.view,
        demand.viewportPixels,
        demand.zoomIntent,
        demand.decode,
        levels
      );
      if (!demand.coarseOnly) {
        demand.plan = plan;
      } else {
        const floor = pyramid.levels.find(
          (level) => level.level === plan.floor
        )!;
        const wants = plan.wants.filter((want) => want.level === plan.floor);
        demand.plan = {
          ...plan,
          target: plan.floor,
          underlay: null,
          finer: null,
          visibleTarget: {
            level: floor.level,
            col0: 0,
            col1: floor.cols,
            row0: 0,
            row1: floor.rows,
          },
          layers: [plan.floor],
          wants,
          decodedBytes: wants.reduce((sum, want) => sum + want.bytes, 0),
        };
      }
      if (!demand.decode) {
        demand.plan = {
          ...demand.plan,
          wants: demand.plan.wants.map((want) => ({ ...want, decode: false })),
          decodedBytes: 0,
        };
      }
    }
    const union = new Map<string, ImageTileWant>();
    this.tileBudgets.clear();
    this.highCriticalKeys.clear();
    this.criticalKeys.clear();
    this.highTargetKeys.clear();
    const append = (
      plan: ImageLevelPlan,
      priority: "high" | "low",
      decode = true,
      budget?: ImagePrefetchBudget
    ) => {
      const high = priority === "high";
      if (high && decode && plan.visibleTarget) {
        const range = plan.visibleTarget;
        for (let row = range.row0; row < range.row1; row++)
          for (let col = range.col0; col < range.col1; col++)
            this.highTargetKeys.add(imageTileKey(range.level, col, row));
      }
      for (const want of plan.wants) {
        // Any unlimited owner pays for the shared tile. Otherwise preserve one
        // budget object for dispatch; batching never merges different owners.
        if (!this.tileBudgets.has(want.key) || budget === undefined)
          this.tileBudgets.set(want.key, budget);
        if (criticalWant(want)) {
          this.criticalKeys.add(want.key);
          if (high) this.highCriticalKeys.add(want.key);
        }
        const next = high
          ? want
          : { ...want, priority: want.priority + 10 * CATEGORY };
        const previous = union.get(want.key);
        const preferred =
          !previous || next.priority < previous.priority ? next : previous;
        union.set(
          want.key,
          previous && (next.decode || previous.decode) !== preferred.decode
            ? { ...preferred, decode: next.decode || previous.decode }
            : preferred
        );
      }
    };
    if (this.primaryActive && this.planValue)
      append(this.planValue, "high", true, this.primaryPrefetchBudget);
    for (const demand of this.demands)
      if (demand.plan)
        append(
          demand.plan,
          demand.priority,
          demand.decode,
          demand.priority === "high" ? undefined : demand.prefetchBudget
        );
    this.wants = [...union.values()].sort((a, b) => a.priority - b.priority);
    this.demandDecodedBytes = [...this.demands].some((demand) => demand.view)
      ? this.wants.reduce(
          (sum, want) => sum + (want.decode ? want.bytes : 0),
          0
        )
      : 0;
    this.idleQueue = null;
    this.skipped.clear();
    this.trim(this.budgetBytes, true);
    this.syncDecoderBudget();
    if (previousLayers !== this.plan?.layers.join(","))
      for (const listener of this.contentListeners) listener({ reset: true });
    // Let the pool suspend background work before admitting this view's demand.
    this.emit();
    this.pump();
  }

  private rankByPlan() {
    const priorities = new Map(
      this.wants
        .filter((want) => want.decode)
        .map((want) => [want.key, want.priority])
    );
    return (key: string) => priorities.get(key) ?? Infinity;
  }

  /** Fine decoded levels go first; active high-priority target pixels stay pinned. */
  private trim(budget: number, outsidePlanOnly = false, includeFloor = false) {
    if (this.decodedBytes <= budget) return;
    const rank = this.rankByPlan();
    const floor = this.usedLevels().at(-1)?.level;
    const candidates = [...this.resident.entries()]
      .filter(
        ([key, entry]) =>
          !this.highTargetKeys.has(key) &&
          (includeFloor || entry.level !== floor) &&
          (!outsidePlanOnly || rank(key) === Infinity)
      )
      .sort(
        (a, b) =>
          a[1].level - b[1].level ||
          rank(b[0]) - rank(a[0]) ||
          a[1].used - b[1].used
      );
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
    for (const listener of this.contentListeners) listener({ reset: true });
  }

  private pump() {
    if (
      !this.wants.length ||
      !this.active ||
      this.disposed ||
      this.work === IMAGE_STACK_WORK.Paused
    )
      return;
    const warming = this.work === IMAGE_STACK_WORK.Prewarm;
    const maxDecodes = warming ? 1 : this.options.maxDecodes ?? 4;
    const maxFetches = warming ? 1 : this.options.maxFetches ?? 3;
    const foregroundPending = this.foregroundPending;
    const wants = this.wants.filter((want) => {
      if (foregroundPending) return this.highCriticalKeys.has(want.key);
      const budget = this.tileBudgets.get(want.key);
      if (
        budget &&
        this.exhaustedBudgets.has(budget) &&
        !this.source.hasBytes(want) &&
        !this.resident.has(want.key)
      )
        return false;
      return (
        this.work === IMAGE_STACK_WORK.Full || this.criticalKeys.has(want.key)
      );
    });
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
      const critical = this.highCriticalKeys.has(batch[0].key);
      if (!critical && this.foregroundFetches > 0) break;
      this.fetch(batch, warming || !critical ? "low" : "high");
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
          this.tileBudgets.get(want.key) === this.tileBudgets.get(first.key) &&
          this.highCriticalKeys.has(want.key) ===
            this.highCriticalKeys.has(first.key) &&
          Math.floor(want.priority / CATEGORY) === category &&
          this.needsBytes(want)
      )
      .slice(0, MAX_BATCH_TILES);
  }

  private fetch(
    batch: readonly ImageTileWant[],
    priority: "high" | "low",
    context: ImageTileFetchContext = {
      prefetchBudget: this.tileBudgets.get(batch[0].key),
    }
  ) {
    const signal = this.controller.signal;
    this.fetches++;
    if (priority === "high") this.foregroundFetches++;
    for (const want of batch) {
      this.fetching.add(want.key);
    }
    let acceptingProgress = true;
    this.source
      .fetch(
        batch,
        signal,
        priority,
        (tile) => {
          if (
            !acceptingProgress ||
            this.disposed ||
            signal.aborted ||
            signal !== this.controller.signal ||
            !this.source.hasBytes(tile) ||
            this.tileWakeQueued
          )
            return;
          // Keep every fetching key owned until the batch settles. A partial
          // arrival permits decoding, never another request for the same tile.
          this.tileWakeQueued = true;
          queueMicrotask(() => {
            this.tileWakeQueued = false;
            // A view may have changed meanwhile: pump only its current plan.
            if (!this.disposed) {
              this.pump();
              // Compressed-only demands become ready without a decode event.
              this.emit();
            }
          });
        },
        context
      )
      .catch((error) => {
        if (
          !signal.aborted &&
          error instanceof ImagePrefetchBudgetExceeded &&
          context.prefetchBudget
        )
          this.exhaustedBudgets.add(context.prefetchBudget);
        this.fail(error, signal);
      })
      .finally(() => {
        acceptingProgress = false;
        this.fetches--;
        if (priority === "high") this.foregroundFetches--;
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
    this.syncDecoderBudget();
    const level = this.pyramidValue?.levels.find(
      (item) => item.level === want.level
    );
    // A visible intermediate target is a likely zoom source even after its
    // current plan completes. The source's shared RAM allowance/LRU still
    // bounds these contexts; floor-only and thumbnail queries do not keep them.
    const retainForZoom =
      !!level &&
      this.active &&
      (this.work === IMAGE_STACK_WORK.Full ||
        this.work === IMAGE_STACK_WORK.Visible) &&
      this.highCriticalKeys.has(want.key) &&
      (want.role === "target" || want.role === "target-periphery") &&
      this.pyramidValue!.levels.some(
        (finer) => finer.width > level.width && finer.height > level.height
      );
    const retainProgressive =
      !!level &&
      (retainForZoom ||
        this.wants.some((next) => {
          if (
            !next.decode ||
            next.col !== want.col ||
            next.row !== want.row ||
            this.resident.has(next.key)
          )
            return false;
          const finer = this.pyramidValue?.levels.find(
            (item) => item.level === next.level
          );
          return (
            !!finer && finer.width > level.width && finer.height > level.height
          );
        }));
    this.source
      .decode(want, signal, { retainProgressive })
      .then((bitmap) => this.admit(want, bitmap, signal))
      .catch((error) => this.fail(error, signal))
      .finally(() => {
        this.decodes--;
        this.decoding.delete(want.key);
        this.syncDecoderBudget();
        this.emit();
        if (!this.disposed) this.pump();
      });
  }

  private admit(want: ImageTileWant, bitmap: ImageBitmap, signal: AbortSignal) {
    if (this.disposed || signal.aborted || this.resident.has(want.key)) {
      bitmap.close();
      return;
    }
    const bytes = bitmap.width * bitmap.height * 4;
    this.syncDecoderBudget(bytes);
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
    for (const listener of this.contentListeners)
      listener({ tile: { level: want.level, col: want.col, row: want.row } });
    this.emit();
  }

  private fail(error: unknown, signal: AbortSignal) {
    if (signal.aborted || this.disposed) return;
    if (error instanceof ImagePrefetchBudgetExceeded)
      this.prefetchExhausted = true;
    else this.error = error instanceof Error ? error.message : String(error);
  }

  /** Compressed prefetch while nothing planned is pending: next finer level, then the pyramid. */
  private idle() {
    const configured = this.options.idlePrefetch;
    const mode =
      (typeof configured === "function" ? configured() : configured) ??
      "pyramid";
    const plan = this.planValue,
      pyramid = this.pyramidValue;
    if (
      mode === "none" ||
      !this.primaryActive ||
      (this.primaryPrefetchBudget &&
        this.exhaustedBudgets.has(this.primaryPrefetchBudget)) ||
      !plan ||
      !pyramid ||
      (this.options.prefetchGate && !this.options.prefetchGate.isOpen())
    )
      return;
    const delay = this.options.idlePyramidDelayMs ?? 250;
    const remaining = delay - (performance.now() - this.lastViewAt);
    const wholePyramid = mode === "pyramid" && remaining <= 0;
    if (mode === "pyramid" && !wholePyramid && this.idleTimer === undefined) {
      this.idleTimer = setTimeout(() => {
        this.idleTimer = undefined;
        this.idleQueue = null;
        this.pump();
      }, Math.max(0, remaining));
    }
    if (!this.idleQueue) {
      const levels = this.usedLevels();
      const order: ImageLevel[] = [];
      const finer = levels.find((level) => level.level === plan.finer);
      if (finer) order.push(finer);
      if (wholePyramid)
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
    if (batch.length)
      this.fetch(batch, "low", { prefetchBudget: this.primaryPrefetchBudget });
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }
}
