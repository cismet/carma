import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Matrix4, Texture, Vector3 } from "three";
import type {
  HoverPhotoView,
  VisibleSurfaceSamples,
} from "./sample-visible-surface";
import type { HoverPhotoProjection } from "../footprint-outline-layer";
import { createHoverPhotoDrape } from "./hover-photo-drape";

const state = vi.hoisted(() => ({
  scene: vi.fn(),
  runtimes: vi.fn(),
  terrain: vi.fn(),
  mosaic: vi.fn(),
  plan: vi.fn(),
  sample: vi.fn(),
  draw: vi.fn(),
  quality: vi.fn(),
  blit: vi.fn(),
  calibration: vi.fn(),
  prewarm: vi.fn(),
  acquire: vi.fn(),
  diagnostics: vi.fn(),
  images: [] as { id: string; active: boolean; visibleReady: boolean }[],
  subscribe: vi.fn(),
  peek: vi.fn(),
  enu: vi.fn(),
}));
vi.mock("@carma-commons/image-pyramid", () => ({
  drawImageLevels: state.draw,
}));
vi.mock("@carma-mapping/engines/maplibre", () => ({
  acquireSharedThreeScene: state.scene,
  getSharedThreeSceneRuntimes: state.runtimes,
  subscribeSharedThreeTerrain: state.terrain,
}));
vi.mock("../../core/utils/calibration", () => ({
  getCameraCalibration: state.calibration,
}));
vi.mock("../../core/utils/image-projection", () => ({
  sceneToPhotoEnu: state.enu,
}));
vi.mock("./native-preview-pool", () => ({
  nativePixelPool: {
    prewarm: state.prewarm,
    acquire: state.acquire,
    diagnostics: state.diagnostics,
    get metrics() {
      return { images: state.images };
    },
    subscribe: state.subscribe,
    peek: state.peek,
  },
  nativePreviewSource: (input: { imageId: string }) => ({
    id: input.imageId,
    url: `https://images.test/${input.imageId}.avif`,
    kind: "avif",
  }),
}));
vi.mock("../footprint-outline-layer", () => ({ MAX_HOVER_PHOTO_TRAILS: 5 }));
vi.mock("./sample-visible-surface", () => ({
  planHoverPhotoView: state.plan,
  sampleVisibleSurface: state.sample,
}));
vi.mock("./mosaic-region-quality", () => ({
  readMosaicRegionQuality: state.quality,
}));
vi.mock("./oblique-viewport-source", () => ({
  originalOf: () => undefined,
  pyramidOf: () => "https://images.test/pyramid.avif",
}));

type Overlay = {
  texture: Texture;
  showBasemapLabels?: boolean;
  opacity: number;
  priority: number;
  projective: {
    sceneToTexture: Matrix4;
    sourceProjection: Matrix4;
    underlay?: boolean;
  };
};
let overlays: Map<string, Overlay>;
type Trail = {
  texture: Texture;
  sceneToTexture: Matrix4;
  sourceProjection: Matrix4;
  opacity: number;
  priority: number;
};
let mosaic: readonly Trail[];
let mosaicGroups: Map<string, readonly Trail[]>;
const pinnedEntries = () =>
  [...mosaicGroups.entries()].find(([id]) => id.endsWith("-pin"))?.[1] ?? [];
type RenderFrame = {
  renderCamera: { projectionMatrix: Matrix4; matrixWorldInverse: Matrix4 };
  viewport: { x: number; y: number };
};
let beforeRender: ((frame?: RenderFrame) => void) | undefined;
const render = (offset = 0, width = 1200, height = 800) =>
  beforeRender?.({
    renderCamera: {
      projectionMatrix: new Matrix4().makeTranslation(offset, 0, 0),
      matrixWorldInverse: new Matrix4(),
    },
    viewport: { x: width, y: height },
  });
let frame: { revision: number; sceneFromLocal: Matrix4 };
let origin: number[];
let enu: Matrix4;
let removeFrame: ReturnType<typeof vi.fn>;
let releaseScene: ReturnType<typeof vi.fn>;
let cancelWarm: ReturnType<typeof vi.fn>;
let unsubscribe: ReturnType<typeof vi.fn>;
let poolChanged: (() => void) | undefined;
let contentChanged: (() => void) | undefined;
let idle: (() => void) | undefined;
let terrainChanged: (() => void) | undefined;
let unsubscribeTerrain: ReturnType<typeof vi.fn>;
let mapOn: ReturnType<typeof vi.fn>;
let mapOff: ReturnType<typeof vi.fn>;
const makeStack = () => ({
  source: { priority: "high", prefetchBudget: undefined },
  error: null as string | null,
  pyramid: undefined as
    | {
        levels: {
          level: number;
          width: number;
          height: number;
          cols: number;
          rows: number;
        }[];
      }
    | undefined,
  plan: undefined as
    | {
        visibleTarget: {
          level: number;
          col0: number;
          col1: number;
          row0: number;
          row1: number;
        };
      }
    | undefined,
  metrics: { visibleReady: false },
  configure: vi.fn(),
  setView: vi.fn(),
  onContentChange: vi.fn((callback: () => void) => {
    contentChanged = callback;
    return () => {
      if (contentChanged === callback) contentChanged = undefined;
    };
  }),
});
let stack: ReturnType<typeof makeStack>;
const completeStack = () => {
  stack.pyramid = {
    levels: [{ level: 4, width: 40, height: 30, cols: 1, rows: 1 }],
  };
  stack.plan = {
    visibleTarget: { level: 4, col0: 0, row0: 0, col1: 1, row1: 1 },
  };
  stack.metrics.visibleReady = true;
};
const controllers: ReturnType<typeof createHoverPhotoDrape>[] = [];
const projection = (id = "a", opacity = 1) =>
  ({
    record: { id, sourceId: id, cameraId: "camera" },
    dataset: {},
    sceneToTexture: new Matrix4()
      .makeTranslation(3, 5, 7)
      .multiply(new Matrix4().makeScale(2, 3, 4)),
    opacity,
    isCurrent: true,
  } as unknown as HoverPhotoProjection);
