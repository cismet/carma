import { AvifHttpError } from "./avif-source-errors";
import {
  getMissingImageSource,
  rememberMissingImageSource,
} from "./image-source-availability";
import { abortable } from "./avif-tile-source";
import type {
  ImagePrefetchBudget,
  ImagePyramid,
  ImageTileRef,
  ImageTileSource,
} from "./image-tile-source";

export type ImageTileSourceFactory = Readonly<{
  kind: ImageTileSource["kind"];
  url: string;
  create: () => ImageTileSource;
}>;

const sourceKey = (source: ImageTileSourceFactory) =>
  `${source.kind}:${source.url}`;

/** Select one encoded representation at open; never mix its tiles with another. */
export class FallbackImageTileSource implements ImageTileSource {
  private current: ImageTileSource | undefined;
  private pyramid: Promise<ImagePyramid> | undefined;
  private readonly controller = new AbortController();
  private currentPriority: "high" | "low" = "high";
  private currentBudget: ImagePrefetchBudget | undefined;
  private previousRequests = 0;
  private selected = false;

  constructor(
    private readonly primary: ImageTileSourceFactory,
    private readonly fallbacks: readonly ImageTileSourceFactory[],
    private readonly options: {
      /** Network/5xx failures can use a fallback, but are never cached as missing. */
      fallbackOnTransientError?: boolean;
    } = {}
  ) {}

  get kind() {
    return this.current?.kind ?? this.primary.kind;
  }
  get url() {
    return this.current?.url ?? this.primary.url;
  }
  get priority() {
    return this.currentPriority;
  }
  set priority(priority: "high" | "low") {
    this.currentPriority = priority;
    if (priority === "high") this.currentBudget = undefined;
    this.applyScheduling();
  }
  get prefetchBudget() {
    return this.currentPriority === "low" ? this.currentBudget : undefined;
  }
  set prefetchBudget(budget: ImagePrefetchBudget | undefined) {
    this.currentBudget = budget;
    this.applyScheduling();
  }
  private applyScheduling() {
    if (!this.current) return;
    // Remove a speculative cap before promoting metadata or opening a fallback.
    this.current.prefetchBudget = this.prefetchBudget;
    this.current.priority = this.currentPriority;
  }

  open(signal: AbortSignal): Promise<ImagePyramid> {
    if (signal.aborted) return Promise.reject(signal.reason);
    if (this.controller.signal.aborted)
      return Promise.reject(this.controller.signal.reason);
    this.pyramid ??= this.select().catch((error: unknown) => {
      this.pyramid = undefined;
      throw error;
    });
    return abortable(this.pyramid, signal);
  }

  private async select(): Promise<ImagePyramid> {
    const candidates = [this.primary, ...this.fallbacks];
    for (let index = 0; index < candidates.length; index++) {
      this.controller.signal.throwIfAborted();
      const candidate = candidates[index];
      const key = sourceKey(candidate);
      const cached = getMissingImageSource(key);
      if (cached) {
        if (index === candidates.length - 1) throw cached;
        continue;
      }
      this.current = candidate.create();
      this.applyScheduling();
      try {
        const pyramid = await this.current.open(this.controller.signal);
        this.controller.signal.throwIfAborted();
        this.selected = true;
        return pyramid;
      } catch (error) {
        this.controller.signal.throwIfAborted();
        this.previousRequests += this.current.requestCount;
        this.current.dispose();
        this.current = undefined;
        const missing =
          error instanceof AvifHttpError &&
          (error.status === 404 || error.status === 410);
        const transient =
          this.options.fallbackOnTransientError &&
          (error instanceof TypeError ||
            (error instanceof AvifHttpError &&
              error.status >= 500 &&
              error.status <= 599));
        if (missing) rememberMissingImageSource(key, error);
        if ((!missing && !transient) || index === candidates.length - 1)
          throw error;
      }
    }
    throw new Error("No image representation is available");
  }

  hasBytes(tile: ImageTileRef) {
    return this.selected && Boolean(this.current?.hasBytes(tile));
  }
  async fetch(
    tiles: readonly ImageTileRef[],
    signal: AbortSignal,
    priority?: "high" | "low",
    onTileReady?: (tile: ImageTileRef) => void
  ) {
    await this.open(signal);
    signal.throwIfAborted();
    return this.current!.fetch(
      tiles,
      signal,
      priority ?? this.currentPriority,
      onTileReady
    );
  }
  async decode(tile: ImageTileRef, signal: AbortSignal) {
    await this.open(signal);
    signal.throwIfAborted();
    return this.current!.decode(tile, signal);
  }
  get compressedBytes() {
    return this.current?.compressedBytes ?? 0;
  }
  get requestCount() {
    return this.previousRequests + (this.current?.requestCount ?? 0);
  }
  pause() {
    this.current?.pause();
  }
  dispose() {
    if (this.controller.signal.aborted) return;
    this.controller.abort();
    this.current?.dispose();
  }
}
