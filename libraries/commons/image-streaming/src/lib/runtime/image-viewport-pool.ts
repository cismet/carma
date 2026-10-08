import type { DevicePixels } from "@carma-units";
import type {
  NativePreviewWindow,
  JpegPyramidLevel,
} from "../core/image-viewport-window";
import type { AvifLevelReadiness } from "./avif-pyramid-preview-source";
import { createPreviewRgbWorker } from "./create-preview-rgb-worker";

export type ImageViewportSource = {
  id: string;
  url: string;
  kind: "avif" | "jpeg" | "tiff";
  nativeSize: { width: DevicePixels; height: DevicePixels };
  minimumQualityLevel?: JpegPyramidLevel;
  /** Finest stored level relative to nativeSize (2026 public L1 uses 0.5). */
  maxSourceDensity?: number;
  flipForTexture?: boolean;
  sourceIdentity?: string;
  avifPyramidUrl?: string;
  avifOnly?: boolean;
};
/** Actual input to the accepted composition, independent of decoder-cache residency. */
export type ImageViewportInput = Readonly<{
  width: DevicePixels;
  height: DevicePixels;
  level?: number;
  backend: string;
}>;
export type ImageViewportBaseline = Readonly<{
  bitmap: ImageBitmap;
  frame: NativePreviewWindow;
  input?: ImageViewportInput;
  density: number;
}>;
export type ImageViewportProtocolState = {
  bitmap: ImageBitmap | null;
  frame: NativePreviewWindow | null;
  density: number;
  complete: boolean;
  sourceWidth?: number;
  sourceHeight?: number;
  sourceLevel?: number;
  backend?: string;
  viewportPixels: number;
  sourceResidentBytes: number;
  sourceMemory?: SourceMemory;
  workerMemory?: WorkerMemory;
  workerCanvasBytes: number;
  displayCopyBytes: number;
  externalBytes: number;
};
export type ImageViewportProtocolLease = {
  readonly retained: ImageViewportProtocolState | null;
  readonly worker: Worker | null;
  createWorker: () => Worker;
  bindWorker: (worker: Worker | null) => void;
  publish: (state: ImageViewportProtocolState) => void;
  sourceBudget: () => number;
  retainedSourceBudget: () => number;
  setTarget: (window: NativePreviewWindow) => void;
  storePrepared: (reply: ImagePreparedFrame) => void;
  takePrepared: (window: NativePreviewWindow) => ImagePreparedFrame | null;
  release: () => void;
};
export type ImagePreparedFrame = {
  bitmap: ImageBitmap;
  crop: NativePreviewWindow["source"];
  sampleDensity: number;
  sourceWidth?: number;
  sourceHeight?: number;
  sourceLevel?: number;
  sourceBackend?: string;
  sourceResidentBytes?: number;
  sourceMemory?: SourceMemory;
  workerMemory?: WorkerMemory;
};
type WorkerMemory = {
  compositionBytes: number;
  decodeCanvasBytes: number;
  workingBytes: number;
  peakWorkingBytes?: number;
};
type SourceMemory = {
  decodedTileCount: number;
  decodedBytes: number;
  rangeBytes: number;
  rangeCount: number;
  overviewBytes?: number;
};
export type ImageViewportMetrics = {
  id: string;
  active: boolean;
  viewportPixels: number;
  budgetBytes: number;
  bitmapBytes: number;
  /** Baseline bytes additional to the current bitmap; aliases are counted once. */
  baselineBytes: number;
  canvasBytes: number;
  workerBytes: number;
  sourceBytes: number;
  managedBytes: number;
  peakWorkerWorkingBytes: number;
  sourceMemory?: SourceMemory;
};
export type ImageViewportSnapshot = {
  source: ImageViewportSource;
  bitmap: ImageBitmap | null;
  frame: NativePreviewWindow | null;
  requested: NativePreviewWindow | null;
  overview: ImageBitmap | null;
  /** Borrowed, protected full-image quality floor learned from accepted frames. */
  baseline?: ImageViewportBaseline;
  input?: ImageViewportInput | null;
  overviewInput?: ImageViewportInput | null;
  readiness?: AvifLevelReadiness[];
  prepared?: { crop: NativePreviewWindow["source"]; density: number; width: number; height: number };
  loading: boolean;
  error: string | null;
  metrics: ImageViewportMetrics;
};
export type ImageViewportHandle = {
  /** Physical target pixels are supplied by the host, independent of Three/DOM placement. */
  setViewport: (window: NativePreviewWindow, viewportPixels?: number, options?: {priority?: "low" | "high"}) => void;
  subscribe: (
    listener: (snapshot: ImageViewportSnapshot) => void
  ) => () => void;
  snapshot: () => ImageViewportSnapshot;
  release: () => void;
};
type Entry = {
  key: string;
  sourceKey: string;
  source: ImageViewportSource;
  refs: number;
  worker: Worker | null;
  bitmap: ImageBitmap | null;
  frame: NativePreviewWindow | null;
  requested: NativePreviewWindow | null;
  viewportPixels: number;
  density: number;
  generation: number;
  loading: boolean;
  error: string | null;
  workerMemory?: WorkerMemory;
  sourceMemory?: SourceMemory;
  sourceBytes: number;
  lastBudget: number;
  lastRequestKey: string;
  interacting: boolean;
  parked: boolean;
  timer?: ReturnType<typeof setTimeout>;
  settleTimer?: ReturnType<typeof setTimeout>;
  listeners: Set<(snapshot: ImageViewportSnapshot) => void>;
  protocolState?: ImageViewportProtocolState;
  overview?: ImageBitmap;
  baseline?: ImageViewportBaseline;
  input?: ImageViewportInput;
  overviewInput?: ImageViewportInput;
  preparedFrame?: ImagePreparedFrame;
  readiness?: AvifLevelReadiness[];
  priority?: "low" | "high";

};
type WorkerReply = {
  kind?: string;
  readiness?: AvifLevelReadiness[];
  imageId?: string;
  sourceIdentity?: string;
  generation?: number;
  bitmap?: ImageBitmap;
  crop?: NativePreviewWindow["source"];
  sampleDensity?: number;
  sourceWidth?: number;
  sourceHeight?: number;
  sourceLevel?: number;
  sourceBackend?: string;
  sourceResidentBytes?: number;
  sourceMemory?: SourceMemory;
  workerMemory?: WorkerMemory;
  error?: string;
  complete?: boolean;
  reusePublished?: boolean;
};
const cropCovers = (
  outer: NativePreviewWindow["source"],
  inner: NativePreviewWindow["source"]
) => outer.x <= inner.x && outer.y <= inner.y &&
  outer.x + outer.width >= inner.x + inner.width &&
  outer.y + outer.height >= inner.y + inner.height;
