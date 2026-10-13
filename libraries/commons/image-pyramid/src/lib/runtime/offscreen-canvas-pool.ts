import type { DevicePixels } from "@carma-units";

type CanvasSize = Readonly<{ width: DevicePixels; height: DevicePixels }>;
type Entry = {
  canvas: OffscreenCanvas;
  context: OffscreenCanvasRenderingContext2D;
};
export type OffscreenCanvasLease = Readonly<{
  canvas: OffscreenCanvas;
  context: OffscreenCanvasRenderingContext2D;
  release: () => void;
}>;

/** Pool exact crop surfaces; active leases cannot be resized or evicted by another job. */
export class OffscreenCanvasPool {
  private readonly idle: Entry[] = [];
  private readonly active = new Set<Entry>();
  private retainedBytes = 0;

  constructor(
    private readonly options: {
      maxRetainedBytes: number;
      maxRetainedCanvases: number;
      contextOptions?: CanvasRenderingContext2DSettings;
    }
  ) {
    if (
      !Number.isFinite(options.maxRetainedBytes) ||
      options.maxRetainedBytes < 0 ||
      !Number.isInteger(options.maxRetainedCanvases) ||
      options.maxRetainedCanvases < 0
    )
      throw new RangeError("Invalid canvas retention budget");
  }

  acquire({ width, height }: CanvasSize): OffscreenCanvasLease {
    if (
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      width < 1 ||
      height < 1
    )
      throw new RangeError("Canvas requires positive integer device pixels");
    const exact = this.idle.findIndex(
      ({ canvas }) => canvas.width === width && canvas.height === height
    );
    const entry = this.idle.splice(
      exact < 0 ? this.idle.length - 1 : exact,
      1
    )[0];
    let current: Entry;
    if (entry) {
      this.retainedBytes -= this.bytes(entry);
      if (entry.canvas.width !== width || entry.canvas.height !== height) {
        entry.canvas.width = width;
        entry.canvas.height = height;
      } else {
        // Reuse the backing store while clearing pixels and state from the previous crop.
        if (typeof entry.context.reset === "function") entry.context.reset();
        else entry.canvas.width = width;
      }
      current = entry;
    } else {
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext("2d", this.options.contextOptions);
      if (!context) {
        canvas.width = canvas.height = 1;
        throw new Error("No pooled 2D canvas context");
      }
      current = { canvas, context };
    }
    this.active.add(current);
    let released = false;
    return {
      ...current,
      release: () => {
        if (released) return;
        released = true;
        this.active.delete(current);
        if (
          this.bytes(current) > this.options.maxRetainedBytes ||
          this.options.maxRetainedCanvases === 0
        ) {
          this.retire(current);
          return;
        }
        this.idle.push(current);
        this.retainedBytes += this.bytes(current);
        while (
          this.retainedBytes > this.options.maxRetainedBytes ||
          this.idle.length > this.options.maxRetainedCanvases
        ) {
          const oldest = this.idle.shift()!;
          this.retainedBytes -= this.bytes(oldest);
          this.retire(oldest);
        }
      },
    };
  }

  /** Drop unused backing stores without invalidating a visible or composing crop. */
  trim(): void {
    this.idle.splice(0).forEach((entry) => this.retire(entry));
    this.retainedBytes = 0;
  }

  /** RGBA backing-store estimates; decoder buffers and GPU copies are not included. */
  get stats(): Readonly<{
    activeCanvases: number;
    activeBytes: number;
    retainedCanvases: number;
    retainedBytes: number;
  }> {
    return {
      activeCanvases: this.active.size,
      activeBytes: [...this.active].reduce(
        (sum, entry) => sum + this.bytes(entry),
        0
      ),
      retainedCanvases: this.idle.length,
      retainedBytes: this.retainedBytes,
    };
  }

  private bytes({ canvas }: Entry): number {
    return canvas.width * canvas.height * 4;
  }

  private retire({ canvas }: Entry): void {
    canvas.width = canvas.height = 1;
  }
}
