import type { DevicePixels } from "@carma-units";
import type {
  NativePreviewWindow,
  JpegPyramidLevel,
} from "../core/image-viewport-window";
import type {
  AvifLevelReadiness,
  AvifPyramidPreviewSource,
} from "./avif-pyramid-preview-source";
import { createPreviewRgbWorker } from "./create-preview-rgb-worker";
import type {
  ImageLevelStackPool,
  ImagePyramidSource,
} from "./image-level-stack-pool";
import { SharedImageViewportBackend } from "./shared-image-viewport-backend";

export type ImageViewportSource = {
  id: string;
  url: string;
  kind: "avif";
  nativeSize: { width: DevicePixels; height: DevicePixels };
  minimumQualityLevel?: JpegPyramidLevel;
  /** Finest stored level relative to nativeSize (2026 public L1 uses 0.5). */
  maxSourceDensity?: number;
  flipForTexture?: boolean;
  sourceIdentity?: string;
  avifPyramidUrl?: string;
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
  /** Borrowed buffer; the lease owns it and callers must not close or transfer it. */
  borrowFrame: (window: NativePreviewWindow) => ImageViewportBaseline | null;
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
  /** Display, transfer and composition surfaces are bounded separately from decode caches. */
  renderBudgetBytes: number;
  cacheBudgetBytes: number;
  bufferedBytes: number;
  preparedBytes: number;
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
  /** Borrowed recent level buffers; preserve the pre-zoom quality on return. */
  bufferedFrames?: readonly ImageViewportBaseline[];
  input?: ImageViewportInput | null;
  overviewInput?: ImageViewportInput | null;
  readiness?: AvifLevelReadiness[];
  neighborhoodReadiness?: AvifPyramidPreviewSource["neighborhoodReadiness"];
  prepared?: {
    crop: NativePreviewWindow["source"];
    density: number;
    width: number;
    height: number;
  };
  preparedFrames?: readonly {
    crop: NativePreviewWindow["source"];
    density: number;
    width: number;
    height: number;
  }[];
  loading: boolean;
  error: string | null;
  metrics: ImageViewportMetrics;
};
export type ImageViewportHandle = {
  /** Physical target pixels are supplied by the host, independent of Three/DOM placement. */
  setViewport: (
    window: NativePreviewWindow,
    viewportPixels?: number,
    options?: { priority?: "low" | "high" }
  ) => void;
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
  shared?: SharedImageViewportBackend;
  sharedSource?: ImagePyramidSource;
  bitmap: ImageBitmap | null;
  frame: NativePreviewWindow | null;
  requested: NativePreviewWindow | null;
  viewportPixels: number;
  density: number;
  generation: number;
  loading: boolean;
  complete: boolean;
  error: string | null;
  workerMemory?: WorkerMemory;
  sourceMemory?: SourceMemory;
  sourceBytes: number;
  lastBudget: number;
  lastRequestKey: string;
  interacting: boolean;
  parked: boolean;
  inFlight?: { generation: number; window: NativePreviewWindow; key: string };
  timer?: ReturnType<typeof setTimeout>;
  settleTimer?: ReturnType<typeof setTimeout>;
  listeners: Set<(snapshot: ImageViewportSnapshot) => void>;
  protocolState?: ImageViewportProtocolState;
  overview?: ImageBitmap;
  baseline?: ImageViewportBaseline;
  input?: ImageViewportInput;
  overviewInput?: ImageViewportInput;
  preparedFrames: ImagePreparedFrame[];
  bufferedFrames: ImageViewportBaseline[];
  readiness?: AvifLevelReadiness[];
  neighborhoodReadiness?: AvifPyramidPreviewSource["neighborhoodReadiness"];
  priority?: "low" | "high";
};
type WorkerReply = {
  kind?: string;
  readiness?: AvifLevelReadiness[];
  neighborhoodReadiness?: AvifPyramidPreviewSource["neighborhoodReadiness"];
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
) =>
  outer.x <= inner.x &&
  outer.y <= inner.y &&
  outer.x + outer.width >= inner.x + inner.width &&
  outer.y + outer.height >= inner.y + inner.height;
