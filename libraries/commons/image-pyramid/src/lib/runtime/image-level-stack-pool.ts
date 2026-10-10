import type {
  ImageLevelPlan,
  ImageSize,
  ImageView,
} from "../core/image-level-plan";
import { AvifTileSource } from "./avif-tile-source";
import {
  IMAGE_STACK_WORK,
  ImageLevelStack,
  type ImageLevelStackOptions,
  type ImageLevelStackMetrics,
  type ImageLevelReadiness,
} from "./image-level-stack";
import type { ImagePrefetchBudget, ImageTileSource } from "./image-tile-source";

export type ImagePyramidSource = Readonly<{
  id: string;
  url: string;
  kind: "avif";
  nativeSize?: ImageSize;
}>;
export type ImagePrefetchConfig = Readonly<{
  /** Compressed request bytes, including metadata and merged range gaps. */
  imageBytes?: number;
  groupBytes?: number;
  maxImages?: number;
}>;
export type ImageLevelStackLease = Readonly<{
  stack: ImageLevelStack;
  release: () => void;
}>;
export type ImageLevelStackDemandOptions = Readonly<{
  priority?: "high" | "low";
  coarseOnly?: boolean;
  /** Restrict this demand to one stored pyramid level. */
  level?: number;
  /** Download compressed tiles without allocating decoded buffers. */
  decode?: boolean;
  /** Shared caller-owned allowance; applies only while every owner is speculative. */
  prefetchBudget?: ImagePrefetchBudget;
}>;
export type ImageLevelStackPoolDemand = Readonly<{
  /** Source metadata is ready; pixel readiness is reported separately. */
  ready: Promise<ImageLevelStack>;
  setView: (
    view: ImageView,
    viewportPixels: number,
    zoomIntent?: "in" | "out" | null
  ) => void;
  plan: ImageLevelPlan | null;
  visibleReady: boolean;
  prefetchExhausted: boolean;
  release: () => void;
}>;
export type ImageLevelStackPoolMetrics = Readonly<{
  images: readonly (ImageLevelStackMetrics & {
    id: string;
    active: boolean;
    prewarming: boolean;
  })[];
  decodedBytes: number;
  /** Estimated native decoder contexts, charged to maxDecodedBytes too. */
  decoderWorkingBytes?: number;
  compressedBytes: number;
  maxDecodedBytes?: number;
  maxCompressedBytes?: number;
  maxImages: number;
}>;
/** Detached diagnostics; reading this never acquires an image or schedules work. */
export type ImageLevelStackPoolDiagnostic = Readonly<{
  source: ImagePyramidSource;
  active: boolean;
  prewarming: boolean;
  metrics: ImageLevelStackMetrics;
  error: string | null;
  native: ImageSize | null;
  plan: Pick<
    ImageLevelPlan,
    "target" | "underlay" | "floor" | "finer" | "visibleTarget" | "layers"
  > | null;
  levels: readonly ImageLevelReadiness[];
}>;

type Entry = {
  source: ImagePyramidSource;
  stack: ImageLevelStack;
  refs: number;
  demands: Set<PoolDemand>;
  used: number;
};
type PoolDemand = {
  source: ImagePyramidSource;
  options: ImageLevelStackDemandOptions;
  entry?: Entry;
  lease?: ReturnType<ImageLevelStack["acquireDemand"]>;
  view?: readonly [ImageView, number, "in" | "out" | null];
  resolve: (stack: ImageLevelStack) => void;
  reject: (error: unknown) => void;
  released: boolean;
};

/** Stable identity of a native AVIF, independent of its consumer. */
export const imagePyramidSourceKey = (source: ImagePyramidSource) => {
  let url = source.url;
  try {
    const parsed = new URL(url, globalThis.location?.href);
    parsed.hash = "";
    parsed.searchParams.delete("pyramid");
    url = parsed.href;
  } catch {
    // Non-browser callers may use relative fixture URLs.
  }
  return JSON.stringify(["avif", url]);
};

