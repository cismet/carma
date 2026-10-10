import type { DevicePixels, Ratio } from "@carma-units";
import {
  tileRangeFor,
  type ImageLevel,
  type ImageSize,
  type ImageView,
} from "../core/image-level-plan";
import type { NativePreviewWindow } from "../core/image-viewport-window";
import { drawImageLevels } from "./draw-image-levels";
import type { ImageLevelStack } from "./image-level-stack";
import type {
  ImageLevelStackPool,
  ImagePyramidSource,
} from "./image-level-stack-pool";
import type { ImagePreparedFrame } from "./image-viewport-pool";

type SharedFrame = ImagePreparedFrame & { complete: boolean };
type DemandLease = ReturnType<ImageLevelStackPool["acquireDemand"]>;
const FRAME_INTERVAL_MS = 1000 / 30;

/** Each output owns a crop and canvas, while all consumers borrow one tile stack. */
export class SharedImageViewportBackend {
  private lease?: DemandLease;
  private stack?: ImageLevelStack;
  private target?: NativePreviewWindow;
  private viewportPixels = 0;
  private priority?: "low" | "high";
  private epoch = 0;
  private disposed = false;
  private unsubscribeContent?: () => void;
  private unsubscribeState?: () => void;
  private timer?: ReturnType<typeof setTimeout>;
  private lastComposition = -Infinity;

  constructor(
    private readonly options: {
      pool: ImageLevelStackPool;
      source: ImagePyramidSource;
      nativeSize: ImageSize;
      flipForTexture?: boolean;
      onFrame: (frame: SharedFrame, window: NativePreviewWindow) => void;
      onError: (error: string) => void;
    }
  ) {}

  setViewport(
    window: NativePreviewWindow,
    viewportPixels: number,
    priority: "high" | "low"
  ) {
    if (this.disposed) return;
    if (
      ![
        window.source.x,
        window.source.y,
        window.source.width,
        window.source.height,
        window.target.width,
        window.target.height,
        viewportPixels,
      ].every(Number.isFinite) ||
      window.source.width <= 0 ||
      window.source.height <= 0 ||
      window.target.width <= 0 ||
      window.target.height <= 0 ||
      viewportPixels <= 0
    ) {
      this.options.onError("Invalid shared image viewport");
      return;
    }
    this.target = {
      source: { ...window.source },
      target: { ...window.target },
    };
    this.viewportPixels = viewportPixels;
    if (!this.lease || this.priority !== priority) {
      this.detach();
      this.priority = priority;
      const epoch = ++this.epoch;
      const lease = this.options.pool.acquireDemand(this.options.source, {
        priority,
      });
      this.lease = lease;
      // The request can be queued while foreground work delays a low demand's
      // metadata. Once native dimensions are known, map the crop exactly again.
      lease.setView(this.view(this.options.nativeSize), viewportPixels);
      void lease.ready.then(
        (stack) => {
          if (this.disposed || epoch !== this.epoch || this.lease !== lease)
            return;
          this.stack = stack;
          this.unsubscribeContent = stack.onContentChange(() =>
            this.schedule()
          );
          this.unsubscribeState = stack.subscribe(() => {
            if (stack.error) this.options.onError(stack.error);
          });
          if (stack.pyramid && this.target)
            lease.setView(this.view(stack.pyramid.native), this.viewportPixels);
          if (stack.error) this.options.onError(stack.error);
          this.schedule();
        },
        (error: unknown) => {
          if (!this.disposed && epoch === this.epoch)
            this.options.onError(
              error instanceof Error ? error.message : String(error)
            );
        }
      );
    } else {
      this.lease.setView(
        this.view(this.stack?.pyramid?.native ?? this.options.nativeSize),
        viewportPixels
      );
    }
    this.schedule();
  }

  private view(native: ImageSize): ImageView {
    const window = this.target!;
    const x = native.width / this.options.nativeSize.width;
    const y = native.height / this.options.nativeSize.height;
    const visible = {
      x: (window.source.x * x) as DevicePixels,
      y: (window.source.y * y) as DevicePixels,
      width: (window.source.width * x) as DevicePixels,
      height: (window.source.height * y) as DevicePixels,
    };
    return {
      visible,
      density: Math.max(
        window.target.width / visible.width,
        window.target.height / visible.height
      ) as Ratio,
    };
  }

