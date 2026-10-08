import type { ImageSize, ImageView } from "../core/image-level-plan";
import { AvifTileSource } from "./avif-tile-source";
import {
  IMAGE_STACK_WORK,
  ImageLevelStack,
  type ImageLevelStackOptions,
  type ImageLevelStackMetrics,
} from "./image-level-stack";
import type { ImageTileSource } from "./image-tile-source";
import { JpegTileSource } from "./jpeg-tile-source";

export type ImageStreamSource = Readonly<{
  id: string;
  url: string;
  kind: "avif" | "jpeg";
  /** Required for JPEG families; AVIF pyramids carry their own size. */
  nativeSize?: ImageSize;
  /** JPEG family levels present on the server, finest first. */
  jpegLevels?: readonly number[];
}>;
export type ImageLevelStackLease = Readonly<{
  stack: ImageLevelStack;
  release: () => void;
}>;
export type ImageLevelStackPoolMetrics = Readonly<{
  images: readonly (ImageLevelStackMetrics & { id: string; active: boolean; prewarming: boolean })[];
  decodedBytes: number;
  maxImages: number;
}>;
type Entry = {
  source: ImageStreamSource;
  stack: ImageLevelStack;
  refs: number;
  used: number;
};

export const createImageTileSource = (
  source: ImageStreamSource
): ImageTileSource => {
  if (source.kind === "avif") return new AvifTileSource(source.url);
  if (!source.nativeSize)
    throw new Error("JPEG families need the native image size");
  return new JpegTileSource(source.url, source.nativeSize, source.jpegLevels);
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
  private reconciling = false;
  private warming: { source: ImageStreamSource; view: ImageView; pixels: number; applied?: Entry } | null = null;

  constructor(
    private readonly options: {
      maxImages?: number;
      /** One forecast image may retain this much decoded data until promotion. */
      prewarmBudgetBytes?: number;
      stackOptions?: ImageLevelStackOptions;
      createSource?: (source: ImageStreamSource) => ImageTileSource;
    } = {}
  ) {}

  private key(source: ImageStreamSource) {
    return `${source.kind}:${source.url}`;
  }

  private entry(source: ImageStreamSource, prewarming = false) {
    const key = this.key(source);
    let entry = this.entries.get(key);
    if (!entry) {
      const tileSource = (this.options.createSource ?? createImageTileSource)(source);
      tileSource.priority = prewarming ? "low" : "high";
      const stack = new ImageLevelStack(tileSource, {
        idlePrefetch: source.kind === "jpeg" ? "next-level" : "pyramid",
        ...this.options.stackOptions,
        ...(prewarming ? { decodedBudget: () => this.options.prewarmBudgetBytes ?? 96 * 1024 * 1024 } : {}),
      });
      if (prewarming) stack.setWork(IMAGE_STACK_WORK.Prewarm);
      entry = { source, stack, refs: 0, used: performance.now() };
      stack.subscribe(() => { this.reconcile(); this.emit(); });
      this.entries.set(key, entry);
    }
    return entry;
  }

  acquire(source: ImageStreamSource): ImageLevelStackLease {
    if (this.disposed) throw new Error("Image level stack pool is disposed");
    // Stop speculative traffic before a new foreground source even opens.
    if (this.warming && this.key(this.warming.source) !== this.key(source))
      this.entries.get(this.key(this.warming.source))?.stack.setWork(IMAGE_STACK_WORK.Paused);
    if (this.warming && this.key(this.warming.source) === this.key(source)) this.warming = null;
    const current = this.entry(source);
    current.refs++;
    current.used = performance.now();
    current.stack.configure({ decodedBudget: this.options.stackOptions?.decodedBudget });
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
        if (!current.refs && (!this.warming || this.key(this.warming.source) !== this.key(current.source))) current.stack.park();
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
  prewarm(source: ImageStreamSource, view: ImageView, viewportPixels: number): () => void {
    if (this.disposed) return () => undefined;
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

  private reconcile() {
    if (this.disposed || this.reconciling) return;
    this.reconciling = true;
    try {
      const foreground = [...this.entries.values()].filter((entry) => entry.refs > 0);
      const blocked = foreground.some((entry) => !entry.stack.metrics.visibleReady && !entry.stack.error);
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
        entry.stack.setWork(!blocked && request && !warm?.refs && !(request.applied === warm && warm?.stack.metrics.visibleReady)
          ? IMAGE_STACK_WORK.Visible : IMAGE_STACK_WORK.Full);
      if (request && !blocked) {
        warm ??= this.entry(request.source, true);
        if (!warm.refs) {
          if (request.applied !== warm) {
            warm.stack.setWork(IMAGE_STACK_WORK.Paused);
            warm.stack.configure({ decodedBudget: () => this.options.prewarmBudgetBytes ?? 96 * 1024 * 1024 });
            warm.stack.setView(request.view, request.pixels);
            request.applied = warm;
          }
          warm.stack.setWork(IMAGE_STACK_WORK.Prewarm);
        }
      }
    } finally { this.reconciling = false; }
  }

  get metrics(): ImageLevelStackPoolMetrics {
    const images = [...this.entries.values()].map((entry) => ({
      id: entry.source.id,
      active: entry.refs > 0,
      prewarming: !entry.refs && !!this.warming && this.key(entry.source) === this.key(this.warming.source),
      ...entry.stack.metrics,
    }));
    return {
      images,
      decodedBytes: images.reduce((sum, image) => sum + image.decodedBytes, 0),
      maxImages: this.options.maxImages ?? 8,
    };
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
    this.listeners.clear();
  }

  private trim() {
    const parked = [...this.entries.entries()]
      .filter(([, entry]) => !entry.refs && (!this.warming || this.key(entry.source) !== this.key(this.warming.source)))
      .sort((a, b) => a[1].used - b[1].used);
    while (this.entries.size > (this.options.maxImages ?? 8) && parked.length) {
      const [key, entry] = parked.shift()!;
      entry.stack.dispose();
      this.entries.delete(key);
    }
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }
}