export const createImageTileSource = (
  source: ImagePyramidSource
): ImageTileSource => {
  if (source.kind !== "avif")
    throw new Error("Only native AVIF image sources are supported");
  return new AvifTileSource(source.url);
};

/**
 * Keeps up to `maxImages` image stacks so flipping between images reuses their
 * decoded tiles. Released stacks are parked to a small budget, never dropped
 * while held.
 */
export class ImageLevelStackPool {
  private readonly entries = new Map<string, Entry>();
  private readonly listeners = new Set<() => void>();
  private disposed = false;
  private trimming = false;
  private readonly demands = new Set<PoolDemand>();
  private readonly workingSets = new Map<
    object,
    { maxImages: number; maxParkedBytes: number }
  >();

  /** Temporarily retain a viewport's contributing sources. Active leases are
   * never evicted; only parked decoded/compressed payloads count toward bytes. */
  retainWorkingSet(initial: { maxImages: number; maxParkedBytes: number }) {
    const key = {};
    let released = false;
    const update = (options: { maxImages: number; maxParkedBytes: number }) => {
      if (released || this.disposed) return;
      if (
        !Number.isFinite(options.maxImages) ||
        !Number.isFinite(options.maxParkedBytes) ||
        options.maxImages < 0 ||
        options.maxParkedBytes < 0
      )
        throw new RangeError("Invalid image working-set retention");
      const value = {
        maxImages: Math.floor(options.maxImages),
        maxParkedBytes: Math.floor(options.maxParkedBytes),
      };
      const previous = this.workingSets.get(key);
      if (
        previous?.maxImages === value.maxImages &&
        previous.maxParkedBytes === value.maxParkedBytes
      )
        return;
      this.workingSets.set(key, value);
      this.trim();
      this.emit();
    };
    update(initial);
    return {
      update,
      release: () => {
        if (released) return;
        released = true;
        if (this.workingSets.delete(key)) {
          this.trim();
          this.emit();
        }
      },
    };
  }

  private get retainedImageLimit() {
    return Math.max(
      this.options.maxImages ?? 8,
      [...this.workingSets.values()].reduce(
        (sum, item) => sum + item.maxImages,
        0
      )
    );
  }

  private get retainedByteLimit() {
    return this.workingSets.size
      ? [...this.workingSets.values()].reduce(
          (sum, item) => sum + item.maxParkedBytes,
          0
        )
      : Infinity;
  }

  private prefetchGroup: string | null = null;
  private prefetchConfig: ImagePrefetchConfig = {};
  private groupBudget: ImagePrefetchBudget = {
    remainingBytes: 5 * 1024 * 1024,
  };
  private readonly imageBudgets = new Map<string, ImagePrefetchBudget>();

  /** Retain the group's allowance across hovers; only a new navigation origin resets it. */
  setPrefetchGroup(key: string, config: ImagePrefetchConfig = {}) {
    if (
      this.prefetchGroup === key &&
      JSON.stringify(config) === JSON.stringify(this.prefetchConfig)
    )
      return;
    this.prefetchGroup = key;
    this.prefetchConfig = { ...config };
    this.groupBudget = {
      remainingBytes: Math.max(
        0,
        Math.floor(config.groupBytes ?? 5 * 1024 * 1024)
      ),
    };
    this.imageBudgets.clear();
    this.warming = null;
    for (const entry of this.entries.values())
      if (!entry.refs) entry.stack.park();
    this.reconcile();
  }

  private budget(source: ImagePyramidSource) {
    const key = this.key(source);
    let budget = this.imageBudgets.get(key);
    if (
      !budget &&
      this.imageBudgets.size < (this.prefetchConfig.maxImages ?? 5)
    ) {
      budget = {
        remainingBytes: Math.max(
          0,
          Math.floor(this.prefetchConfig.imageBytes ?? 1024 * 1024)
        ),
        group: this.groupBudget,
      };
      this.imageBudgets.set(key, budget);
    }
    return budget;
  }
  private reconciling = false;
  private warming: {
    source: ImagePyramidSource;
    view: ImageView;
    pixels: number;
    applied?: Entry;
  } | null = null;