const create = (options: Parameters<typeof createHoverPhotoDrape>[1] = {}) => {
  const value = createHoverPhotoDrape(
    { triggerRepaint: vi.fn(), on: mapOn, off: mapOff } as never,
    options
  );
  controllers.push(value);
  return value;
};
const microtasks = async () => {
  for (let step = 0; step < 8; step++) await Promise.resolve();
};
const ready = async (p = projection()) => {
  const canvas = new OffscreenCanvas(40, 30);
  const readBase = vi.fn(async () => canvas);
  const value = create({ readBase });
  value.update([p]);
  await microtasks();
  return { value, canvas, readBase, overlay: [...overlays.values()][0] };
};
const surfaceSamples = (): VisibleSurfaceSamples => ({
  samples: [
    {
      point: new Vector3(),
      dx: new Vector3(0.01, 0, 0),
      dy: new Vector3(0, 0.01, 0),
    },
  ],
  sampleScreen: [{ x: 600, y: 400 }],
  centerSampleIndex: 0,
  cols: 9,
  rows: 7,
  sampleRadiusPixels: 100,
});
beforeEach(() => {
  vi.clearAllMocks();
  state.plan.mockReset();
  state.sample.mockReset().mockResolvedValue(surfaceSamples());
  state.quality.mockReset().mockReturnValue(null);
  contentChanged = undefined;
  state.calibration.mockReturnValue({ widthPx: 640, heightPx: 480 });
  idle = undefined;
  terrainChanged = undefined;
  unsubscribeTerrain = vi.fn();
  state.runtimes.mockReturnValue([]);
  state.terrain.mockImplementation((_map, callback: () => void) => {
    terrainChanged = callback;
    return unsubscribeTerrain;
  });
  mapOn = vi.fn((_event, callback: () => void) => {
    idle = callback;
  });
  mapOff = vi.fn();
  overlays = new Map();
  mosaic = [];
  mosaicGroups = new Map();
  state.mosaic.mockImplementation(
    (id: string, entries: readonly Trail[] | null) => {
      if (entries) mosaicGroups.set(id, entries);
      else mosaicGroups.delete(id);
      if (id.endsWith("-trails")) mosaic = entries ?? [];
    }
  );
  beforeRender = undefined;
  frame = { revision: 1, sceneFromLocal: new Matrix4() };
  origin = [7, 51];
  enu = new Matrix4().makeTranslation(10, 20, 30);
  removeFrame = vi.fn();
  releaseScene = vi.fn();
  cancelWarm = vi.fn();
  unsubscribe = vi.fn();
  state.enu.mockImplementation(() => enu.clone());
  state.images = [];
  state.diagnostics.mockReturnValue([]);
  state.peek.mockReturnValue(undefined);
  state.prewarm.mockReturnValue(cancelWarm);
  stack = makeStack();
  poolChanged = undefined;
  state.acquire.mockReturnValue({ stack, release: cancelWarm });
  state.subscribe.mockImplementation((callback: () => void) => {
    poolChanged = callback;
    return unsubscribe;
  });
  state.scene.mockReturnValue({
    release: releaseScene,
    layer: {
      setMapStylePhotoMosaic: state.mosaic,
      setMapStyleScreenOverlay: (id: string, overlay: Overlay | null) =>
        overlay ? overlays.set(id, overlay) : overlays.delete(id),
      addBeforeRenderCallback: (callback: (frame?: RenderFrame) => void) => {
        beforeRender = callback;
        return removeFrame;
      },
      getLocalFrame: () => frame,
      projectSceneToLngLat: () => origin,
    },
  });
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      constructor(public width: number, public height: number) {}
      getContext() {
        return { drawImage: state.blit };
      }
    }
  );
});
afterEach(() => {
  controllers.splice(0).forEach((value) => value.dispose());
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("hover photo retained during click flight", () => {
  it("pins only an already displayed image without waiting for loading or starting requests", () => {
    const value = create();
    expect(value.pin("missing")).toBeUndefined();
    value.update([projection()]);
    expect(value.pin("a")).toBeUndefined();
    expect(state.acquire).toHaveBeenCalledOnce();
    expect(value.pin("other")).toBeUndefined();
    expect(state.acquire).toHaveBeenCalledOnce();
  });
  it("holds the existing pixels through empty updates, fading footprints and other hover targets", async () => {
    const p = projection("a", 0.6),
      { value, canvas, overlay } = await ready(p);
    expect(overlay.opacity).toBe(1);
    const texture = overlay.texture;
    const dispose = vi.spyOn(texture, "dispose");
    const release = value.pin("a");
    expect(release).toBeTypeOf("function");
    value.update([]);
    value.update([projection("a", 0)]);
    value.update([projection("b")]);
    const held = pinnedEntries();
    expect(held).toHaveLength(1);
    expect(held[0]).toMatchObject({
      texture,
      opacity: 1,
      priority: 110,
    });
    expect(held[0].sceneToTexture.equals(p.sceneToTexture)).toBe(true);
    expect(canvas.width).toBe(40);
    expect(dispose).not.toHaveBeenCalled();
    expect(state.acquire).toHaveBeenCalledOnce();
    expect(cancelWarm).toHaveBeenCalledOnce();
    expect(unsubscribe).toHaveBeenCalledOnce();
    release!();
    expect(overlays.size).toBe(0);
    expect(dispose).toHaveBeenCalledOnce();
    expect(canvas.width).toBe(1);
    expect(canvas.height).toBe(1);
  });
  it("moves the pinned snapshot to its own surface channel while leaving both flat slots free", async () => {
    const { value, overlay } = await ready();
    expect(overlay.projective.underlay).toBeUndefined();
    expect(overlay.priority).toBe(2);
    value.pin("a");
    const held = pinnedEntries()[0];
    expect(overlays.size).toBe(0);
    expect(held.priority).toBe(110);
  });
  it("makes old releases harmless after a new pin and releases each texture only once", async () => {
    const { value, overlay } = await ready();
    const dispose = vi.spyOn(overlay.texture, "dispose");
    const old = value.pin("a")!,
      current = value.pin("a")!;
    old();
    expect(overlays.size).toBe(0);
    expect(pinnedEntries()).toHaveLength(1);
    expect(dispose).not.toHaveBeenCalled();
    current();
    current();
    old();
    expect(overlays.size).toBe(0);
    expect(dispose).toHaveBeenCalledOnce();
  });
  it("rebases the frozen original photo projector without using the interpolated view camera", async () => {
    const p = projection(),
      initial = p.sceneToTexture.clone(),
      firstEnu = enu.clone();
    const { value } = await ready(p);
    value.pin("a");
    value.update([]);
    p.sceneToTexture.makeTranslation(999, 999, 999);
    beforeRender!();
    expect(pinnedEntries()[0].sceneToTexture.equals(initial)).toBe(true);
    const calls = state.enu.mock.calls.length;
    beforeRender!();
    expect(state.enu).toHaveBeenCalledTimes(calls);
    frame = { revision: 2, sceneFromLocal: new Matrix4().makeRotationZ(0.7) };
    origin = [7.01, 51.01];
    enu = new Matrix4().makeTranslation(50, 60, 70);
    beforeRender!();
    const expected = initial
      .clone()
      .multiply(firstEnu.clone().invert())
      .multiply(enu);
    expect(pinnedEntries()[0].sceneToTexture.elements).toEqual(
      expected.elements
    );
    const sensorPoint = new Vector3(0.3, 0.6, 0.2);
    const rebasedScenePoint = sensorPoint
      .clone()
      .applyMatrix4(expected.clone().invert());
    expect(
      rebasedScenePoint
        .applyMatrix4(pinnedEntries()[0].sourceProjection)
        .distanceTo(sensorPoint)
    ).toBeLessThan(1e-12);
    expect(state.enu).toHaveBeenLastCalledWith(
      origin,
      frame.sceneFromLocal,
      { longitude: 7, latitude: 51 },
      0
    );
  });
  it("cleans a pinned snapshot, subscriptions and frame callback on cancellation/disposal", async () => {
    const { value, canvas, overlay } = await ready();
    const dispose = vi.spyOn(overlay.texture, "dispose");
    const release = value.pin("a")!;
    expect(pinnedEntries()).toHaveLength(1);
    dispose.mockImplementation(() => {
      expect(pinnedEntries()).toHaveLength(0);
      expect(mosaicGroups.size).toBe(0);
    });
    value.dispose();
    release();
    value.dispose();
    value.update([projection()]);
    beforeRender!();
    expect(overlays.size).toBe(0);
    expect(dispose).toHaveBeenCalledOnce();
    expect(canvas.width).toBe(1);
    expect(removeFrame).toHaveBeenCalledOnce();
    expect(releaseScene).toHaveBeenCalledOnce();
    expect(state.acquire).toHaveBeenCalledOnce();
  });
  it("discards late decoded bases after their hover was cancelled", async () => {
    let finish!: (canvas: OffscreenCanvas) => void;
    const value = create({
      readBase: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    value.update([projection()]);
    value.update([]);
    const canvas = new OffscreenCanvas(40, 30);
    finish(canvas);
    await microtasks();
    expect(overlays.size).toBe(0);
    expect(canvas.width).toBe(1);
    expect(cancelWarm).toHaveBeenCalledOnce();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});

describe("direct hover demand priority", () => {
  it("waits for another active preview, then uses a low-priority demand lease without a prewarm budget", () => {
    state.images = [{ id: "preview", active: true, visibleReady: false }];
    const value = create();
    value.update([projection()]);
    expect(state.acquire).not.toHaveBeenCalled();
    expect(state.prewarm).not.toHaveBeenCalled();
    state.images[0].visibleReady = true;
    poolChanged!();
    expect(state.acquire).toHaveBeenCalledOnce();
    expect(stack.source.priority).toBe("low");
    expect(stack.configure).toHaveBeenCalledWith(
      expect.objectContaining({ idlePrefetch: "none" })
    );
    expect(stack.setView).toHaveBeenCalledOnce();
    expect(state.prewarm).not.toHaveBeenCalled();
  });
  it("releases its demand as soon as active preview pixels become pending and resumes afterward", () => {
    const value = create();
    value.update([projection()]);
    expect(state.acquire).toHaveBeenCalledOnce();
    state.images = [{ id: "preview", active: true, visibleReady: false }];
    poolChanged!();
    expect(cancelWarm).toHaveBeenCalledOnce();
    expect(state.acquire).toHaveBeenCalledOnce();
    state.images[0].visibleReady = true;
    poolChanged!();
    expect(state.acquire).toHaveBeenCalledTimes(2);
    value.dispose();
    expect(cancelWarm).toHaveBeenCalledTimes(2);
  });
  it("completes demand pixels even when the separate forecast path would exhaust its budget", () => {
    state.prewarm.mockImplementation(() => {
      throw Error("prefetch budget exhausted");
    });
    completeStack();
    const loading = vi.fn();
    const value = create({ onLoadingChange: loading });
    value.update([projection()]);
    expect(overlays.size).toBe(1);
    expect([...overlays.values()][0].texture.image.width).toBe(40);
    expect(cancelWarm).toHaveBeenCalledOnce();
    expect(loading.mock.calls.map(([flag]) => flag)).toEqual([true, false]);
    expect(state.prewarm).not.toHaveBeenCalled();
  });
  it("does not replace a finer cached snapshot with a coarser demand completion", async () => {
    const canvas = new OffscreenCanvas(80, 60);
    const value = create({ readBase: async () => canvas });
    value.update([projection()]);
    await microtasks();
    const texture = [...overlays.values()][0].texture;
    const dispose = vi.spyOn(texture, "dispose");
    completeStack();
    poolChanged!();
    expect([...overlays.values()][0].texture).toBe(texture);
    expect(canvas.width).toBe(80);
    expect(dispose).not.toHaveBeenCalled();
    expect(cancelWarm).toHaveBeenCalledOnce();
  });
  it("does not reacquire after the hover has been cancelled, even when priority changes later", () => {
    const value = create();
    value.update([projection()]);
    value.update([]);
    poolChanged!();
    expect(state.acquire).toHaveBeenCalledOnce();
    expect(cancelWarm).toHaveBeenCalledOnce();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(overlays.size).toBe(0);
  });
});

describe("hover cached errors and active-source ownership", () => {
  it("keeps a usable async cache fallback when the demand stack carries a stale error", async () => {
    stack.error = "old metadata error";
    let finish!: (canvas: OffscreenCanvas) => void;
    const loading = vi.fn();
    const value = create({
      readBase: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      onLoadingChange: loading,
    });
    value.update([projection()]);
    expect(cancelWarm).not.toHaveBeenCalled();
    const canvas = new OffscreenCanvas(80, 60);
    finish(canvas);
    await microtasks();
    expect(overlays.size).toBe(1);
    expect([...overlays.values()][0].texture.image).toBe(canvas);
    expect(canvas.width).toBe(80);
    expect(cancelWarm).toHaveBeenCalledOnce();
    expect(loading).toHaveBeenLastCalledWith(false);
    value.update([projection()]);
    expect(state.acquire).toHaveBeenCalledOnce();
  });
  it("uses complete resident pixels despite an unrelated sticky stack error", () => {
    completeStack();
    stack.error = "old speculative request failed";
    const value = create();
    value.update([projection()]);
    expect(overlays.size).toBe(1);
    expect(cancelWarm).toHaveBeenCalledOnce();
  });
  it("never retargets the same source while its preview owns the active crop", async () => {
    state.images = [{ id: "a", active: true, visibleReady: false }];
    const canvas = new OffscreenCanvas(80, 60);
    const value = create({ readBase: async () => canvas });
    value.update([projection()]);
    await microtasks();
    expect(state.acquire).not.toHaveBeenCalled();
    expect(stack.setView).not.toHaveBeenCalled();
    expect(stack.configure).not.toHaveBeenCalled();
    expect(overlays.size).toBe(1);
    expect([...overlays.values()][0].texture.image).toBe(canvas);
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
  it("counts the timeout only while demand owns a lease, not while yielding to an active preview", async () => {
    vi.useFakeTimers();
    const loading = vi.fn();
    const value = create({ onLoadingChange: loading });
    value.update([projection()]);
    await microtasks();
    expect(vi.getTimerCount()).toBe(1);
    state.images = [{ id: "preview", active: true, visibleReady: false }];
    poolChanged!();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(45000);
    expect(loading).not.toHaveBeenCalledWith(false);
    state.images[0].visibleReady = true;
    poolChanged!();
    expect(state.acquire).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(30000);
    expect(loading).toHaveBeenLastCalledWith(false);
    expect(cancelWarm).toHaveBeenCalledTimes(2);
    value.update([projection()]);
    expect(state.acquire).toHaveBeenCalledTimes(2);
  });
});

describe("hover retry lifetime", () => {
  it("retries a timed-out visible footprint with backoff and stops after it disappears", async () => {
    vi.useFakeTimers();
    const value = create();
    value.update([projection()]);
    await microtasks();
    await vi.advanceTimersByTimeAsync(30000);
    expect(state.acquire).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(499);
    expect(state.acquire).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(state.acquire).toHaveBeenCalledTimes(2);
    value.update([]);
    await vi.advanceTimersByTimeAsync(40000);
    expect(state.acquire).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("cancels an already queued retry as soon as the footprint starts fading", async () => {
    vi.useFakeTimers();
    const value = create();
    value.update([projection()]);
    await microtasks();
    await vi.advanceTimersByTimeAsync(30000);
    expect(vi.getTimerCount()).toBe(1);
    value.update([{ ...projection(), isCurrent: false, opacity: 0.8 }]);
    await vi.advanceTimersByTimeAsync(40000);
    expect(state.acquire).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("surface-visible hover detail", () => {
  const region = (): HoverPhotoView =>
    ({
      view: {
        visible: { x: 80, y: 60, width: 241, height: 121 },
        density: 0.5,
      },
      width: 120,
      height: 60,
      requiredDensity: 0.5,
      nativeLimited: false,
      budgetLimited: false,
    } as HoverPhotoView);
  const startRoi = async (
    options: Parameters<typeof createHoverPhotoDrape>[1] = {}
  ) => {
    vi.useFakeTimers();
    const value = create({ intersectSurface: vi.fn(() => null), ...options });
    value.update([projection()]);
    render();
    await vi.advanceTimersByTimeAsync(80);
    await microtasks();
    return value;
  };
  it("reuses one viewport sample promise across photo changes without aborting shared geometry", async () => {
    let finish!: (samples: VisibleSurfaceSamples) => void;
    state.sample.mockImplementation(
      () =>
        new Promise<VisibleSurfaceSamples>((resolve) => {
          finish = resolve;
        })
    );
    state.plan.mockImplementation(async ({ surfaceSamples: shared }) => {
      await shared;
      return region();
    });
    const value = await startRoi();
    const sampling = state.sample.mock.calls[0][0];
    const first = state.plan.mock.calls[0][0];
    value.update([projection("b")]);
    expect(first.signal.aborted).toBe(true);
    expect(sampling.signal.aborted).toBe(false);
    render();
    await vi.advanceTimersByTimeAsync(80);
    const second = state.plan.mock.calls[1][0];
    expect(state.sample).toHaveBeenCalledOnce();
    expect(second.surfaceSamples).toBe(first.surfaceSamples);
    expect(second.signal).not.toBe(sampling.signal);
    expect(sampling.isCurrent()).toBe(true);
    finish(surfaceSamples());
    await microtasks();
    expect(state.acquire).toHaveBeenCalledOnce();
    expect(first.isCurrent()).toBe(false);
    value.update([projection("b")]);
    render();
    await vi.advanceTimersByTimeAsync(100);
    expect(state.sample).toHaveBeenCalledOnce();
    expect(state.plan).toHaveBeenCalledTimes(2);
    value.dispose();
    expect(sampling.signal.aborted).toBe(true);
  });

  it.each(["camera", "pixels", "runtime", "terrain"] as const)(
    "aborts and replaces cached samples after %s changes",
    async (change) => {
      state.plan.mockResolvedValue(region());
      const value = await startRoi();
      const sampling = state.sample.mock.calls[0][0];
      const first = state.plan.mock.calls[0][0];
      if (change === "camera") render(1);
      else if (change === "pixels") render(0, 1600, 900);
      else if (change === "terrain") terrainChanged!();
      else {
        state.runtimes.mockReturnValue([
          {
            id: "mesh",
            root: { visible: true },
            mapStyleProjectionVersion: () => 2,
            hasRenderableContent: () => true,
          },
        ]);
        idle!();
      }
      expect(sampling.signal.aborted).toBe(true);
      value.update([projection("b")]);
      await vi.advanceTimersByTimeAsync(80);
      expect(state.sample).toHaveBeenCalledTimes(2);
      const nextSampling = state.sample.mock.calls[1][0];
      expect(nextSampling.signal.aborted).toBe(false);
      expect(state.plan.mock.calls[1][0].surfaceSamples).not.toBe(
        first.surfaceSamples
      );
      if (change === "pixels")
        expect(nextSampling.pixels).toEqual({ width: 1600, height: 900 });
      if (change === "camera")
        expect(nextSampling.clip.equals(sampling.clip)).toBe(false);
      if (change === "runtime") {
        idle!();
        expect(nextSampling.signal.aborted).toBe(false);
      }
      value.dispose();
    }
  );

  it.each(["null", "empty", "failure"] as const)(
    "does not retain %s samples and permits a same-viewport retry",
    async (result) => {
      if (result === "failure")
        state.sample.mockRejectedValueOnce(new Error("surface unavailable"));
      else
        state.sample.mockResolvedValueOnce(
          result === "null" ? null : { ...surfaceSamples(), samples: [] }
        );
      state.plan.mockImplementation(async ({ surfaceSamples: shared }) =>
        (await shared)?.samples.length ? region() : null
      );
      const value = await startRoi();
      const first = state.plan.mock.calls[0][0];
      value.update([projection("b")]);
      await vi.advanceTimersByTimeAsync(80);
      expect(state.sample).toHaveBeenCalledTimes(2);
      expect(state.plan.mock.calls[1][0].surfaceSamples).not.toBe(
        first.surfaceSamples
      );
      await expect(
        state.plan.mock.calls[1][0].surfaceSamples
      ).resolves.toMatchObject({ samples: [expect.anything()] });
      value.dispose();
    }
  );

  it.each(["pin", "dispose"] as const)(
    "aborts pending geometry on %s and ignores its late completion",
    async (action) => {
      let finish!: (samples: VisibleSurfaceSamples) => void;
      state.sample.mockImplementation(
        () =>
          new Promise<VisibleSurfaceSamples>((resolve) => {
            finish = resolve;
          })
      );
      state.plan.mockImplementation(async ({ surfaceSamples: shared }) => {
        await shared;
        return region();
      });
      const value = await startRoi({
        readBase: async () => new OffscreenCanvas(40, 30),
      });
      const sampling = state.sample.mock.calls[0][0];
      if (action === "pin") expect(value.pin("a")).toBeTypeOf("function");
      else value.dispose();
      expect(sampling.signal.aborted).toBe(true);
      finish(surfaceSamples());
      await microtasks();
      expect(state.acquire).not.toHaveBeenCalled();
      expect(state.draw).not.toHaveBeenCalled();
      expect(pinnedEntries()).toHaveLength(action === "pin" ? 1 : 0);
      value.dispose();
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it("publishes partial resident pixels, reuses its texture, and keeps refining without pointer movement", async () => {
    state.plan.mockResolvedValue(region());
    const value = await startRoi();
    completeStack();
    stack.metrics.visibleReady = false;
    vi.spyOn(performance, "now").mockImplementation(() => Date.now());
    state.quality
      .mockReturnValueOnce({ signature: "coarse", tiles: [] })
      .mockReturnValue(null);
    poolChanged!();
    expect(overlays.size).toBe(1);
    expect(cancelWarm).not.toHaveBeenCalled();
    const texture = [...overlays.values()][0].texture;
    const canvas = texture.image;
    const version = texture.version;
    const draws = state.draw.mock.calls.length;
    poolChanged!();
    await vi.advanceTimersByTimeAsync(16);
    expect(state.draw).toHaveBeenCalledTimes(draws);
    state.quality
      .mockReturnValueOnce({ signature: "finer-partial", tiles: [] })
      .mockReturnValue(null);
    contentChanged!();
    expect([...overlays.values()][0].texture).toBe(texture);
    expect(texture.image).toBe(canvas);
    expect(texture.version).toBeGreaterThan(version);
    expect(cancelWarm).not.toHaveBeenCalled();
    stack.metrics.visibleReady = true;
    poolChanged!();
    expect(cancelWarm).toHaveBeenCalledOnce();
    expect(contentChanged).toBeUndefined();
    value.dispose();
  });

  it("freezes the last fading footprint and ignores late pixels, changed views and surface updates", async () => {
    state.plan.mockResolvedValue(region());
    const value = await startRoi();
    completeStack();
    stack.metrics.visibleReady = false;
    state.quality.mockReturnValueOnce({ signature: "partial", tiles: [] });
    contentChanged!();
    const notify = contentChanged!;
    const previous = [...overlays.values()][0].texture;
    const dispose = vi.spyOn(previous, "dispose");
    value.update([{ ...projection(), isCurrent: false, opacity: 0.7 }]);
    expect(cancelWarm).toHaveBeenCalledOnce();
    expect(contentChanged).toBeUndefined();
    expect(dispose).toHaveBeenCalledOnce();
    const frozen = [...overlays.values()][0].texture;
    const version = frozen.version;
    const draws = state.draw.mock.calls.length;
    const views = stack.setView.mock.calls.length;
    const requests = state.acquire.mock.calls.length;
    expect(
      Math.max(frozen.image.width, frozen.image.height)
    ).toBeLessThanOrEqual(512);
    expect([...overlays.values()][0].opacity).toBe(0.7);
    notify();
    poolChanged!();
    render(5);
    terrainChanged!();
    idle!();
    render(5);
    value.update([{ ...projection(), isCurrent: false, opacity: 0.4 }]);
    await vi.advanceTimersByTimeAsync(40000);
    expect([...overlays.values()][0].texture).toBe(frozen);
    expect(frozen.version).toBe(version);
    expect([...overlays.values()][0].opacity).toBe(0.4);
    expect(state.draw).toHaveBeenCalledTimes(draws);
    expect(stack.setView).toHaveBeenCalledTimes(views);
    expect(state.acquire).toHaveBeenCalledTimes(requests);
    expect(vi.getTimerCount()).toBe(0);
    value.update([]);
    expect(frozen.image.width).toBe(1);
    expect(overlays.size).toBe(0);
  });

  it("retries missing surfaces at the same camera and defers surface updates until active decoding completes", async () => {
    state.plan.mockResolvedValueOnce(null).mockResolvedValue(region());
    const value = await startRoi();
    expect(state.plan).toHaveBeenCalledOnce();
    expect(state.acquire).toHaveBeenCalledOnce();
    expect(mapOn).toHaveBeenCalledWith("idle", expect.any(Function));
    state.runtimes.mockReturnValue([
      {
        id: "terrain",
        root: { visible: true },
        mapStyleProjectionVersion: () => 1,
        hasRenderableContent: () => true,
      },
    ]);
    idle!();
    render();
    await vi.advanceTimersByTimeAsync(80);
    expect(state.plan).toHaveBeenCalledTimes(2);
    expect(state.acquire).toHaveBeenCalledTimes(2);
    const active = state.plan.mock.calls[1][0];
    const idleCallback = idle!;
    // Repeated equal runtime revisions do not restart work. Terrain changes
    // remain pending rather than cancelling a currently loading detail crop.
    idleCallback();
    terrainChanged!();
    render();
    await vi.advanceTimersByTimeAsync(100);
    expect(active.signal.aborted).toBe(false);
    expect(cancelWarm).toHaveBeenCalledOnce();
    expect(state.plan).toHaveBeenCalledTimes(2);
    completeStack();
    poolChanged!();
    expect(cancelWarm).toHaveBeenCalledTimes(2);
    render();
    await vi.advanceTimersByTimeAsync(80);
    expect(state.plan).toHaveBeenCalledTimes(3);
    expect(state.acquire).toHaveBeenCalledTimes(3);
    render();
    idleCallback();
    await vi.advanceTimersByTimeAsync(100);
    expect(state.plan).toHaveBeenCalledTimes(3);
    value.dispose();
    expect(unsubscribeTerrain).toHaveBeenCalledOnce();
    expect(mapOff).toHaveBeenCalledWith("idle", idleCallback);
    expect(removeFrame).toHaveBeenCalledOnce();
    terrainChanged!();
    idleCallback();
    render();
    await vi.advanceTimersByTimeAsync(100);
    expect(state.plan).toHaveBeenCalledTimes(3);
  });
  it("waits for a render frame and coalesces changing views for 80ms", async () => {
    vi.useFakeTimers();
    state.plan.mockResolvedValue(region());
    const value = create({ intersectSurface: vi.fn(() => null) });
    value.update([projection()]);
    await vi.advanceTimersByTimeAsync(100);
    expect(state.plan).not.toHaveBeenCalled();
    render();
    await vi.advanceTimersByTimeAsync(79);
    expect(state.plan).not.toHaveBeenCalled();
    render(2);
    await vi.advanceTimersByTimeAsync(79);
    expect(state.plan).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(state.plan).toHaveBeenCalledOnce();
    const input = state.plan.mock.calls[0][0];
    expect(input.pixels).toEqual({ width: 1200, height: 800 });
    expect(input.clip.equals(new Matrix4().makeTranslation(2, 0, 0))).toBe(
      true
    );
    expect(input.photo.projection.equals(projection().sceneToTexture)).toBe(
      true
    );
    expect(stack.setView).toHaveBeenCalledWith(region().view, 7200);
    render(2);
    await vi.advanceTimersByTimeAsync(100);
    expect(state.plan).toHaveBeenCalledOnce();
  });
  it("draws only the visible ROI and maps rounded canvas boundaries to exact bottom-left photo UVs", async () => {
    state.plan.mockResolvedValue(region());
    const base = new OffscreenCanvas(40, 30);
    const value = await startRoi({ readBase: async () => base });
    completeStack();
    // The selected level need not be whole-photo L4: the shared stack owns the ROI level.
    stack.pyramid!.levels = [
      { level: 2, width: 160, height: 120, cols: 4, rows: 3 },
    ];
    stack.plan!.visibleTarget = {
      level: 2,
      col0: 1,
      col1: 3,
      row0: 1,
      row1: 2,
    };
    poolChanged!();
    for (const [view, pixels] of stack.setView.mock.calls) {
      expect(view).toEqual(region().view);
      expect(pixels).toBe(7200);
    }
    expect(state.draw).toHaveBeenCalledWith(
      expect.anything(),
      stack,
      { originX: 80, originY: 60, scale: 0.5 },
      expect.objectContaining({ width: 120, height: 60 })
    );
    const layers = [...overlays.values()].sort(
      (a, b) => a.priority - b.priority
    );
    expect(layers).toHaveLength(2);
    expect(layers[0].texture.image).toBe(base);
    expect(layers[0].projective.underlay).toBe(true);
    expect(layers[1].projective.underlay).toBeUndefined();
    expect(layers[0].opacity).toBe(1);
    expect(layers[1].opacity).toBe(1);
    expect(layers[1].texture.image).toMatchObject({ width: 120, height: 60 });
    const uv = layers[1].projective.sceneToTexture
      .clone()
      .multiply(projection().sceneToTexture.clone().invert());
    const lower = new Vector3(80 / 640, (480 - 60 - 120) / 480, 0).applyMatrix4(
      uv
    );
    const upper = new Vector3(
      (80 + 240) / 640,
      (480 - 60) / 480,
      0
    ).applyMatrix4(uv);
    expect(lower.x).toBeCloseTo(0);
    expect(lower.y).toBeCloseTo(0);
    expect(upper.x).toBeCloseTo(1);
    expect(upper.y).toBeCloseTo(1);
    const sensorUv = new Vector3(80 / 640, (480 - 60 - 120) / 480, 0);
    const scenePoint = sensorUv
      .clone()
      .applyMatrix4(projection().sceneToTexture.clone().invert());
    for (const layer of layers) {
      expect(
        scenePoint
          .clone()
          .applyMatrix4(layer.projective.sourceProjection)
          .distanceTo(sensorUv)
      ).toBeLessThan(1e-12);
    }
    expect(
      scenePoint
        .clone()
        .applyMatrix4(layers[1].projective.sceneToTexture)
        .length()
    ).toBeLessThan(1e-12);
    const baseDispose = vi.spyOn(layers[0].texture, "dispose");
    const detailDispose = vi.spyOn(layers[1].texture, "dispose");
    const acquires = state.acquire.mock.calls.length;
    const views = stack.setView.mock.calls.length;
    const draws = state.draw.mock.calls.length;
    const release = value.pin("a")!;
    const held = pinnedEntries();
    expect(held).toHaveLength(1);
    expect(held[0]).toMatchObject({
      opacity: 1,
      priority: 110,
    });
    expect(held[0].sceneToTexture.equals(projection().sceneToTexture)).toBe(
      true
    );
    expect(
      scenePoint
        .clone()
        .applyMatrix4(held[0].sourceProjection)
        .distanceTo(sensorUv)
    ).toBeLessThan(1e-12);
    expect(held[0].texture.image).toMatchObject({ width: 320, height: 240 });
    expect(state.blit).toHaveBeenCalledTimes(2);
    expect(state.blit.mock.calls[0]).toEqual([base, 0, 0, 320, 240]);
    expect(state.blit.mock.calls[1][0]).toBe(layers[1].texture.image);
    for (const [index, expected] of [40, 30, 120, 60].entries()) {
      expect(state.blit.mock.calls[1][index + 1]).toBeCloseTo(expected);
    }
    expect(baseDispose).toHaveBeenCalledOnce();
    expect(detailDispose).toHaveBeenCalledOnce();
    expect(state.acquire).toHaveBeenCalledTimes(acquires);
    expect(stack.setView).toHaveBeenCalledTimes(views);
    expect(state.draw).toHaveBeenCalledTimes(draws);
    const heldDispose = vi.spyOn(held[0].texture, "dispose");
    release();
    release();
    expect(overlays.size).toBe(0);
    expect(heldDispose).toHaveBeenCalledOnce();
    expect(held[0].texture.image.width).toBe(1);
    expect(base.width).toBe(1);
    expect(layers[1].texture.image.width).toBe(1);
    expect(baseDispose).toHaveBeenCalledOnce();
    expect(detailDispose).toHaveBeenCalledOnce();
  });
  it.each([
    [10000, 8000],
    [20000, 1000],
  ])(
    "bounds the composed full-photo surface pin for a %ix%i sensor",
    async (widthPx, heightPx) => {
      state.calibration.mockReturnValue({ widthPx, heightPx });
      state.plan.mockResolvedValue(region());
      const value = await startRoi({
        readBase: async () => new OffscreenCanvas(40, 30),
      });
      completeStack();
      poolChanged!();
      value.pin("a");
      const held = pinnedEntries();
      expect(held).toHaveLength(1);
      const canvas = held[0].texture.image;
      expect(canvas.width * canvas.height).toBeLessThanOrEqual(4 * 1024 * 1024);
      expect(Math.max(canvas.width, canvas.height)).toBeLessThanOrEqual(4096);
      const density = Math.min(
        0.5,
        Math.sqrt((4 * 1024 * 1024) / (widthPx * heightPx)),
        4096 / Math.max(widthPx, heightPx)
      );
      expect(canvas.width).toBe(Math.floor(widthPx * density));
      expect(canvas.height).toBe(Math.floor(heightPx * density));
      const destination = state.blit.mock.calls[1].slice(1);
      [
        (80 * canvas.width) / widthPx,
        (60 * canvas.height) / heightPx,
        (240 * canvas.width) / widthPx,
        (120 * canvas.height) / heightPx,
      ].forEach((expected, index) => {
        expect(destination[index]).toBeCloseTo(expected);
      });
      expect(held[0].sceneToTexture.equals(projection().sceneToTexture)).toBe(
        true
      );
    }
  );
  it("retains base plus calibrated ROI in the pin channel when flattening has no context, without occupying flat slots", async () => {
    state.plan.mockResolvedValue(region());
    const base = new OffscreenCanvas(40, 30);
    const value = await startRoi({ readBase: async () => base });
    completeStack();
    poolChanged!();
    const layers = [...overlays.values()].sort(
      (a, b) => a.priority - b.priority
    );
    const detailMatrix = layers[1].projective.sceneToTexture.clone();
    const baseDispose = vi.spyOn(layers[0].texture, "dispose");
    const detailDispose = vi.spyOn(layers[1].texture, "dispose");
    const acquires = state.acquire.mock.calls.length;
    const views = stack.setView.mock.calls.length;
    const draws = state.draw.mock.calls.length;
    const noContext = vi
      .spyOn(OffscreenCanvas.prototype, "getContext")
      .mockReturnValueOnce(null);
    const release = value.pin("a")!;
    noContext.mockRestore();
    expect(overlays.size).toBe(0);
    const held = pinnedEntries();
    expect(held).toHaveLength(2);
    expect(held.map((entry) => entry.texture)).toEqual(
      layers.map((entry) => entry.texture)
    );
    expect(held.map((entry) => entry.priority)).toEqual([110, 111]);
    expect(held.map((entry) => entry.opacity)).toEqual([1, 1]);
    expect(held[0].sceneToTexture.equals(projection().sceneToTexture)).toBe(
      true
    );
    expect(held[1].sceneToTexture.equals(detailMatrix)).toBe(true);
    expect(state.blit).not.toHaveBeenCalled();
    const pinId = [...mosaicGroups.keys()].find((id) => id.endsWith("-pin"))!;
    const trailId = pinId.replace(/-pin$/, "-trails");
    expect(state.mosaic).toHaveBeenCalledWith(trailId, null);
    expect(mosaicGroups.get(pinId)).toBe(held);
    // Independent target preview users can fill both flat slots; pin updates
    // and cleanup must only address this controller's own namespaces.
    overlays.set("target-preview-base", layers[0]);
    overlays.set("target-preview-detail", layers[1]);
    value.update([]);
    expect(overlays.size).toBe(2);
    expect(pinnedEntries()).toHaveLength(2);
    baseDispose.mockImplementation(() => {
      expect(mosaicGroups.has(pinId)).toBe(false);
    });
    detailDispose.mockImplementation(() => {
      expect(mosaicGroups.has(pinId)).toBe(false);
    });
    release();
    expect(baseDispose).toHaveBeenCalledOnce();
    expect(detailDispose).toHaveBeenCalledOnce();
    expect(base.width).toBe(1);
    expect(layers[1].texture.image.width).toBe(1);
    expect(pinnedEntries()).toHaveLength(0);
    expect(overlays.size).toBe(2);
    expect(state.acquire).toHaveBeenCalledTimes(acquires);
    expect(stack.setView).toHaveBeenCalledTimes(views);
    expect(state.draw).toHaveBeenCalledTimes(draws);
    value.dispose();
    expect(overlays.size).toBe(2);
    expect(mosaicGroups.has(pinId)).toBe(false);
    expect(mosaicGroups.has(trailId)).toBe(false);
  });
  it("disposes both retired buffers when bounded trail composition has no 2D context, without repeated attempts", async () => {
    state.calibration.mockReturnValue({ widthPx: 4096, heightPx: 3072 });
    state.plan.mockResolvedValue(region());
    const base = new OffscreenCanvas(2048, 1536);
    const value = await startRoi({ readBase: async () => base });
    completeStack();
    poolChanged!();
    const layers = [...overlays.values()];
    expect(layers).toHaveLength(2);
    const disposes = layers.map((item) => vi.spyOn(item.texture, "dispose"));
    const acquires = state.acquire.mock.calls.length;
    const views = stack.setView.mock.calls.length;
    const noContext = vi
      .spyOn(OffscreenCanvas.prototype, "getContext")
      .mockReturnValue(null);
    const next = [
      projection("b"),
      { ...projection("a", 0.8), isCurrent: false },
    ];
    value.update(next);
    expect(noContext).toHaveBeenCalledOnce();
    expect(mosaic).toHaveLength(0);
    expect(overlays.size).toBe(0);
    disposes.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
    layers.forEach((item) =>
      expect(item.texture.image).toMatchObject({ width: 1, height: 1 })
    );
    value.update(next);
    expect(noContext).toHaveBeenCalledOnce();
    expect(state.acquire).toHaveBeenCalledTimes(acquires);
    expect(stack.setView).toHaveBeenCalledTimes(views);
    value.dispose();
    disposes.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
    noContext.mockRestore();
  });
  it("flattens retired ROI detail into a bounded trail without another demand and leaves both current slots available", async () => {
    state.calibration.mockReturnValue({ widthPx: 4096, heightPx: 3072 });
    state.plan.mockResolvedValue(region());
    const value = await startRoi({
      readBase: async () => new OffscreenCanvas(2048, 1536),
    });
    completeStack();
    poolChanged!();
    const layers = [...overlays.values()];
    const disposes = layers.map((item) => vi.spyOn(item.texture, "dispose"));
    const acquires = state.acquire.mock.calls.length;
    const views = stack.setView.mock.calls.length;
    value.update([
      projection("b"),
      { ...projection("a", 0.8), isCurrent: false },
    ]);
    expect(state.acquire).toHaveBeenCalledTimes(acquires);
    expect(stack.setView).toHaveBeenCalledTimes(views);
    expect(mosaic).toHaveLength(1);
    expect(mosaic[0].texture.image).toMatchObject({ width: 512, height: 384 });
    expect(mosaic[0].sceneToTexture.equals(projection().sceneToTexture)).toBe(
      true
    );
    const sensorUv = new Vector3(0.2, 0.7, 0);
    const scenePoint = sensorUv
      .clone()
      .applyMatrix4(projection().sceneToTexture.clone().invert());
    expect(
      scenePoint.applyMatrix4(mosaic[0].sourceProjection).distanceTo(sensorUv)
    ).toBeLessThan(1e-12);
    expect(mosaic[0].opacity).toBe(0.8);
    disposes.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
    expect(overlays.size).toBe(0);
    await vi.advanceTimersByTimeAsync(80);
    expect(overlays.size).toBe(2);
    expect(mosaic).toHaveLength(1);
    value.pin("b");
    expect(overlays.size).toBe(0);
    expect(pinnedEntries()).toHaveLength(1);
    expect(mosaic).toHaveLength(0);
    value.dispose();
    expect(state.mosaic).toHaveBeenLastCalledWith(
      expect.stringContaining("-trails"),
      null
    );
  });
  it("keeps the coarse base but starts no whole L4 demand when no visible surface hits exist", async () => {
    state.plan.mockResolvedValue(null);
    const base = new OffscreenCanvas(40, 30);
    const loading = vi.fn();
    await startRoi({ readBase: async () => base, onLoadingChange: loading });
    expect(state.acquire).not.toHaveBeenCalled();
    expect(stack.setView).not.toHaveBeenCalled();
    expect([...overlays.values()].map((item) => item.texture.image)).toEqual([
      base,
    ]);
    expect(loading).toHaveBeenLastCalledWith(false);
  });
  it.each(["cancel", "dispose", "pin"] as const)(
    "ignores ROI completion after %s during planning",
    async (action) => {
      let finish!: (value: HoverPhotoView) => void;
      state.plan.mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          })
      );
      const base = new OffscreenCanvas(40, 30);
      const value = await startRoi({ readBase: async () => base });
      const input = state.plan.mock.calls[0][0];
      if (action === "cancel") value.update([]);
      else if (action === "dispose") value.dispose();
      else expect(value.pin("a")).toBeTypeOf("function");
      expect(input.signal.aborted).toBe(true);
      finish(region());
      await microtasks();
      expect(state.acquire).not.toHaveBeenCalled();
      expect(state.draw).not.toHaveBeenCalled();
      expect(overlays.size).toBe(0);
      expect(pinnedEntries()).toHaveLength(action === "pin" ? 1 : 0);
    }
  );
  it("rejects stale camera planning before starting a new 80ms view request", async () => {
    let finish!: (value: HoverPhotoView) => void;
    state.plan.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    state.plan.mockResolvedValue(region());
    await startRoi();
    const old = state.plan.mock.calls[0][0];
    render(3);
    expect(old.signal.aborted).toBe(true);
    expect(old.isCurrent()).toBe(false);
    finish(region());
    await microtasks();
    expect(state.acquire).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(80);
    expect(state.plan).toHaveBeenCalledTimes(2);
    expect(state.acquire).toHaveBeenCalledOnce();
  });
  it("holds the planned crop until active preview pixels are ready and yields its lease again when needed", async () => {
    state.plan.mockResolvedValue(region());
    state.images = [{ id: "preview", active: true, visibleReady: false }];
    await startRoi();
    expect(state.acquire).not.toHaveBeenCalled();
    state.images[0].visibleReady = true;
    poolChanged!();
    expect(state.acquire).toHaveBeenCalledOnce();
    expect(stack.setView).toHaveBeenLastCalledWith(region().view, 7200);
    expect(stack.source.priority).toBe("low");
    state.images[0].visibleReady = false;
    poolChanged!();
    expect(cancelWarm).toHaveBeenCalledOnce();
    expect(state.prewarm).not.toHaveBeenCalled();
  });
});

describe("bounded hover photo trails", () => {
  it("retains five ordered fading trails below the current photo and disposes overflow without fetching retired photos", async () => {
    state.calibration.mockReturnValue({ widthPx: 4096, heightPx: 3072 });
    const readBase = vi.fn(async () => new OffscreenCanvas(2048, 1536));
    const value = create({ readBase });
    let expired: Texture | undefined;
    let expiredDispose: ReturnType<typeof vi.spyOn> | undefined;
    for (let index = 0; index <= 6; index++) {
      const previous = Array.from({ length: index }, (_, back) => ({
        ...projection(String(index - back - 1), 1 - (back + 1) / 10),
        isCurrent: false,
      }));
      value.update([projection(String(index)), ...previous]);
      await microtasks();
      expect(state.acquire).toHaveBeenCalledTimes(index + 1);
      expect(readBase).toHaveBeenCalledTimes(index + 1);
      expect(overlays.size).toBe(1);
      expect(mosaic).toHaveLength(Math.min(index, 5));
      expect(mosaic.map((item) => item.priority)).toEqual(
        Array.from({ length: Math.min(index, 5) }, (_, i) => 5 - i)
      );
      mosaic.forEach((entry, back) => {
        expect(entry.opacity).toBeCloseTo(1 - (back + 1) / 10);
        expect(entry.texture.image).toMatchObject({ width: 512, height: 384 });
      });
      if (index === 5) {
        expired = mosaic[4].texture;
        expiredDispose = vi.spyOn(expired, "dispose");
      }
    }
    expect(expiredDispose).toHaveBeenCalledOnce();
    expect(expired!.image.width).toBe(1);
    expect(
      mosaic.reduce(
        (bytes, item) =>
          bytes + item.texture.image.width * item.texture.image.height * 8,
        0
      )
    ).toBeLessThanOrEqual(10 * 1024 * 1024);
    const textures = [
      ...mosaic.map((item) => item.texture),
      ...[...overlays.values()].map((item) => item.texture),
    ];
    const disposes = textures.map((texture) => vi.spyOn(texture, "dispose"));
    value.update([
      projection("6"),
      ...Array.from({ length: 5 }, (_, i) => ({
        ...projection(String(5 - i), 0.25),
        isCurrent: false,
      })),
    ]);
    expect(mosaic.every((item) => item.opacity === 0.25)).toBe(true);
    expect(state.acquire).toHaveBeenCalledTimes(7);
    expect(readBase).toHaveBeenCalledTimes(7);
    expect(state.prewarm).not.toHaveBeenCalled();
    value.pin("6");
    expect(mosaic).toHaveLength(0);
    expect(overlays.size).toBe(0);
    expect(pinnedEntries()).toHaveLength(1);
    value.dispose();
    value.dispose();
    expect(mosaic).toHaveLength(0);
    expect(overlays.size).toBe(0);
    disposes.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
    expect(state.mosaic).toHaveBeenLastCalledWith(
      expect.stringContaining("-trails"),
      null
    );
  });
});

describe("stationary hover decoration refresh", () => {
  it("updates label uniforms without replacing the texture or starting pixel work", async () => {
    let showLabels = true;
    const readBase = vi.fn(async () => new OffscreenCanvas(40, 30));
    const value = create({ readBase, showBasemapLabels: () => showLabels });
    value.update([projection()]);
    await microtasks();
    const [id, initial] = [...overlays.entries()][0];
    expect(initial.showBasemapLabels).toBe(true);
    const counts = () =>
      [
        readBase,
        state.prewarm,
        state.acquire,
        state.draw,
        state.blit,
        state.plan,
        state.sample,
      ].map((fn) => fn.mock.calls.length);
    const before = counts();
    for (const next of [false, true]) {
      showLabels = next;
      value.refreshStyle();
      await microtasks();
      const current = overlays.get(id)!;
      expect(current.showBasemapLabels).toBe(next);
      expect(current.texture).toBe(initial.texture);
      expect(
        current.projective.sceneToTexture.equals(
          initial.projective.sceneToTexture
        )
      ).toBe(true);
      expect(counts()).toEqual(before);
    }
    value.dispose();
    value.refreshStyle();
    expect(overlays.size).toBe(0);
    expect(counts()).toEqual(before);
  });
});
