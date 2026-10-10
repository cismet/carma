import type {
  ImageLevelPlan,
  ImageSize,
  ImageView,
} from "../core/image-level-plan";
import { AvifTileSource } from "./avif-tile-source";
import { FallbackImageTileSource } from "./fallback-image-tile-source";
import {
  IMAGE_STACK_WORK,
  ImageLevelStack,
  type ImageLevelStackOptions,
  type ImageLevelStackMetrics,
  type ImageLevelReadiness,
} from "./image-level-stack";
import type { ImagePrefetchBudget, ImageTileSource } from "./image-tile-source";
import { JpegTileSource } from "./jpeg-tile-source";

export type ImagePyramidSourceLocation = Readonly<{
  url: string;
  kind: "avif" | "jpeg";
  /** Known native AVIFs bootstrap directly instead of probing the legacy format. */
  format?: "native";
  /** Required for JPEG families; AVIF pyramids carry their own size. */
  nativeSize?: ImageSize;
  /** JPEG family levels present on the server, finest first. */
  jpegLevels?: readonly number[];
}>;
export type ImagePyramidSource = ImagePyramidSourceLocation &
  Readonly<{
    id: string;
    /** Ordered alternative representations, selected only if opening the preferred source fails. */
    fallbacks?: readonly ImagePyramidSourceLocation[];
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
export type ImageLevelStackPoolMetrics = Readonly<{
  images: readonly (ImageLevelStackMetrics & {
    id: string;
    active: boolean;
    prewarming: boolean;
  })[];
  decodedBytes: number;
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
  used: number;
};

const createSingleImageTileSource = (
  source: ImagePyramidSourceLocation
): ImageTileSource => {
  if (source.kind === "avif")
    return new AvifTileSource(source.url, { format: source.format });
  if (!source.nativeSize)
    throw new Error("JPEG families need the native image size");
  return new JpegTileSource(source.url, source.nativeSize, source.jpegLevels);
};

export const createImageTileSource = (
  source: ImagePyramidSource
): ImageTileSource => {
  if (!source.fallbacks?.length) return createSingleImageTileSource(source);
  const factory = (location: ImagePyramidSourceLocation) => ({
    kind: location.kind,
    url: location.url,
    create: () => createSingleImageTileSource(location),
  });
  return new FallbackImageTileSource(
    factory(source),
    source.fallbacks.map(factory)
  );
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
      /** One forecast image may retain this much decoded data until promotion. */
      prewarmBudgetBytes?: number;
      stackOptions?: ImageLevelStackOptions;
      createSource?: (source: ImagePyramidSource) => ImageTileSource;
    } = {}
  ) {}

  private key(source: ImagePyramidSource) {
    const primary = `${source.kind}:${source.url}${
      source.format ? `:${source.format}` : ""
    }`;
    return source.fallbacks?.length
      ? `${primary}:${JSON.stringify(source.fallbacks)}`
      : primary;
  }

  private entry(source: ImagePyramidSource, prewarming = false) {
    const key = this.key(source);
    let entry = this.entries.get(key);
    if (!entry) {
      const tileSource = (this.options.createSource ?? createImageTileSource)(
        source
      );
      tileSource.priority = prewarming ? "low" : "high";
      tileSource.prefetchBudget = prewarming ? this.budget(source) : undefined;
      const stack = new ImageLevelStack(tileSource, {
        idlePrefetch: () =>
          tileSource.kind === "jpeg" ? "next-level" : "pyramid",
        ...this.options.stackOptions,
        ...(prewarming
          ? {
              decodedBudget: () =>
                this.options.prewarmBudgetBytes ?? 96 * 1024 * 1024,
            }
          : {}),
      });
      if (prewarming) stack.setWork(IMAGE_STACK_WORK.Prewarm);
      entry = { source, stack, refs: 0, used: performance.now() };
      stack.subscribe(() => {
        this.reconcile();
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

  acquire(source: ImagePyramidSource): ImageLevelStackLease {
    if (this.disposed) throw new Error("Image level stack pool is disposed");
    // Stop speculative traffic before a new foreground source even opens.
    if (this.warming && this.key(this.warming.source) !== this.key(source))
      this.entries
        .get(this.key(this.warming.source))
        ?.stack.setWork(IMAGE_STACK_WORK.Paused);
    if (this.warming && this.key(this.warming.source) === this.key(source))
      this.warming = null;
    const cached = this.entries.get(this.key(source));
    if (
      cached &&
      !cached.stack.pyramid &&
      (cached.stack.prefetchExhausted || cached.stack.error) &&
      !cached.refs
    ) {
      this.entries.delete(this.key(source));
      cached.stack.dispose();
    }
    // A renewed demand retries failed tiles while retaining decoded pixels.
    // Existing owners keep their current diagnostics and scheduling unchanged.
    if (cached?.stack.pyramid && cached.stack.error && !cached.refs)
      cached.stack.error = null;
    const current = this.entry(source);
    current.stack.source.prefetchBudget = undefined;
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
      const foreground = [...this.entries.values()].filter(
        (entry) => entry.refs > 0
      );
      const blocked = foreground.some(
        (entry) => !entry.stack.metrics.visibleReady && !entry.stack.error
      );
      const request = this.warming;
      const key = request && this.key(request.source);
      let warm = key ? this.entries.get(key) : undefined;
      if (blocked && warm && !warm.refs) {
        if (!warm.stack.pyramid) {
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
              !warm?.refs &&
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
        if (!warm.refs) {
          if (request.applied !== warm) {
            warm.stack.setWork(IMAGE_STACK_WORK.Paused);
            warm.stack.source.prefetchBudget = this.budget(request.source);
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
    } finally {
      this.reconciling = false;
    }
  }

  get metrics(): ImageLevelStackPoolMetrics {
    const images = [...this.entries.values()].map((entry) => ({
      id: entry.source.id,
      active: entry.refs > 0,
      prewarming:
        !entry.refs &&
        !!this.warming &&
        this.key(entry.source) === this.key(this.warming.source),
      ...entry.stack.metrics,
    }));
    return {
      images,
      decodedBytes: images.reduce((sum, image) => sum + image.decodedBytes, 0),
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
          ...(source.jpegLevels ? { jpegLevels: [...source.jpegLevels] } : {}),
        },
        active: entry.refs > 0,
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
    for (const entry of this.entries.values()) entry.stack.dispose();
    this.entries.clear();
    this.workingSets.clear();
    this.listeners.clear();
  }

  private trim() {
    const parked = [...this.entries.entries()]
      .filter(
        ([, entry]) =>
          !entry.refs &&
          (!this.warming ||
            this.key(entry.source) !== this.key(this.warming.source))
      )
      .sort((a, b) => a[1].used - b[1].used);
    const entryBytes = (entry: Entry) =>
      entry.stack.metrics.decodedBytes + entry.stack.metrics.compressedBytes;
    let parkedBytes = parked.reduce(
      (sum, [, entry]) => sum + entryBytes(entry),
      0
    );
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