  constructor(
    private readonly options: {
      maxImages?: number;
      /** Global decoded retention; live foreground target pixels remain protected. */
      maxDecodedBytes?: number;
      /** Compressed RAM retention, separate from persistent browser range storage. */
      maxCompressedBytes?: number;
      /** One forecast image may retain this much decoded data until promotion. */
      prewarmBudgetBytes?: number;
      stackOptions?: ImageLevelStackOptions;
      createSource?: (source: ImagePyramidSource) => ImageTileSource;
    } = {}
  ) {}

  key(source: ImagePyramidSource) {
    return imagePyramidSourceKey(source);
  }

  private get memoryManaged() {
    return (
      this.options.maxDecodedBytes !== undefined ||
      this.options.maxCompressedBytes !== undefined
    );
  }

  private held(entry: Entry) {
    return entry.refs > 0 || entry.demands.size > 0;
  }

  private foreground(entry: Entry) {
    return (
      entry.refs > 0 ||
      [...entry.demands].some((request) => request.options.priority !== "low")
    );
  }

  private foregroundBlocked() {
    return (
      [...this.entries.values()].some(
        (entry) =>
          entry.refs > 0 && !entry.stack.visibleReady && !entry.stack.error
      ) ||
      [...this.demands].some(
        (request) =>
          request.options.priority !== "low" &&
          !request.entry?.stack.error &&
          !request.lease?.visibleReady
      )
    );
  }

  private entry(
    source: ImagePyramidSource,
    prewarming = false,
    lowPriority = false,
    demandBudget?: ImagePrefetchBudget
  ) {
    const key = this.key(source);
    let entry = this.entries.get(key);
    if (!entry) {
      const tileSource = (this.options.createSource ?? createImageTileSource)(
        source
      );
      tileSource.priority = prewarming || lowPriority ? "low" : "high";
      tileSource.prefetchBudget = prewarming
        ? this.budget(source)
        : lowPriority
        ? demandBudget
        : undefined;
      const stack = new ImageLevelStack(tileSource, {
        idlePrefetch: "none",
        ...this.options.stackOptions,
        ...(prewarming
          ? {
              decodedBudget: () =>
                this.options.prewarmBudgetBytes ?? 96 * 1024 * 1024,
            }
          : {}),
      });
      if (prewarming) stack.setWork(IMAGE_STACK_WORK.Prewarm);
      if (this.memoryManaged) stack.configureParkedBudget(undefined);
      entry = {
        source,
        stack,
        refs: 0,
        demands: new Set(),
        used: performance.now(),
      };
      stack.subscribe(() => {
        this.reconcile();
        this.trim();
        this.emit();
      });
      this.entries.set(key, entry);
    }
    return entry;
  }

  /** Inspect cached pixels synchronously without opening, promoting or warming a source.
   * The stack may be evicted after the caller returns; do not retain it asynchronously. */
  peek(source: ImagePyramidSource): ImageLevelStack | undefined {
    return this.disposed
      ? undefined
      : this.entries.get(this.key(source))?.stack;
  }

  /** Read-only ownership check; does not create, promote or schedule a source. */
  hasForeground(source: ImagePyramidSource): boolean {
    const entry = !this.disposed && this.entries.get(this.key(source));
    return !!entry && this.foreground(entry);
  }