const cropsOverlap = (
  a: NativePreviewWindow["source"],
  b: NativePreviewWindow["source"]
) => a.x < b.x + b.width && b.x < a.x + a.width &&
  a.y < b.y + b.height && b.y < a.y + a.height;

const bitmapBytes = (bitmap: ImageBitmap | null) =>
  bitmap ? bitmap.width * bitmap.height * 4 : 0;
const workerBytes = (entry: Entry) =>
  entry.workerMemory
    ? entry.workerMemory.compositionBytes +
      entry.workerMemory.decodeCanvasBytes +
      entry.workerMemory.workingBytes
    : entry.worker && entry.bitmap
    ? bitmapBytes(entry.bitmap)
    : 0;

/** Shares the production decoder, latest ROI and bounded parked workers across images.
 * Decoded pixels stay owned here; callers must neither transfer nor close snapshot bitmaps.
 * See Libraries/Image streaming stories for direct AVIF and legacy JPEG examples.
 */
export class ImageViewportPool {
  private readonly entries = new Map<string, Entry>();
  private readonly listeners = new Set<() => void>();
  private disposed = false;
  private nextInstance = 0;
  constructor(
    private readonly options: {
      maxImages?: number;
      maxBytes?: number;
      retainedSourceBytes?: number;
      createWorker?: () => Worker;
      limits?: () => {
        maxImages: number;
        maxBytes: number;
        retainedSourceBytes: number;
      };
    } = {}
  ) {}