  private schedule() {
    if (this.disposed || this.timer !== undefined || !this.stack) return;
    // Tile completions can arrive in bursts. Composition is outside the decode
    // callback and never runs more than 30 times per second for this output.
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.compose();
    }, Math.max(0, this.lastComposition + FRAME_INTERVAL_MS - performance.now()));
  }

  private completeLevel(view: ImageView): ImageLevel | undefined {
    const stack = this.stack!;
    const pyramid = stack.pyramid!;
    const layers = this.lease?.plan?.layers ?? [];
    return [...pyramid.levels]
      .filter((level) => layers.includes(level.level))
      .sort((a, b) => b.width * b.height - a.width * a.height)
      .find((level) => {
        const range = tileRangeFor(level, pyramid.native, view.visible);
        if (range.col0 === range.col1 || range.row0 === range.row1)
          return false;
        for (let row = range.row0; row < range.row1; row++)
          for (let col = range.col0; col < range.col1; col++)
            if (!stack.isResident(level.level, col, row)) return false;
        return true;
      });
  }

  private compose() {
    const stack = this.stack;
    const plan = this.lease?.plan;
    const window = this.target;
    if (this.disposed || !stack?.pyramid || !plan || !window) return;
    const view = this.view(stack.pyramid.native);
    const level = this.completeLevel(view);
    // A complete coarse layer avoids transparent holes while finer tiles arrive.
    if (!level) return;
    this.lastComposition = performance.now();
    const width = Math.max(1, Math.ceil(window.target.width));
    const height = Math.max(1, Math.ceil(window.target.height));
    const canvas = new OffscreenCanvas(width, height);
    let bitmap: ImageBitmap | undefined;
    try {
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Shared image viewport has no 2D context");
      // The output rectangle may have a different aspect ratio from its native
      // crop. Plan at the denser axis, but draw both axes with their exact scale.
      // The texture flip is output-only; shared native tiles keep their identity.
      context.setTransform(
        1,
        0,
        0,
        this.options.flipForTexture ? -1 : 1,
        0,
        this.options.flipForTexture ? height : 0
      );
      drawImageLevels(
        context,
        stack,
        {
          originX: view.visible.x,
          originY: view.visible.y,
          scale: width / view.visible.width,
          scaleY: height / view.visible.height,
        },
        { width, height },
        { plan }
      );
      bitmap = canvas.transferToImageBitmap();
      const sourceWidth =
        (level.width * this.options.nativeSize.width) /
        stack.pyramid.native.width;
      const sourceHeight =
        (level.height * this.options.nativeSize.height) /
        stack.pyramid.native.height;
      const published = bitmap;
      bitmap = undefined;
      this.options.onFrame(
        {
          bitmap: published,
          crop: { ...window.source },
          sampleDensity: Math.min(
            sourceWidth / this.options.nativeSize.width,
            sourceHeight / this.options.nativeSize.height,
            width / window.source.width,
            height / window.source.height
          ),
          sourceWidth: Math.max(1, Math.round(sourceWidth)),
          sourceHeight: Math.max(1, Math.round(sourceHeight)),
          sourceLevel: level.level,
          sourceBackend: `shared-${stack.source.kind}`,
          sourceResidentBytes: 0,
          complete: this.lease?.visibleReady === true,
        },
        window
      );
    } catch (error) {
      bitmap?.close();
      this.options.onError(
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      // Only the published output survives. Tile bitmaps belong to the stack.
      canvas.width = 0;
      canvas.height = 0;
    }
  }

  private detach() {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.unsubscribeContent?.();
    this.unsubscribeState?.();
    this.unsubscribeContent = undefined;
    this.unsubscribeState = undefined;
    this.lease?.release();
    this.lease = undefined;
    this.stack = undefined;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.epoch++;
    this.detach();
  }
}