  acquire(source: ImagePyramidSource): ImageLevelStackLease {
    if (this.disposed) throw new Error("Image level stack pool is disposed");
    // Stop speculative traffic before a new foreground source even opens.
    if (this.warming && this.key(this.warming.source) !== this.key(source)) {
      const warm = this.entries.get(this.key(this.warming.source));
      if (warm && !this.foreground(warm))
        warm.stack.setWork(IMAGE_STACK_WORK.Paused);
    }
    if (this.warming && this.key(this.warming.source) === this.key(source))
      this.warming = null;
    const cached = this.entries.get(this.key(source));
    if (cached) this.retireFailedSpeculation(cached);
    // A renewed demand retries failed tiles while retaining decoded pixels.
    // Existing owners keep their current diagnostics and scheduling unchanged.
    if (cached?.stack.pyramid && cached.stack.error && !this.held(cached))
      cached.stack.error = null;
    const current = this.entry(source);
    current.stack.source.prefetchBudget = undefined;
    current.stack.prefetchExhausted = false;
    current.refs++;
    current.used = performance.now();
    current.stack.configure({
      decodedBudget: this.options.stackOptions?.decodedBudget,
    });
    current.stack.source.priority = "high";
    current.stack.setWork(IMAGE_STACK_WORK.Full);
    let released = false;
    this.reconcile();
    this.trim();
    this.emit();
    return {
      stack: current.stack,
      release: () => {
        if (released) return;
        released = true;
        current.refs--;
        current.used = performance.now();
        if (
          !current.refs &&
          (!this.warming ||
            this.key(this.warming.source) !== this.key(current.source))
        )
          current.stack.park();
        this.reconcile();
        this.trim();
        this.emit();
      },
    };
  }

  /** Add an independent viewport or coarse query without replacing the primary view. */
  acquireDemand(
    source: ImagePyramidSource,
    options: ImageLevelStackDemandOptions = {}
  ): ImageLevelStackPoolDemand {
    if (this.disposed) throw new Error("Image level stack pool is disposed");
    let resolve!: (stack: ImageLevelStack) => void;
    let reject!: (error: unknown) => void;
    const ready = new Promise<ImageLevelStack>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    // Cancellation may precede a consumer awaiting this deferred admission.
    void ready.catch(() => undefined);
    const request: PoolDemand = {
      source,
      options: { ...options },
      resolve,
      reject,
      released: false,
    };
    this.demands.add(request);
    this.reconcile();
    this.trim();
    this.emit();
    return {
      ready,
      setView: (view, pixels, zoomIntent = null) => {
        if (request.released) return;
        request.view = [view, pixels, zoomIntent];
        request.lease?.setView(view, pixels, zoomIntent);
        this.reconcile();
      },
      get plan() {
        return request.lease?.plan ?? null;
      },
      get visibleReady() {
        return request.lease?.visibleReady ?? false;
      },
      get prefetchExhausted() {
        return request.lease?.prefetchExhausted ?? false;
      },
      release: () => this.releaseDemand(request),
    };
  }

  private releaseDemand(request: PoolDemand) {
    if (request.released) return;
    request.released = true;
    this.demands.delete(request);
    const entry = request.entry;
    entry?.demands.delete(request);
    request.lease?.release();
    request.reject(new DOMException("Image query released", "AbortError"));
    if (entry) {
      entry.used = performance.now();
      if (
        !entry.refs &&
        !entry.demands.size &&
        (!this.warming ||
          this.key(this.warming.source) !== this.key(entry.source))
      )
        entry.stack.park();
    }
    this.reconcile();
    this.trim();
    this.emit();
  }

  /** A failed speculative open cannot poison a later unlimited foreground lease. */
  private retireFailedSpeculation(entry: Entry) {
    if (
      entry.stack.pyramid ||
      (!entry.stack.error && !entry.stack.prefetchExhausted) ||
      this.foreground(entry) ||
      (this.held(entry) && !entry.stack.prefetchExhausted)
    )
      return false;
    this.entries.delete(this.key(entry.source));
    for (const request of entry.demands) {
      request.entry = undefined;
      request.lease = undefined;
    }
    entry.demands.clear();
    entry.stack.dispose();
    return true;
  }

