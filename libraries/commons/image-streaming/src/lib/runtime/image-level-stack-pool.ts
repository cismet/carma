import type { ImageSize } from "../core/image-level-plan";
import { AvifTileSource } from "./avif-tile-source";
import {
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
  images: readonly (ImageLevelStackMetrics & { id: string; active: boolean })[];
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

  constructor(
    private readonly options: {
      maxImages?: number;
      stackOptions?: ImageLevelStackOptions;
      createSource?: (source: ImageStreamSource) => ImageTileSource;
    } = {}
  ) {}

  acquire(source: ImageStreamSource): ImageLevelStackLease {
    if (this.disposed) throw new Error("Image level stack pool is disposed");
    const key = `${source.kind}:${source.url}`;
    let entry = this.entries.get(key);
    if (!entry) {
      const stack = new ImageLevelStack(
        (this.options.createSource ?? createImageTileSource)(source),
        {
          idlePrefetch: source.kind === "jpeg" ? "next-level" : "pyramid",
          ...this.options.stackOptions,
        }
      );
      entry = { source, stack, refs: 0, used: 0 };
      stack.subscribe(() => this.emit());
      this.entries.set(key, entry);
    }
    entry.refs++;
    entry.used = performance.now();
    const current = entry;
    let released = false;
    this.trim();
    this.emit();
    return {
      stack: current.stack,
      release: () => {
        if (released) return;
        released = true;
        current.refs--;
        current.used = performance.now();
        if (!current.refs) current.stack.park();
        this.trim();
        this.emit();
      },
    };
  }

  get metrics(): ImageLevelStackPoolMetrics {
    const images = [...this.entries.values()].map((entry) => ({
      id: entry.source.id,
      active: entry.refs > 0,
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
    for (const entry of this.entries.values()) entry.stack.dispose();
    this.entries.clear();
    this.listeners.clear();
  }

  private trim() {
    const parked = [...this.entries.entries()]
      .filter(([, entry]) => !entry.refs)
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