const cropsOverlap = (
  a: NativePreviewWindow["source"],
  b: NativePreviewWindow["source"]
) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

const bitmapBytes = (bitmap: ImageBitmap | null) =>
  bitmap ? bitmap.width * bitmap.height * 4 : 0;
const workerBytes = (entry: Entry) =>
  entry.shared
    ? entry.shared.residentBytes
    : entry.workerMemory
    ? entry.workerMemory.compositionBytes +
      entry.workerMemory.decodeCanvasBytes +
      entry.workerMemory.workingBytes
    : entry.worker && entry.bitmap
    ? bitmapBytes(entry.bitmap)
    : 0;

/** Shares the production decoder, latest ROI and bounded parked workers across images.
 * Decoded pixels stay owned here; callers must neither transfer nor close snapshot bitmaps.
 * All preview sources use the native AVIF pyramid.
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
      /** Resolved images share this tile/decoder owner with the scene and thumbnails. */
      sharedStackPool?: ImageLevelStackPool;
      resolvePyramidSource?: (
        source: ImageViewportSource
      ) => ImagePyramidSource | undefined;
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
        complete: false,
        error: null,
        sourceBytes: 0,
        lastBudget: -1,
        lastRequestKey: "",
        interacting: false,
        parked: false,
        listeners: new Set(),
        preparedFrames: [],
        bufferedFrames: [],
      };
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    entry.refs++;
    if (this.options.sharedStackPool && this.options.resolvePyramidSource)
      entry.sharedSource = this.options.resolvePyramidSource(source);
    entry.lastRequestKey = "";
    const current = entry;
    const ownedListeners = new Set<(snapshot: ImageViewportSnapshot) => void>();
    let released = false;
    this.trim();
    this.rebalance();
    return {
      setViewport: (
        window,
        viewportPixels = window.target.width * window.target.height,
        options: { priority?: "low" | "high" } = {}
      ) => {
        if (released || this.disposed) return;
        const requestKey = JSON.stringify([
          window,
          viewportPixels,
          options.priority ?? "high",
        ]);
        if (requestKey === current.lastRequestKey) return;
        current.lastRequestKey = requestKey;
        current.requested = window;
        current.priority = options.priority ?? "high";
        current.viewportPixels = viewportPixels;
        if (!current.inFlight) current.generation++;
        current.error = null;
        if (current.sharedSource && this.options.sharedStackPool) {
          current.generation++;
          current.loading = true;
          current.parked = false;
          current.shared ??= this.createSharedBackend(current);
          // Reuse a previously accepted output immediately, but keep the demand
          // live so missing pixels continue improving in the shared tile owner.
          this.reuseBuffered(current, window);
          current.shared.setViewport(window, viewportPixels, current.priority);
          this.rebalance();
          this.emit(current);
          return;
        }
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
        this.rebalance();
        // Preserve downloads and native decodes already making progress. The
        // newest requested crop is dispatched when this foreground RPC finishes.
        if (current.inFlight) {
          // An unrelated foreground request must not delay a cached return zoom.
          // Borrowing does not complete, cancel or replace that request's RPC.
          this.reuseBuffered(current, window);
          this.emit(current);
          return;
        }
        const prepared = this.takePrepared(current, window);
        if (prepared) {
          clearTimeout(current.timer);
          current.timer = undefined;
          this.receive(current, {
            ...prepared,
            kind: undefined,
            generation: current.generation,
            complete: true,
          });
        } else if (this.reuseBuffered(current, window)) {
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
          current.inFlight = undefined;
          current.loading = false;
          current.interacting = false;
          current.parked = true;
          current.shared?.dispose();
          current.shared = undefined;
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
        this.rebalance();
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
        const previous = entry.bitmap;
        if (
          state.bitmap !== previous &&
          (!state.frame ||
            !entry.frame ||
            !cropCovers(state.frame.source, entry.frame.source) ||
            state.density < entry.density)
        )
          this.rememberFrame(entry);
        entry.protocolState = state;
        entry.bitmap = state.bitmap;
        entry.frame = state.frame;
        entry.input = state.bitmap
          ? this.inputFor(entry, {
              sourceWidth: state.sourceWidth,
              sourceHeight: state.sourceHeight,
              sourceLevel: state.sourceLevel,
              sourceBackend: state.backend,
            })
          : undefined;
        entry.density = state.density;
        entry.complete = state.complete;
        entry.viewportPixels = state.viewportPixels;
        entry.sourceBytes = entry.worker ? state.sourceResidentBytes : 0;
        entry.sourceMemory = state.sourceMemory;
        entry.workerMemory = state.workerMemory;
        const previousBaseline = this.learnBaseline(entry);
        this.closeUnowned(entry, [previous, previousBaseline]);
        this.rebalance();
        this.emit(entry);
      },
      setTarget: (window) => {
        entry.requested = window;
      },
      storePrepared: (reply) => this.storePrepared(entry, reply),
      takePrepared: (window) => this.takePrepared(entry, window),
      borrowFrame: (window) => this.borrowFrame(entry, window),
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
  private createSharedBackend(entry: Entry) {
    return new SharedImageViewportBackend({
      pool: this.options.sharedStackPool!,
      source: entry.sharedSource!,
      nativeSize: entry.source.nativeSize,
      flipForTexture: entry.source.flipForTexture,
      onFrame: (frame, window) => {
        if (
          !entry.refs ||
          this.disposed ||
          !this.entries.has(entry.key) ||
          !entry.requested ||
          JSON.stringify(entry.requested) !== JSON.stringify(window)
        ) {
          frame.bitmap.close();
          return;
        }
        // Source bytes are accounted once by ImageLevelStackPool. This store
        // owns only its separately composed bitmap/history, never borrowed tiles.
        this.receive(entry, { ...frame, generation: entry.generation });
      },
      onError: (error) => {
        if (!entry.refs || this.disposed) return;
        entry.loading = false;
        entry.error = error;
        this.emit(entry);
      },
    });
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
  private frameBitmaps(entry: Entry) {
    return new Set(
      [
        entry.bitmap,
        entry.baseline?.bitmap,
        entry.overview,
        ...entry.bufferedFrames.map((frame) => frame.bitmap),
        ...entry.preparedFrames.map((frame) => frame.bitmap),
      ].filter((bitmap): bitmap is ImageBitmap => !!bitmap)
    );
  }
  private hostBytes(entry: Entry) {
    const decoded = [...this.frameBitmaps(entry)].reduce(
      (sum, bitmap) => sum + bitmapBytes(bitmap),
      0
    );
    const canvas = entry.refs
      ? entry.protocolState?.displayCopyBytes ?? entry.viewportPixels * 4
      : 0;
    return (
      decoded +
      canvas +
      (entry.refs ? entry.protocolState?.externalBytes ?? 0 : 0)
    );
  }
  private allocation(entry: Entry) {
    if (!entry.refs)
      return this.limits.retainedSourceBytes + this.hostBytes(entry);
    const active = [...this.entries.values()].filter((item) => item.refs > 0);
    const parked = [...this.entries.values()]
      .filter((item) => !item.refs)
      .reduce(
        (sum, item) =>
          sum + this.hostBytes(item) + item.sourceBytes + workerBytes(item),
        0
      );
    return Math.max(
      0,
      Math.floor((this.limits.maxBytes - parked) / Math.max(1, active.length))
    );
  }
  private metricsFor(entry: Entry): ImageViewportMetrics {
    const owned = new Set<ImageBitmap>();
    const count = (bitmap: ImageBitmap | null | undefined) => {
      if (!bitmap || owned.has(bitmap)) return 0;
      owned.add(bitmap);
      return bitmapBytes(bitmap);
    };
    const bytes = count(entry.bitmap);
    const baselineBytes = count(entry.baseline?.bitmap);
    const bufferedBytes = entry.bufferedFrames.reduce(
      (sum, frame) => sum + count(frame.bitmap),
      0
    );
    const preparedBytes = entry.preparedFrames.reduce(
      (sum, frame) => sum + count(frame.bitmap),
      0
    );
    const overview = count(entry.overview);
    const canvas = entry.refs
      ? entry.protocolState?.displayCopyBytes ?? entry.viewportPixels * 4
      : 0;
    const worker = entry.shared
      ? entry.shared.residentBytes
      : entry.worker
      ? entry.workerMemory
        ? workerBytes(entry)
        : entry.protocolState?.workerCanvasBytes ?? workerBytes(entry)
      : 0;
    const external = entry.refs ? entry.protocolState?.externalBytes ?? 0 : 0;
    const budgetBytes = this.allocation(entry);
    return {
      id: entry.source.id,
      active: entry.refs > 0,
      viewportPixels: entry.viewportPixels,
      budgetBytes,
      renderBudgetBytes: entry.viewportPixels * 16,
      cacheBudgetBytes: this.sourceBudget(entry),
      bufferedBytes,
      preparedBytes,
      bitmapBytes: bytes,
      baselineBytes,
      canvasBytes: canvas,
      workerBytes: worker,
      sourceBytes: entry.sourceBytes,
      managedBytes:
        bytes +
        baselineBytes +
        bufferedBytes +
        preparedBytes +
        overview +
        canvas +
        worker +
        entry.sourceBytes +
        external,
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
    ]);
  }
  private inputFor(
    entry: Entry,
    reply: Pick<
      WorkerReply,
      "sourceWidth" | "sourceHeight" | "sourceLevel" | "sourceBackend"
    >
  ): ImageViewportInput | undefined {
    const width = reply.sourceWidth,
      height = reply.sourceHeight;
    if (
      !width ||
      !height ||
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      width < 1 ||
      height < 1
    )
      return undefined;
    const matches = entry.readiness?.filter(
      (level) => level.width === width && level.height === height
    );
    const known = matches?.length === 1 ? matches[0] : undefined;
    return {
      width: width as DevicePixels,
      height: height as DevicePixels,
      level:
        Number.isSafeInteger(reply.sourceLevel) && reply.sourceLevel! >= 0
          ? reply.sourceLevel
          : known?.level,
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
      bufferedFrames: entry.bufferedFrames,
      input: entry.bitmap ? entry.input ?? null : null,
      overviewInput: entry.overview ? entry.overviewInput ?? null : null,
      readiness: entry.readiness,
      neighborhoodReadiness: entry.neighborhoodReadiness,
      prepared: this.preparedSummaries(entry)[0],
      preparedFrames: this.preparedSummaries(entry),
      loading: entry.loading,
      error: entry.error,
      metrics: this.metricsFor(entry),
    };
  }
  private sourceBudget(entry: Entry) {
    const target =
      entry.inFlight?.window.target ??
      entry.requested?.target ??
      entry.frame?.target;
    const targetBytes = target
      ? target.width * target.height * 4
      : entry.viewportPixels * 4;
    // The active tile pyramid has its own share of the pool. Do not starve it by
    // subtracting all retained levels from a four-viewport rendering allowance.
    const future = targetBytes + (entry.inFlight ? targetBytes : 0);
    return Math.max(
      0,
      this.allocation(entry) -
        this.hostBytes(entry) -
        Math.max(workerBytes(entry), future)
    );
  }
  private preparedSummaries(entry: Entry) {
    return entry.preparedFrames.map((frame) => ({
      crop: frame.crop,
      density: frame.sampleDensity,
      width: frame.bitmap.width,
      height: frame.bitmap.height,
    }));
  }
  private storePrepared(entry: Entry, reply: ImagePreparedFrame) {
    const removed = entry.preparedFrames.filter(
      (frame) =>
        frame.bitmap === reply.bitmap ||
        (frame.sampleDensity === reply.sampleDensity &&
          JSON.stringify(frame.crop) === JSON.stringify(reply.crop))
    );
    entry.preparedFrames = [
      reply,
      ...entry.preparedFrames.filter((frame) => !removed.includes(frame)),
    ];
    removed.push(...entry.preparedFrames.splice(2));
    this.closeUnowned(
      entry,
      removed.map((frame) => frame.bitmap)
    );
    this.rebalance();
    this.emit(entry);
  }
  private takePrepared(
    entry: Entry,
    window: NativePreviewWindow
  ): ImagePreparedFrame | null {
    const needed = this.density(entry, window);
    const ready = entry.preparedFrames
      .filter(
        (frame) =>
          cropCovers(frame.crop, window.source) &&
          frame.sampleDensity >= needed &&
          frame.sampleDensity <= needed * 2
      )
      .sort((a, b) => a.sampleDensity - b.sampleDensity)[0];
    if (!ready) return null;
    entry.preparedFrames = entry.preparedFrames.filter(
      (frame) => frame !== ready
    );
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
          entry.inFlight = undefined;
          this.emit(entry);
        };
      }
      entry.loading = true;
      entry.error = null;
      entry.parked = false;
      entry.generation++;
      entry.inFlight = {
        generation: entry.generation,
        window,
        key: entry.lastRequestKey,
      };
      const activeSourceByteLimit = this.sourceBudget(entry);
      entry.lastBudget = activeSourceByteLimit;
      entry.worker.postMessage({
        url: entry.source.url,
        avifPyramidUrl: entry.source.avifPyramidUrl ?? entry.source.url,
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
      entry.inFlight = undefined;
      entry.error = error instanceof Error ? error.message : String(error);
    }
    this.emit(entry);
  }
  private density(entry: Entry, window: NativePreviewWindow) {
    return Math.min(
      window.target.width / window.source.width,
      window.target.height / window.source.height,
      entry.source.maxSourceDensity ?? 1
    );
  }
  private receive(entry: Entry, reply: WorkerReply) {
    if (this.disposed || !this.entries.has(entry.key)) {
      reply.bitmap?.close();
      return;
    }
    if (reply.readiness) entry.readiness = reply.readiness;
    if (reply.neighborhoodReadiness)
      entry.neighborhoodReadiness = reply.neighborhoodReadiness;
    if (reply.kind === "prepared-frame" || reply.kind === "full-image") {
      if (reply.sourceResidentBytes !== undefined)
        entry.sourceBytes = reply.sourceResidentBytes;
      if (reply.workerMemory) entry.workerMemory = reply.workerMemory;
      if (reply.sourceMemory) entry.sourceMemory = reply.sourceMemory;
    }
    if (reply.kind === "prepared-frame") {
      if (
        reply.bitmap &&
        reply.crop &&
        reply.sampleDensity !== undefined &&
        entry.refs > 0
      )
        this.storePrepared(entry, reply as ImagePreparedFrame);
      else reply.bitmap?.close();
      return;
    }
    if (reply.kind === "full-image") {
      if (!entry.refs || !reply.bitmap) {
        reply.bitmap?.close();
        return;
      }
      const previous = entry.overview;
      entry.overview = reply.bitmap;
      this.closeUnowned(entry, [previous]);
      entry.overviewInput = this.inputFor(entry, reply);
      if (reply.sourceResidentBytes !== undefined)
        entry.sourceBytes = reply.sourceResidentBytes;
      this.rebalance();
      this.emit(entry);
      return;
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
      if (entry.bitmap && !entry.input)
        entry.input = this.inputFor(entry, reply);
    }
    if (reply.bitmap && entry.requested) {
      const crop =
        reply.crop ?? entry.inFlight?.window.source ?? entry.requested.source;
      // Claimed source quality cannot exceed pixels actually carried by this
      // bitmap; an invalid/released surface must never replace a sharp view.
      const density = Math.min(
        reply.sampleDensity ?? Infinity,
        reply.bitmap.width / crop.width,
        reply.bitmap.height / crop.height,
        (reply.sourceWidth ?? entry.source.nativeSize.width) /
          entry.source.nativeSize.width,
        (reply.sourceHeight ?? entry.source.nativeSize.height) /
          entry.source.nativeSize.height
      );
      const needed = this.density(entry, entry.requested);
      const belongsToPriorWindow =
        !!entry.inFlight &&
        entry.inFlight.key !== entry.lastRequestKey &&
        !cropCovers(crop, entry.requested.source);
      if (belongsToPriorWindow && reply.complete !== false) {
        const buffered: ImageViewportBaseline = {
          bitmap: reply.bitmap,
          frame: {
            source: crop,
            target: {
              width: reply.bitmap.width as DevicePixels,
              height: reply.bitmap.height as DevicePixels,
            },
          },
          density,
          input: this.inputFor(entry, reply),
        };
        this.rememberFrame(entry, buffered, true);
      } else {
        const quality = (value: number) => Math.min(1, value / needed);
        const priorQuality = Math.max(
          entry.bitmap && entry.frame && cropsOverlap(entry.frame.source, crop)
            ? quality(entry.density)
            : 0,
          entry.baseline && cropsOverlap(entry.baseline.frame.source, crop)
            ? quality(entry.baseline.density)
            : 0
        );
        const previouslyCovered =
          !!entry.bitmap &&
          !!entry.frame &&
          cropCovers(entry.frame.source, entry.requested.source);
        const uniformParent =
          !previouslyCovered &&
          cropCovers(crop, entry.requested.source) &&
          density >= needed / 2 &&
          reply.complete !== false;
        if (quality(density) < priorQuality && !uniformParent)
          this.closeUnowned(entry, [reply.bitmap]);
        else {
          const old = entry.bitmap;
          if (
            !entry.frame ||
            !cropCovers(crop, entry.frame.source) ||
            density < entry.density
          )
            this.rememberFrame(entry);
          entry.bitmap = reply.bitmap;
          entry.frame = {
            source: crop,
            target: {
              width: reply.bitmap.width as DevicePixels,
              height: reply.bitmap.height as DevicePixels,
            },
          };
          entry.density = density;
          entry.complete = reply.complete !== false;
          entry.input = this.inputFor(entry, reply);
          const previousBaseline = this.learnBaseline(entry);
          this.emit(entry);
          this.closeUnowned(entry, [old, previousBaseline]);
        }
      }
      entry.loading = reply.complete === false;
    }
    const finished =
      entry.inFlight &&
      reply.generation === entry.inFlight.generation &&
      (reply.error ||
        reply.reusePublished ||
        (reply.bitmap && reply.complete !== false));
    if (finished) {
      const oldKey = entry.inFlight!.key;
      entry.inFlight = undefined;
      entry.loading = false;
      if (
        entry.refs &&
        oldKey !== entry.lastRequestKey &&
        entry.timer === undefined
      )
        entry.timer = setTimeout(() => this.compose(entry), 16);
    }
    // A parked decoder's memory acknowledgement changes every active reader's
    // fair share, even when no camera movement or foreground reply occurs.
    this.rebalance();
    this.emit(entry);
  }
  private emit(entry: Entry) {
    const snapshot = this.snapshot(entry);
    for (const listener of entry.listeners) listener(snapshot);
    for (const listener of this.listeners) listener();
  }
  private learnBaseline(entry: Entry): ImageBitmap | undefined {
    const bitmap = entry.bitmap,
      frame = entry.frame;
    if (
      !bitmap ||
      !frame ||
      !entry.complete ||
      bitmap.width * bitmap.height > entry.viewportPixels ||
      entry.density < this.density(entry, entry.requested ?? frame) ||
      !cropCovers(frame.source, {
        x: 0 as DevicePixels,
        y: 0 as DevicePixels,
        ...entry.source.nativeSize,
      }) ||
      entry.density <= (entry.baseline?.density ?? 0)
    )
      return undefined;
    const previous = entry.baseline?.bitmap;
    entry.baseline = {
      bitmap,
      frame,
      input: entry.input,
      density: entry.density,
    };
    return previous;
  }
  private rememberFrame(
    entry: Entry,
    previous?: ImageViewportBaseline,
    complete = entry.complete
  ) {
    if (!complete) return;
    const frame =
      previous ??
      (entry.bitmap && entry.frame
        ? {
            bitmap: entry.bitmap,
            frame: entry.frame,
            input: entry.input,
            density: entry.density,
          }
        : undefined);
    if (!frame || frame.bitmap === entry.baseline?.bitmap) return;
    const obsolete = entry.bufferedFrames.filter(
      (buffer) =>
        buffer.bitmap === frame.bitmap ||
        (cropCovers(frame.frame.source, buffer.frame.source) &&
          frame.density >= buffer.density)
    );
    entry.bufferedFrames = [
      frame,
      ...entry.bufferedFrames.filter((buffer) => !obsolete.includes(buffer)),
    ];
    obsolete.push(...entry.bufferedFrames.splice(2));
    this.closeUnowned(
      entry,
      obsolete.map((buffer) => buffer.bitmap)
    );
  }
  private borrowFrame(
    entry: Entry,
    window: NativePreviewWindow
  ): ImageViewportBaseline | null {
    const needed = this.density(entry, window);
    const current =
      entry.bitmap && entry.frame
        ? {
            bitmap: entry.bitmap,
            frame: entry.frame,
            input: entry.input,
            density: entry.density,
          }
        : undefined;
    return (
      [current, entry.baseline, ...entry.bufferedFrames]
        .filter(
          (buffer): buffer is ImageViewportBaseline =>
            !!buffer &&
            cropCovers(buffer.frame.source, window.source) &&
            buffer.density >= needed / 2 &&
            buffer.density <= needed * 2
        )
        .sort((a, b) => b.density - a.density)[0] ?? null
    );
  }
  private reuseBuffered(entry: Entry, window: NativePreviewWindow): boolean {
    if (entry.parked) return false;
    const needed = this.density(entry, window);
    const ready = this.borrowFrame(entry, window);
    if (!ready) return false;
    if (ready.bitmap === entry.bitmap) {
      entry.loading = ready.density < needed;
      return !entry.loading;
    }
    const previouslyCovered =
      !!entry.bitmap &&
      !!entry.frame &&
      cropCovers(entry.frame.source, window.source);
    if (previouslyCovered && ready.density < entry.density) return false;
    const previous = entry.bitmap;
    const previousFrame =
      entry.bitmap && entry.frame
        ? {
            bitmap: entry.bitmap,
            frame: entry.frame,
            input: entry.input,
            density: entry.density,
          }
        : undefined;
    // Protect the chosen buffer before retaining the old view can evict history.
    entry.bitmap = ready.bitmap;
    entry.frame = ready.frame;
    entry.input = ready.input;
    entry.density = ready.density;
    entry.bufferedFrames = entry.bufferedFrames.filter(
      (buffer) => buffer.bitmap !== ready.bitmap
    );
    this.rememberFrame(entry, previousFrame);
    entry.complete = true;
    entry.loading = ready.density < needed;
    this.updateBudget(entry);
    this.emit(entry);
    this.closeUnowned(entry, [previous]);
    return !entry.loading;
  }
  private closeUnowned(
    entry: Entry,
    bitmaps: Iterable<ImageBitmap | null | undefined>
  ) {
    const owned = this.frameBitmaps(entry);
    for (const bitmap of new Set(bitmaps))
      if (bitmap && !owned.has(bitmap)) bitmap.close();
  }
  private trimOptionalSurfaces(entry: Entry) {
    if (!entry.refs) return;
    // Oldest speculation yields first; keep the last neighboring level before
    // surrendering the active decoded cache to a full-image overview.
    while (
      this.hostBytes(entry) + workerBytes(entry) > this.allocation(entry) &&
      entry.preparedFrames.length
    ) {
      const frame = entry.preparedFrames.pop()!;
      this.closeUnowned(entry, [frame.bitmap]);
    }
    while (
      this.hostBytes(entry) + workerBytes(entry) > this.allocation(entry) &&
      entry.bufferedFrames.length
    ) {
      const frame = entry.bufferedFrames.pop()!;
      this.closeUnowned(entry, [frame.bitmap]);
    }
    if (entry.baseline && entry.overview) {
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
    entry.shared?.dispose();
    entry.shared = undefined;
    for (const bitmap of this.frameBitmaps(entry)) bitmap.close();
    entry.listeners.clear();
  }
  private activeReservation(entry: Entry, fairBytes: number) {
    const target =
      entry.inFlight?.window.target ??
      entry.requested?.target ??
      entry.frame?.target;
    const pixels =
      entry.viewportPixels || (target ? target.width * target.height : 0);
    const targetBytes = target ? target.width * target.height * 4 : pixels * 4;
    const sourceFloor = Math.min(
      32 * 1024 * 1024,
      Math.max(12 * 1024 * 1024, pixels * 16)
    );
    const surfaces = Math.max(
      pixels * 16,
      this.hostBytes(entry) + Math.max(workerBytes(entry), targetBytes * 2)
    );
    return Math.max(
      this.metricsFor(entry).managedBytes,
      Math.min(fairBytes, surfaces + sourceFloor)
    );
  }
  private reservedBytes() {
    const active = [...this.entries.values()].filter((entry) => entry.refs);
    const fairBytes = this.limits.maxBytes / Math.max(1, active.length);
    return [...this.entries.values()].reduce(
      (sum, entry) =>
        sum +
        (entry.refs
          ? this.activeReservation(entry, fairBytes)
          : this.metricsFor(entry).managedBytes),
      0
    );
  }
  private shedParkedDecoder(entry: Entry) {
    const worker = entry.worker;
    if (!worker || entry.refs) return;
    worker.onmessage = null;
    worker.onerror = null;
    worker.onmessageerror = null;
    worker.terminate();
    entry.worker = null;
    entry.sourceBytes = 0;
    entry.sourceMemory = undefined;
    entry.workerMemory = undefined;
    entry.lastBudget = -1;
    if (entry.protocolState)
      entry.protocolState = {
        ...entry.protocolState,
        sourceResidentBytes: 0,
        sourceMemory: undefined,
        workerMemory: undefined,
        workerCanvasBytes: 0,
      };
  }
  private rebalance() {
    this.trim();
    for (const entry of this.entries.values())
      if (entry.refs) {
        this.trimOptionalSurfaces(entry);
        this.updateBudget(entry);
      }
  }
  private trim() {
    for (const entry of this.entries.values()) {
      if (
        this.entries.size <= this.limits.maxImages &&
        this.reservedBytes() <= this.limits.maxBytes
      )
        break;
      if (entry.refs) continue;
      if (this.entries.size <= this.limits.maxImages) {
        // Preserve each photo's decoded display/history buffers. Reclaim its
        // parked decoder first when the next active image needs working space.
        this.shedParkedDecoder(entry);
        if (this.reservedBytes() <= this.limits.maxBytes) continue;
      }
      this.retire(entry);
      this.entries.delete(entry.key);
    }
  }
}