  private applyDemandAllowance(entry: Entry) {
    const demands = [...entry.demands];
    const budget =
      !this.foreground(entry) &&
      demands.length &&
      demands.every(({ options }) => options.prefetchBudget)
        ? demands.reduce<ImagePrefetchBudget | undefined>(
            (selected, request) => {
              const candidate = request.options.prefetchBudget!;
              return !selected ||
                candidate.remainingBytes < selected.remainingBytes
                ? candidate
                : selected;
            },
            undefined
          )
        : undefined;
    if (entry.stack.source.prefetchBudget !== budget) {
      entry.stack.source.prefetchBudget = budget;
      entry.stack.prefetchExhausted = false;
    }
  }

  private admitDemand(request: PoolDemand) {
    if (request.entry || request.released) return;
    const low = request.options.priority === "low";
    let existing = this.entries.get(this.key(request.source));
    if (
      existing &&
      (!low || !request.options.prefetchBudget || !this.held(existing))
    ) {
      if (this.retireFailedSpeculation(existing)) existing = undefined;
      else if (existing.stack.pyramid && !this.held(existing))
        existing.stack.error = null;
    }
    const entry =
      existing ??
      this.entry(request.source, false, low, request.options.prefetchBudget);
    const wasForeground = this.foreground(entry);
    entry.stack.prefetchExhausted = false;
    request.entry = entry;
    entry.demands.add(request);
    entry.used = performance.now();
    // A low-priority query owns a shared source, never the primary viewport plan.
    this.applyDemandAllowance(entry);
    entry.stack.source.priority = this.foreground(entry) ? "high" : "low";
    if (!low && !wasForeground)
      entry.stack.configure({
        decodedBudget: this.options.stackOptions?.decodedBudget,
      });
    else if (low && !wasForeground)
      entry.stack.setWork(IMAGE_STACK_WORK.Prewarm);
    request.lease = entry.stack.acquireDemand(request.options);
    if (request.view) request.lease.setView(...request.view);
    entry.stack.ready.then(
      () => {
        if (!request.released) request.resolve(entry.stack);
      },
      (error) => {
        if (!request.released) request.reject(error);
      }
    );
  }

  /**
   * Prepare exactly one predicted view in the same pool used for display.
   * Opening is deferred until foreground target pixels are resident. The
   * cancellation lease is generation-safe, so old hover cleanup cannot cancel
   * a newer prediction or an image already promoted with acquire().
   */
  prewarm(
    source: ImagePyramidSource,
    view: ImageView,
    viewportPixels: number
  ): () => void {
    if (this.disposed) return () => undefined;
    const budget = this.budget(source);
    if (
      !budget ||
      budget.remainingBytes <= 0 ||
      this.groupBudget.remainingBytes <= 0
    ) {
      const previous = this.warming;
      this.warming = null;
      const parked = previous && this.entries.get(this.key(previous.source));
      if (parked && !parked.refs) parked.stack.park();
      this.reconcile();
      return () => undefined;
    }
    const previous = this.warming;
    const request = { source, view, pixels: viewportPixels };
    this.warming = request;
    if (previous && this.key(previous.source) !== this.key(source)) {
      const old = this.entries.get(this.key(previous.source));
      if (old && !old.refs) old.stack.park();
    }
    this.reconcile();
    this.trim();
    this.emit();
    return () => {
      if (this.warming !== request) return;
      this.warming = null;
      const entry = this.entries.get(this.key(source));
      if (entry && !entry.refs) entry.stack.park();
      this.reconcile();
      this.emit();
    };
  }