  acquire(source: ImageViewportSource): ImageViewportHandle {
    if (this.disposed) throw new Error("Image viewport pool is disposed");
    const sourceKey = this.keyFor(source);
    let entry = [...this.entries.values()].find(
      (candidate) => candidate.sourceKey === sourceKey && !candidate.refs
    );
    const key = entry?.key ?? `${sourceKey}:${++this.nextInstance}`;
    if (!entry) {
      entry = {
        key,
        sourceKey,
        source,
        refs: 0,
        worker: null,
        bitmap: null,
        frame: null,
        requested: null,
        viewportPixels: 0,
        density: 0,
        generation: 0,
        loading: false,
        error: null,
        sourceBytes: 0,
        lastBudget: -1,
        lastRequestKey: "",
        interacting: false,
        parked: false,
        listeners: new Set(),
      };
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    entry.refs++;
    entry.lastRequestKey = "";
    const current = entry;
    const ownedListeners = new Set<(snapshot: ImageViewportSnapshot) => void>();
    let released = false;
    this.trim();
    return {
      setViewport: (
        window,
        viewportPixels = window.target.width * window.target.height,
        options: {priority?: "low" | "high"} = {}
      ) => {
        if (released || this.disposed) return;
        const requestKey = JSON.stringify([window, viewportPixels]);
        if (requestKey === current.lastRequestKey) return;
        current.lastRequestKey = requestKey;
        current.requested = window;
        current.priority = options.priority ?? "high";
        current.viewportPixels = viewportPixels;
        current.generation++;
        current.error = null;
        if (current.loading) current.worker?.postMessage({ cancel: true });
        if (!current.interacting) {
          current.interacting = true;
          current.worker?.postMessage({ activity: true, warmWindow: window });
        }
        clearTimeout(current.settleTimer);
        current.settleTimer = setTimeout(() => {
          current.interacting = false;
          current.worker?.postMessage({
            activity: false,
            warmWindow: current.requested,
          });
        }, 50);
        this.updateBudget(current);
        const prepared = this.takePrepared(current, window);
        if (prepared) {
          clearTimeout(current.timer);
          current.timer = undefined;
          this.receive(current, {...prepared, kind:undefined, generation: current.generation, complete: true});
        } else if (this.reuseBaseline(current, window)) {
          clearTimeout(current.timer);
          current.timer = undefined;
        } else if (current.timer === undefined) {
          // One frame deadline uses the latest crop; repeated wheel input cannot postpone it.
          current.timer = setTimeout(() => this.compose(current), 16);
        }
        this.emit(current);
      },
      subscribe: (listener) => {
        if (released) return () => {};
        current.listeners.add(listener);
        ownedListeners.add(listener);
        listener(this.snapshot(current));
        return () => {
          current.listeners.delete(listener);
          ownedListeners.delete(listener);
        };
      },
      snapshot: () => this.snapshot(current),
      release: () => {
        if (released) return;
        released = true;
        for (const listener of ownedListeners)
          current.listeners.delete(listener);
        ownedListeners.clear();
        current.refs--;
        if (!current.refs) {
          clearTimeout(current.timer);
          current.timer = undefined;
          clearTimeout(current.settleTimer);
          current.generation++;
          current.loading = false;
          current.interacting = false;
          current.parked = true;
          current.worker?.postMessage({
            cancel: true,
            park: true,
            retainedSourceByteLimit: Math.min(
              this.limits.retainedSourceBytes,
              this.sourceBudget(current)
            ),
          });
        }
        this.trim();
        this.emit(current);
      },
    };
  }

  /** Scene adapters use the same ownership/eviction store with their established protocol callbacks. */
  acquireProtocol(source: ImageViewportSource): ImageViewportProtocolLease {
    const handle = this.acquire(source);
    const entry = [...this.entries.values()].at(-1)!;
    return {
      get retained() {
        return entry.protocolState
          ? {
              ...entry.protocolState,
              sourceResidentBytes: entry.sourceBytes,
              sourceMemory: entry.sourceMemory,
              workerMemory: entry.workerMemory,
            }
          : null;
      },
      get worker() {
        return entry.worker;
      },
      createWorker: () =>
        entry.worker ??
        (entry.worker = (
          this.options.createWorker ?? createPreviewRgbWorker
        )()),
      bindWorker: (worker) => {
        entry.worker = worker;
        if (!worker) {
          entry.sourceBytes = 0;
          entry.workerMemory = undefined;
        }
      },
      publish: (state) => {
        entry.protocolState = state;
        entry.bitmap = state.bitmap;
        entry.frame = state.frame;
        entry.input = state.bitmap ? this.inputFor(entry, {
          sourceWidth: state.sourceWidth,
          sourceHeight: state.sourceHeight,
          sourceLevel: state.sourceLevel,
          sourceBackend: state.backend,
        }) : undefined;
        entry.density = state.density;
        entry.viewportPixels = state.viewportPixels;
        entry.sourceBytes = entry.worker ? state.sourceResidentBytes : 0;
        entry.sourceMemory = state.sourceMemory;
        entry.workerMemory = state.workerMemory;
        this.trim();
        this.emit(entry);
      },
      setTarget: (window) => { entry.requested = window; },
      storePrepared: (reply) => this.storePrepared(entry, reply),
      takePrepared: (window) => this.takePrepared(entry, window),
      sourceBudget: () => this.sourceBudget(entry),
      retainedSourceBudget: () =>
        Math.min(this.limits.retainedSourceBytes, this.sourceBudget(entry)),
      release: () => {
        if (entry.worker) {
          entry.worker.onmessage = (event: MessageEvent<WorkerReply>) =>
            this.receive(entry, event.data);
          entry.worker.onerror = null;
          entry.worker.onmessageerror = null;
        }
        handle.release();
      },
    };
  }
  private get limits() {
    return (
      this.options.limits?.() ?? {
        maxImages: this.options.maxImages ?? 8,
        maxBytes: this.options.maxBytes ?? 128 * 1024 * 1024,
        retainedSourceBytes:
          this.options.retainedSourceBytes ?? 4 * 1024 * 1024,
      }
    );
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  /** Borrow a resident ROI without creating a reader or starting a download. */
  peek(source: ImageViewportSource): ImageViewportSnapshot | null {
    const sourceKey = this.keyFor(source);
    const entry = [...this.entries.values()]
      .reverse()
      .find(
        (candidate) => candidate.sourceKey === sourceKey && candidate.bitmap
      );
    return entry ? this.snapshot(entry) : null;
  }
  get metrics() {
    const images = [...this.entries.values()].map((entry) =>
      this.metricsFor(entry)
    );
    return {
      images,
      managedBytes: images.reduce((sum, image) => sum + image.managedBytes, 0),
      budgetBytes: this.limits.maxBytes,
      maxImages: this.limits.maxImages,
    };
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const entry of this.entries.values()) this.retire(entry);
    this.entries.clear();
    this.listeners.clear();
  }
  private metricsFor(entry: Entry): ImageViewportMetrics {
    const prepared = bitmapBytes(entry.preparedFrame?.bitmap ?? null), overview = bitmapBytes(entry.overview ?? null);
    const baseline = entry.baseline?.bitmap;
    const baselineBytes = baseline && baseline !== entry.bitmap ? bitmapBytes(baseline) : 0;
    const bytes = bitmapBytes(entry.bitmap),
      fallbackCanvas = entry.refs && !entry.protocolState
        ? baseline
          ? Math.min(bitmapBytes(baseline), entry.viewportPixels * 4)
          : Math.min(overview, entry.viewportPixels * 4, 4 * 1024 * 1024)
        : 0,
      canvas = (entry.refs ? entry.protocolState?.displayCopyBytes ?? bytes : 0) + fallbackCanvas,
      worker = entry.worker
        ? entry.workerMemory
          ? workerBytes(entry)
          : entry.protocolState?.workerCanvasBytes ?? workerBytes(entry)
        : 0,
      external = entry.refs ? entry.protocolState?.externalBytes ?? 0 : 0;
    return {
      id: entry.source.id,
      active: entry.refs > 0,
      viewportPixels: entry.viewportPixels,
      budgetBytes: Math.max(entry.viewportPixels * 16, Math.max(overview,entry.sourceMemory?.overviewBytes??0) * 2 + bytes * 2),
      bitmapBytes: bytes,
      baselineBytes,
      canvasBytes: canvas,
      workerBytes: worker,
      sourceBytes: entry.sourceBytes,
      managedBytes: bytes + baselineBytes + canvas + worker + entry.sourceBytes + external + prepared + overview,
      peakWorkerWorkingBytes: entry.workerMemory?.peakWorkingBytes ?? 0,
      sourceMemory: entry.sourceMemory,
    };
  }
  private keyFor(source: ImageViewportSource) {
    return JSON.stringify([
      source.id,
      source.url,
      source.kind,
      source.nativeSize.width,
      source.nativeSize.height,
      source.minimumQualityLevel,
      source.maxSourceDensity,
      source.flipForTexture,
      source.sourceIdentity,
      source.avifPyramidUrl,
      source.avifOnly,
    ]);
  }
  private inputFor(entry: Entry, reply: Pick<WorkerReply,
    "sourceWidth" | "sourceHeight" | "sourceLevel" | "sourceBackend"
  >): ImageViewportInput | undefined {
    const width = reply.sourceWidth, height = reply.sourceHeight;
    if (!width || !height || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
        width < 1 || height < 1) return undefined;
    const matches = entry.readiness?.filter((level) => level.width === width && level.height === height);
    const known = matches?.length === 1 ? matches[0] : undefined;
    return {
      width: width as DevicePixels,
      height: height as DevicePixels,
      level: Number.isSafeInteger(reply.sourceLevel) && reply.sourceLevel! >= 0
        ? reply.sourceLevel : known?.level,
      backend: reply.sourceBackend ?? entry.source.kind,
    };
  }
  private snapshot(entry: Entry): ImageViewportSnapshot {
    return {
      source: entry.source,
      bitmap: entry.bitmap,
      frame: entry.frame,
      requested: entry.requested,
      overview: entry.overview ?? null,
      baseline: entry.baseline,
      input: entry.bitmap ? entry.input ?? null : null,
      overviewInput: entry.overview ? entry.overviewInput ?? null : null,
      readiness: entry.readiness,
      prepared: entry.preparedFrame ? {crop: entry.preparedFrame.crop, density: entry.preparedFrame.sampleDensity,
        width: entry.preparedFrame.bitmap.width, height: entry.preparedFrame.bitmap.height} : undefined,
      loading: entry.loading,
      error: entry.error,
      metrics: this.metricsFor(entry),
    };
  }
  private sourceBudget(entry: Entry) {
    const metrics = this.metricsFor(entry);
    const target = entry.requested?.target ?? entry.frame?.target;
    const targetBytes = target ? target.width * target.height * 4 : entry.viewportPixels * 4;
    const display = metrics.bitmapBytes + metrics.baselineBytes + metrics.canvasBytes + (entry.protocolState?.externalBytes ?? 0)
      + bitmapBytes(entry.overview ?? null) + bitmapBytes(entry.preparedFrame?.bitmap ?? null);
    // Reserve the actual crop surfaces, not three full viewports for a narrow image.
    const future = targetBytes + (entry.loading ? targetBytes : 0);
    return Math.max(0, metrics.budgetBytes - display - Math.max(metrics.workerBytes, future));
  }
  private storePrepared(entry: Entry, reply: ImagePreparedFrame) {
    const old = entry.preparedFrame;
    entry.preparedFrame = undefined;
    if (old?.bitmap !== reply.bitmap) this.closeUnowned(entry, [old?.bitmap]);
    if (this.metricsFor(entry).managedBytes + bitmapBytes(reply.bitmap) > this.metricsFor(entry).budgetBytes) {
      this.closeUnowned(entry, [reply.bitmap]); return;
    }
    entry.preparedFrame = reply;
    this.emit(entry);
  }
  private takePrepared(entry: Entry, window: NativePreviewWindow): ImagePreparedFrame | null {
    const ready = entry.preparedFrame;
    if (!ready) return null;
    const a = ready.crop, b = window.source, needed = this.density(entry, window);
    if (!cropCovers(a, b) ||
      ready.sampleDensity < needed || ready.sampleDensity > needed * 2) return null;
    entry.preparedFrame = undefined;
    return ready;
  }
  private updateBudget(entry: Entry) {
    const budget = this.sourceBudget(entry);
    if (entry.worker && entry.lastBudget !== budget) {
      entry.lastBudget = budget;
      entry.worker.postMessage({
        budgetOnly: true,
        activeSourceByteLimit: budget,
      });
    }
  }
  private compose(entry: Entry) {
    entry.timer = undefined;
    if (!entry.refs || this.disposed || !entry.requested) return;
    const window = entry.requested,
      needed = this.density(entry, window);
    const old = entry.frame?.source,
      next = window.source;
    if (
      !entry.parked &&
      entry.bitmap &&
      old &&
      cropCovers(old, next) &&
      entry.density >= needed &&
      entry.density <= needed * 2
    ) {
      entry.loading = false;
      this.emit(entry);
      return;
    }
    try {
      if (!entry.worker) {
        entry.worker = (this.options.createWorker ?? createPreviewRgbWorker)();
        entry.worker.onmessage = (event: MessageEvent<WorkerReply>) =>
          this.receive(entry, event.data);
        entry.worker.onerror = () => {
          entry.error = "Image worker failed";
          entry.loading = false;
          this.emit(entry);
        };
      }
      entry.loading = true;
      entry.parked = false;
      const activeSourceByteLimit = this.sourceBudget(entry);
      entry.lastBudget = activeSourceByteLimit;
      entry.worker.postMessage({
        url: entry.source.url,
        avifPyramidUrl:
          entry.source.avifPyramidUrl ??
          (entry.source.kind === "avif" ? entry.source.url : undefined),
        avifOnly: entry.source.avifOnly ?? entry.source.kind === "avif",
        tiff: entry.source.kind === "tiff",
        imageId: entry.source.id,
        sourceIdentity: entry.source.sourceIdentity ?? entry.source.url,
        minimumQualityLevel: entry.source.minimumQualityLevel ?? "0",
        maxSourceDensity: entry.source.maxSourceDensity ?? 1,
        nativeSize: entry.source.nativeSize,
        window,
        generation: entry.generation,
        flipForTexture: entry.source.flipForTexture ?? false,
        retainWholeImage: true,
        releaseCanvasAfterPublish: true,
        priority: entry.priority ?? "high",
        reusePublished: !!entry.bitmap,
        activeSourceByteLimit,
        retainedSourceByteLimit: Math.min(
          activeSourceByteLimit,
          this.limits.retainedSourceBytes
        ),
      });
    } catch (error) {
      entry.loading = false;
      entry.error = error instanceof Error ? error.message : String(error);
    }
    this.emit(entry);
  }
  private density(entry: Entry, window: NativePreviewWindow) {
    return Math.min(
      window.target.width / window.source.width,
      window.target.height / window.source.height,
      entry.source.kind === "avif"
        ? entry.source.maxSourceDensity ?? 1
        : 2 ** -Number(entry.source.minimumQualityLevel ?? "0")
    );
  }
  private receive(entry: Entry, reply: WorkerReply) {
    if (this.disposed || !this.entries.has(entry.key)) {
      reply.bitmap?.close();
      return;
    }
    if (reply.readiness) entry.readiness = reply.readiness;
    if (reply.kind === "prepared-frame" || reply.kind === "full-image") {
      if (reply.sourceResidentBytes !== undefined) entry.sourceBytes = reply.sourceResidentBytes;
      if (reply.workerMemory) entry.workerMemory = reply.workerMemory;
      if (reply.sourceMemory) entry.sourceMemory = reply.sourceMemory;
    }
    if (reply.kind === "prepared-frame") {
      if (reply.bitmap && reply.crop && reply.sampleDensity !== undefined && entry.refs > 0)
        this.storePrepared(entry, reply as ImagePreparedFrame);
      else reply.bitmap?.close();
      return;
    }
    if (reply.kind === "full-image") {
      if (!entry.refs || !reply.bitmap) { reply.bitmap?.close(); return; }
      const previous = entry.overview;
      entry.overview = reply.bitmap;
      this.closeUnowned(entry, [previous]);
      entry.overviewInput = this.inputFor(entry, reply);
      if (reply.sourceResidentBytes !== undefined) entry.sourceBytes = reply.sourceResidentBytes;
      this.trimOptionalSurfaces(entry);
      this.trim(); this.emit(entry); return;
    }
    if (reply.kind === "source-memory") {
      if (
        reply.sourceIdentity !==
          (entry.source.sourceIdentity ?? entry.source.url) ||
        reply.imageId !== entry.source.id
      )
        return;
    } else if (!entry.refs || reply.generation !== entry.generation) {
      reply.bitmap?.close();
      return;
    }
    if (reply.sourceResidentBytes !== undefined)
      entry.sourceBytes = reply.sourceResidentBytes;
    if (reply.sourceMemory) entry.sourceMemory = reply.sourceMemory;
    if (reply.workerMemory) entry.workerMemory = reply.workerMemory;
    if (reply.error) {
      entry.error = reply.error;
      entry.loading = false;
    }
    if (reply.reusePublished) {
      entry.loading = false;
      if (entry.bitmap && !entry.input) entry.input = this.inputFor(entry, reply);
    }
    if (reply.bitmap && entry.requested) {
      const crop = reply.crop ?? entry.requested.source;
      const density =
        reply.sampleDensity ??
        Math.min(
          reply.bitmap.width / crop.width,
          reply.bitmap.height / crop.height,
          (reply.sourceWidth ?? entry.source.nativeSize.width) /
            entry.source.nativeSize.width,
          (reply.sourceHeight ?? entry.source.nativeSize.height) /
            entry.source.nativeSize.height
        );
      const needed = this.density(entry, entry.requested);
      const quality = (value: number) => Math.min(1, value / needed);
      const priorQuality = Math.max(
        entry.bitmap && entry.frame && cropsOverlap(entry.frame.source, crop)
          ? quality(entry.density) : 0,
        entry.baseline && cropsOverlap(entry.baseline.frame.source, crop)
          ? quality(entry.baseline.density) : 0
      );
      if (quality(density) < priorQuality)
        this.closeUnowned(entry, [reply.bitmap]);
      else {
        const old = entry.bitmap;
        entry.bitmap = reply.bitmap;
        entry.frame = {
          source: crop,
          target: {
            width: reply.bitmap.width as DevicePixels,
            height: reply.bitmap.height as DevicePixels,
          },
        };
        entry.density = density;
        entry.input = this.inputFor(entry, reply);
        const previousBaseline = this.learnBaseline(entry);
        this.emit(entry);
        this.closeUnowned(entry, [old, previousBaseline]);
      }
      entry.loading = reply.complete === false;
    }
    this.trimOptionalSurfaces(entry);
    this.updateBudget(entry);
    this.trim();
    this.emit(entry);
  }
  private emit(entry: Entry) {
    const snapshot = this.snapshot(entry);
    for (const listener of entry.listeners) listener(snapshot);
    for (const listener of this.listeners) listener();
  }
  private learnBaseline(entry: Entry): ImageBitmap | undefined {
    const bitmap = entry.bitmap, frame = entry.frame;
    if (!bitmap || !frame || bitmap.width * bitmap.height > entry.viewportPixels ||
        entry.density < this.density(entry, entry.requested ?? frame) ||
        !cropCovers(frame.source, {
          x: 0 as DevicePixels, y: 0 as DevicePixels,
          ...entry.source.nativeSize,
        }) || entry.density <= (entry.baseline?.density ?? 0))
      return undefined;
    const previous = entry.baseline?.bitmap;
    entry.baseline = { bitmap, frame, input: entry.input, density: entry.density };
    return previous;
  }
  private reuseBaseline(entry: Entry, window: NativePreviewWindow): boolean {
    const baseline = entry.baseline;
    const needed = this.density(entry, window);
    if (entry.parked || !baseline || !cropCovers(baseline.frame.source, window.source) ||
        baseline.density < needed || baseline.density > needed * 2)
      return false;
    const previous = entry.bitmap;
    entry.bitmap = baseline.bitmap;
    entry.frame = baseline.frame;
    entry.input = baseline.input;
    entry.density = baseline.density;
    entry.loading = false;
    this.updateBudget(entry);
    this.emit(entry);
    this.closeUnowned(entry, [previous]);
    return true;
  }
  private closeUnowned(entry: Entry, bitmaps: Iterable<ImageBitmap | null | undefined>) {
    for (const bitmap of new Set(bitmaps)) {
      if (bitmap && bitmap !== entry.bitmap && bitmap !== entry.baseline?.bitmap &&
          bitmap !== entry.overview && bitmap !== entry.preparedFrame?.bitmap)
        bitmap.close();
    }
  }
  private trimOptionalSurfaces(entry: Entry) {
    if (!entry.refs || !entry.baseline) return;
    if (this.metricsFor(entry).managedBytes > this.metricsFor(entry).budgetBytes &&
        entry.preparedFrame) {
      const previous = entry.preparedFrame.bitmap;
      entry.preparedFrame = undefined;
      this.closeUnowned(entry, [previous]);
    }
    if (this.metricsFor(entry).managedBytes > this.metricsFor(entry).budgetBytes &&
        entry.overview) {
      const previous = entry.overview;
      entry.overview = undefined;
      entry.overviewInput = undefined;
      this.closeUnowned(entry, [previous]);
    }
  }
  private retire(entry: Entry) {
    clearTimeout(entry.timer);
    clearTimeout(entry.settleTimer);
    entry.worker?.terminate();
    for (const bitmap of new Set([
      entry.bitmap, entry.baseline?.bitmap, entry.preparedFrame?.bitmap, entry.overview,
    ])) bitmap?.close();
    entry.listeners.clear();
  }
  private trim() {
    for (const entry of this.entries.values()) {
      if (
        this.entries.size <= this.limits.maxImages &&
        this.metrics.managedBytes <= this.limits.maxBytes
      )
        break;
      if (entry.refs) continue;
      this.retire(entry);
      this.entries.delete(entry.key);
    }
  }
}