  /** Serial forecasts share the current group's byte allowance; current pixels always win. */
  prewarmGroup(
    requests: readonly {
      source: ImagePyramidSource;
      view: ImageView;
      viewportPixels: number;
    }[]
  ): () => void {
    const seen = new Set<string>();
    const queue = requests
      .filter(({ source }) => {
        const key = this.key(source);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, this.prefetchConfig.maxImages ?? 5);
    let index = 0;
    let current: (typeof queue)[number] | undefined;
    let release: (() => void) | undefined;
    let cancelled = false;
    let advancing = false;
    const advance = () => {
      if (cancelled || advancing || this.disposed) return;
      advancing = true;
      try {
        while (true) {
          const entry = current && this.entries.get(this.key(current.source));
          if (current && !entry) {
            // Opening waits for foreground coverage; the pool will notify us.
            if (this.warming?.source === current.source) return;
          }
          if (
            entry &&
            !entry.refs &&
            !entry.stack.metrics.visibleReady &&
            !entry.stack.prefetchExhausted &&
            !entry.stack.error
          )
            return;
          release?.();
          release = undefined;
          current = queue[index++];
          if (!current) return;
          const resident = this.entries.get(this.key(current.source));
          if (resident?.refs) {
            current = undefined;
            continue;
          }
          release = this.prewarm(
            current.source,
            current.view,
            current.viewportPixels
          );
        }
      } finally {
        advancing = false;
      }
    };
    const unsubscribe = this.subscribe(advance);
    advance();
    return () => {
      if (cancelled) return;
      cancelled = true;
      unsubscribe();
      release?.();
    };
  }

  private reconcile() {
    if (this.disposed || this.reconciling) return;
    this.reconciling = true;
    try {
      for (const request of this.demands)
        if (request.options.priority !== "low") this.admitDemand(request);
      const blocked = this.foregroundBlocked();
      for (const request of this.demands) {
        if (request.options.priority !== "low" || request.entry) continue;
        const existing = this.entries.get(this.key(request.source));
        if (!blocked || (existing && this.foreground(existing)))
          this.admitDemand(request);
      }
      const foreground = [...this.entries.values()].filter((entry) =>
        this.foreground(entry)
      );
      const request = this.warming;
      const key = request && this.key(request.source);
      let warm = key ? this.entries.get(key) : undefined;
      if (blocked && warm && !this.foreground(warm)) {
        if (!warm.stack.pyramid && !warm.demands.size) {
          // Metadata work has its own lifetime: dispose an unopened forecast
          // to abort it as well; retain the intent for a later retry.
          this.entries.delete(key!);
          warm.stack.dispose();
          warm = undefined;
        } else warm.stack.setWork(IMAGE_STACK_WORK.Paused);
      }
      // A forecast takes precedence over an active image's speculative rings
      // and full-pyramid downloads, never over its visible target pixels.
      for (const entry of foreground)
        entry.stack.setWork(
          blocked ||
            (request &&
              !(warm && this.foreground(warm)) &&
              !(
                request.applied === warm &&
                (warm?.stack.metrics.visibleReady ||
                  warm?.stack.prefetchExhausted)
              ))
            ? IMAGE_STACK_WORK.Visible
            : IMAGE_STACK_WORK.Full
        );
      if (request && !blocked) {
        warm ??= this.entry(request.source, true);
        if (!this.foreground(warm)) {
          if (request.applied !== warm) {
            warm.stack.setWork(IMAGE_STACK_WORK.Paused);
            if (warm.demands.size) this.applyDemandAllowance(warm);
            else warm.stack.source.prefetchBudget = this.budget(request.source);
            warm.stack.prefetchExhausted = false;
            warm.stack.configure({
              decodedBudget: () =>
                this.options.prewarmBudgetBytes ?? 96 * 1024 * 1024,
            });
            warm.stack.setView(request.view, request.pixels);
            request.applied = warm;
          }
          warm.stack.setWork(IMAGE_STACK_WORK.Prewarm);
        }
      }
      for (const entry of this.entries.values()) {
        if (!entry.demands.size || this.foreground(entry)) continue;
        // Queries can resume without changing their view or reopening metadata.
        this.applyDemandAllowance(entry);
        entry.stack.source.priority = "low";
        entry.stack.setWork(
          blocked ? IMAGE_STACK_WORK.Paused : IMAGE_STACK_WORK.Prewarm
        );
      }
    } finally {
      this.reconciling = false;
    }
  }

  get metrics(): ImageLevelStackPoolMetrics {
    const images = [...this.entries.values()].map((entry) => ({
      id: entry.source.id,
      active: this.foreground(entry),
      prewarming:
        !entry.refs &&
        !!this.warming &&
        this.key(entry.source) === this.key(this.warming.source),
      ...entry.stack.metrics,
    }));
    return {
      images,
      decodedBytes: images.reduce((sum, image) => sum + image.decodedBytes, 0),
      decoderWorkingBytes: images.reduce(
        (sum, image) => sum + (image.decoderWorkingBytes ?? 0),
        0
      ),
      compressedBytes: images.reduce(
        (sum, image) => sum + image.compressedBytes,
        0
      ),
      maxDecodedBytes: this.options.maxDecodedBytes,
      maxCompressedBytes: this.options.maxCompressedBytes,
      maxImages: this.retainedImageLimit,
    };
  }

  diagnostics(): readonly ImageLevelStackPoolDiagnostic[] {
    return [...this.entries.values()].map((entry) => {
      const { stack, source } = entry;
      const plan = stack.plan;
      const native = stack.pyramid?.native ?? source.nativeSize;
      return {
        source: {
          ...source,
          ...(source.nativeSize
            ? { nativeSize: { ...source.nativeSize } }
            : {}),
        },
        active: this.foreground(entry),
        prewarming:
          !entry.refs &&
          !!this.warming &&
          this.key(source) === this.key(this.warming.source),
        metrics: stack.metrics,
        error: stack.error,
        native: native ? { ...native } : null,
        plan: plan
          ? {
              target: plan.target,
              underlay: plan.underlay,
              floor: plan.floor,
              finer: plan.finer,
              visibleTarget: plan.visibleTarget
                ? { ...plan.visibleTarget }
                : null,
              layers: [...plan.layers],
            }
          : null,
        levels: stack.readiness(),
      };
    });
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose() {
    this.disposed = true;
    this.warming = null;
    for (const request of this.demands) {
      request.released = true;
      request.reject(new DOMException("Image pool disposed", "AbortError"));
    }
    this.demands.clear();
    for (const entry of this.entries.values()) entry.stack.dispose();
    this.entries.clear();
    this.workingSets.clear();
    this.listeners.clear();
  }

  private trim() {
    if (this.trimming || this.disposed) return;
    this.trimming = true;
    try {
      this.trimRetained();
    } finally {
      this.trimming = false;
    }
  }

  private trimRetained() {
    const parked = [...this.entries.entries()]
      .filter(
        ([, entry]) =>
          !this.held(entry) &&
          (!this.warming ||
            this.key(entry.source) !== this.key(this.warming.source))
      )
      .sort((a, b) => a[1].used - b[1].used);
    const entryBytes = (entry: Entry) =>
      entry.stack.metrics.decodedBytes +
      entry.stack.metrics.compressedBytes +
      (entry.stack.metrics.decoderWorkingBytes ?? 0);
    let parkedBytes = parked.reduce(
      (sum, [, entry]) => sum + entryBytes(entry),
      0
    );
    if (this.memoryManaged) {
      const total = (kind: "decodedBytes" | "compressedBytes") =>
        [...this.entries.values()].reduce(
          (sum, entry) => sum + entry.stack.metrics[kind],
          0
        );
      let decoded = total("decodedBytes");
      const memoryLimit = Math.max(0, this.options.maxDecodedBytes ?? Infinity);
      const workingBytes = () =>
        [...this.entries.values()].reduce(
          (sum, entry) => sum + (entry.stack.source.decoderWorkingBytes ?? 0),
          0
        );
      // Reusable idle decoder state yields before any useful parked pixels.
      for (const [, entry] of parked) {
        const excess = decoded + workingBytes() - memoryLimit;
        if (excess <= 0) break;
        entry.stack.source.trimDecoderWorkingTo?.(
          Math.max(0, (entry.stack.source.decoderWorkingBytes ?? 0) - excess)
        );
      }
      const decodedLimit = Math.max(0, memoryLimit - workingBytes());
      // Fine parked levels go first; only a second pass can release their floor.
      for (const includeFloor of [false, true])
        for (const [, entry] of parked) {
          if (decoded <= decodedLimit) break;
          decoded -= entry.stack.trimDecodedTo(
            Math.max(
              0,
              entry.stack.metrics.decodedBytes - (decoded - decodedLimit)
            ),
            { includeFloor, protectDemand: false }
          );
        }
      parkedBytes = parked.reduce(
        (sum, [, entry]) => sum + entryBytes(entry),
        0
      );
      // A working-set release may tighten parked bytes independently of global RAM.
      for (const [, entry] of parked) {
        if (parkedBytes <= this.retainedByteLimit) break;
        const beforeWorking = entry.stack.source.decoderWorkingBytes ?? 0;
        entry.stack.source.trimDecoderWorkingTo?.(
          Math.max(0, beforeWorking - (parkedBytes - this.retainedByteLimit))
        );
        parkedBytes -=
          beforeWorking - (entry.stack.source.decoderWorkingBytes ?? 0);
        const released = entry.stack.trimDecodedTo(
          Math.max(
            0,
            entry.stack.metrics.decodedBytes -
              (parkedBytes - this.retainedByteLimit)
          ),
          { includeFloor: true, protectDemand: false }
        );
        parkedBytes -= released;
      }
      let compressed = total("compressedBytes");
      const compressedLimit = Math.max(
        0,
        this.options.maxCompressedBytes ?? Infinity
      );
      for (const [, entry] of parked) {
        if (compressed <= compressedLimit) break;
        const before = entry.stack.source.compressedBytes;
        entry.stack.source.trimCompressedTo?.(
          Math.max(0, before - (compressed - compressedLimit))
        );
        compressed -= before - entry.stack.source.compressedBytes;
      }
      // Bootstrap/index bytes remain useful after pixel eviction. If their sum
      // still exceeds RAM retention, release only unused source instances last.
      // dispose clears RAM; persistent range storage has its own quota policy.
      for (const [key, entry] of parked) {
        if (compressed <= compressedLimit) break;
        if (this.held(entry)) continue;
        const bytes = entry.stack.source.compressedBytes;
        entry.stack.trimDecodedTo(0, {
          includeFloor: true,
          protectDemand: false,
        });
        // Eviction listeners can synchronously acquire a newly needed image.
        if (this.held(entry)) continue;
        this.entries.delete(key);
        entry.stack.dispose();
        compressed -= bytes;
      }
      const active = [...this.entries.values()].filter(
        (entry) =>
          this.held(entry) ||
          (this.warming?.source &&
            this.key(entry.source) === this.key(this.warming.source))
      );
      const activeSet = new Set(active);
      const parkedWorking = [...this.entries.values()].reduce(
        (sum, entry) =>
          sum +
          (activeSet.has(entry)
            ? 0
            : entry.stack.source.decoderWorkingBytes ?? 0),
        0
      );
      const workingShare =
        Math.max(0, memoryLimit - total("decodedBytes") - parkedWorking) /
        Math.max(1, active.length);
      for (const entry of active)
        entry.stack.configureDecoderWorkingBudget(workingShare);
      // A running decode is protected until completion; that short-lived working
      // set may exceed retention, but idle contexts are bounded by the next pass.
      return;
    }
    while (
      (this.entries.size > this.retainedImageLimit ||
        parkedBytes > this.retainedByteLimit) &&
      parked.length
    ) {
      const [key, entry] = parked.shift()!;
      parkedBytes -= entryBytes(entry);
      entry.stack.dispose();
      this.entries.delete(key);
    }
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }
}
