import { MercatorCoordinate, type Map as MaplibreMap } from "maplibre-gl";
import { Matrix3, Matrix4, Vector3 } from "three";
import type { ObliquePose } from "../../core/types";
import type { Degrees } from "@carma-units";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ObliqueViewportPhoto } from "./oblique-viewport-source";
import {
  preparePreviewFlight,
  preparePreviewLanding,
  previewLandingView,
} from "./prepare-preview-flight";

const state = vi.hoisted(() => ({
  acquire: vi.fn(),
  peek: vi.fn(),
  prewarm: vi.fn(),
  poolSubscribe: vi.fn(),
  stopPrewarm: vi.fn(),
  unsubscribePool: vi.fn(),
  onPool: undefined as (() => void) | undefined,
  networkAcquire: vi.fn(),
  sceneRelease: vi.fn(),
  projection: vi.fn(),
  enu: vi.fn(),
  viewportProjection: vi.fn(),
  projectedWindow: vi.fn(),
  error: null as string | null,
  hasPyramid: true,
  hasPlan: true,
  onState: undefined as (() => void) | undefined,
  releaseNetwork: vi.fn(),
  releasePixels: vi.fn(),
  unsubscribe: vi.fn(),
  setView: vi.fn(),
  remember: vi.fn(),
  visibleReady: false,
  ready: Promise.resolve() as Promise<void>,
  onChange: undefined as (() => void) | undefined,
}));
vi.mock("maplibre-gl", async () => {
  const { MercatorCoordinate } = await import(
    "maplibre-gl/src/geo/mercator_coordinate"
  );
  return { MercatorCoordinate };
});
vi.mock("@carma-geo/proj", () => ({
  getCameraLocalMercatorFit: () => new Matrix4(),
}));
vi.mock("../../core/utils/image-projection", () => ({
  imageProjectionMatrix: state.projection,
  sceneToPhotoEnu: state.enu,
  viewportImageProjection: state.viewportProjection,
}));
vi.mock("../../core/utils/native-preview-window", () => ({
  projectedNativePreviewWindow: state.projectedWindow,
}));
vi.mock("@carma-mapping/engines/maplibre", () => ({
  acquireSharedThreeScene: () => ({
    release: state.sceneRelease,
    layer: {
      projectSceneToLngLat: () => [7.2, 51.27],
      projectLngLatToScene: () => new Vector3(10, 20, 30),
    },
  }),
  acquireForegroundNetwork: (...args: unknown[]) => {
    state.networkAcquire(...args);
    let released = false;
    return () => {
      if (!released) {
        released = true;
        state.releaseNetwork();
      }
    };
  },
}));
vi.mock("../../core/utils/calibration", () => ({
  getCameraCalibration: () => ({ widthPx: 1000, heightPx: 800 }),
}));
vi.mock("./oblique-viewport-source", () => ({
  originalOf: () => "photo.avif",
  pyramidOf: () => "photo.avif",
}));
vi.mock("./native-preview-pool", () => ({
  nativePreviewSource: (input: { imageId: string }) => ({
    id: input.imageId,
    url: "photo.avif",
  }),
  nativePixelPool: {
    acquire: state.acquire,
    peek: state.peek,
    prewarm: state.prewarm,
    subscribe: state.poolSubscribe,
  },
  fitNativePreviewView: () => ({
    view: { visible: { x: 0, y: 0, width: 1000, height: 800 }, density: 1 },
    pixels: 800000,
  }),
  rememberNativePreviewView: state.remember,
}));
const map = { transform: { width: 1000, height: 800 } } as MaplibreMap;
const photo = {
  record: { sourceId: "photo", cameraId: "camera" },
  dataset: {},
} as ObliqueViewportPhoto;
beforeEach(() => {
  vi.clearAllMocks();
  state.setView.mockReset();
  state.visibleReady = false;
  state.ready = Promise.resolve();
  state.onChange = undefined;
  state.onState = undefined;
  state.error = null;
  state.hasPyramid = true;
  state.hasPlan = true;
  state.peek.mockReset();
  state.onPool = undefined;
  state.prewarm.mockReset().mockReturnValue(state.stopPrewarm);
  state.poolSubscribe.mockImplementation((listener) => {
    state.onPool = listener;
    listener();
    return state.unsubscribePool;
  });
  state.projection.mockImplementation(() => new Matrix4());
  state.enu.mockImplementation(() => new Matrix4());
  state.viewportProjection.mockImplementation(() => new Matrix3());
  state.projectedWindow.mockReturnValue({
    source: { x: 200, y: 100, width: 300, height: 200 },
    target: { width: 150, height: 100 },
  });
  state.acquire.mockImplementation(() => ({
    release: state.releasePixels,
    stack: {
      ready: state.ready,
      get error() {
        return state.error;
      },
      get pyramid() {
        return state.hasPyramid
          ? { native: { width: 1000, height: 800 } }
          : null;
      },
      get plan() {
        return state.hasPlan
          ? { visibleTarget: { level: 2, col0: 0, row0: 0, col1: 1, row1: 1 } }
          : null;
      },
      subscribe: (listener: () => void) => {
        state.onState = listener;
        listener();
        return state.unsubscribe;
      },
      metrics: {
        get visibleReady() {
          return state.visibleReady;
        },
      },
      setView: state.setView,
      onContentChange: (fn: () => void) => {
        state.onChange = fn;
        return state.unsubscribe;
      },
    },
  }));
});

describe("prepare preview pixels before camera flight", () => {
  it("acquires and seeds immediately without awaiting pixels, releases once on cancellation", () => {
    state.ready = new Promise(() => {});
    const release = preparePreviewFlight(map, photo, 0 as Degrees);
    expect(state.acquire).toHaveBeenCalledOnce();
    expect(state.setView).toHaveBeenCalledOnce();
    expect(state.remember).toHaveBeenCalledOnce();
    expect(state.releaseNetwork).not.toHaveBeenCalled();
    release();
    release();
    expect(state.releaseNetwork).toHaveBeenCalledOnce();
    expect(state.releasePixels).toHaveBeenCalledOnce();
    expect(state.unsubscribe).toHaveBeenCalledOnce();
  });
  it("releases background demand when visible target pixels arrive, keeping the photo for flight handover", () => {
    const release = preparePreviewFlight(map, photo, 0 as Degrees);
    state.visibleReady = true;
    state.onChange?.();
    expect(state.releaseNetwork).toHaveBeenCalledOnce();
    expect(state.releasePixels).not.toHaveBeenCalled();
    release();
    expect(state.releaseNetwork).toHaveBeenCalledOnce();
    expect(state.releasePixels).toHaveBeenCalledOnce();
  });
  it("unblocks background work on a missing photo without rejecting the flight", async () => {
    state.ready = Promise.reject(new Error("404"));
    const release = preparePreviewFlight(map, photo, 0 as Degrees);
    await Promise.resolve();
    expect(state.releaseNetwork).toHaveBeenCalledOnce();
    release();
    expect(state.releasePixels).toHaveBeenCalledOnce();
  });
  it("releases both leases and the listener when view setup throws", () => {
    state.setView.mockImplementation(() => {
      throw new Error("view unavailable");
    });
    const release = preparePreviewFlight(map, photo, 0 as Degrees);
    expect(state.releaseNetwork).toHaveBeenCalledOnce();
    expect(state.releasePixels).toHaveBeenCalledOnce();
    expect(state.unsubscribe).toHaveBeenCalledOnce();
    release();
    expect(state.releasePixels).toHaveBeenCalledOnce();
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("exact landing viewport readiness", () => {
  const pose = {
    longitude: 7.2,
    latitude: 51.27,
    bearingDeg: 90,
    pitchDeg: 45,
    rollDeg: 0,
  } as ObliquePose;
  const anchor = MercatorCoordinate.fromLngLat([7.2, 51.27], 150);
  const finalFrame = () =>
    ({
      width: 800,
      height: 600,
      center: { lng: 7.2, lat: 51.27 },
      getProjectionDataForCustomLayer: vi.fn(() => ({
        mainMatrix: new Matrix4().makeScale(2, 3, 4).toArray(),
      })),
    } as unknown as MaplibreMap["transform"]);
  const begin = (
    signal = new AbortController().signal,
    current?: ObliqueViewportPhoto,
    frame = finalFrame()
  ) =>
    preparePreviewLanding(
      map,
      photo,
      pose,
      950,
      frame,
      anchor,
      signal,
      current
    );
  const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
  };
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("devicePixelRatio", 1);
  });

  it("decodes the solved frame's exact guarded ROI and retains both leases until display handover", async () => {
    const frame = finalFrame();
    const resolved = vi.fn();
    const pending = begin(undefined, undefined, frame).then((release) => {
      resolved();
      return release;
    });
    await flush();
    expect(resolved).not.toHaveBeenCalled();
    expect(frame.getProjectionDataForCustomLayer).toHaveBeenCalledWith(true);
    expect(state.projectedWindow).toHaveBeenCalledWith(
      expect.any(Matrix3),
      { width: 800, height: 600 },
      { width: 1000, height: 800 },
      1
    );
    expect(state.projection).toHaveBeenCalledWith(
      photo.record,
      { widthPx: 1000, heightPx: 800 },
      pose,
      expect.any(Matrix4)
    );
    expect(state.enu).toHaveBeenCalledWith(
      [7.2, 51.27],
      expect.any(Matrix4),
      pose,
      950
    );
    expect(state.viewportProjection).toHaveBeenCalledWith(
      expect.any(Matrix4),
      expect.any(Matrix4),
      new Vector3(10, 20, 30)
    );
    expect(state.setView).toHaveBeenCalledWith(
      { visible: { x: 196, y: 96, width: 308, height: 208 }, density: 0.5 },
      16016
    );
    expect(state.sceneRelease).toHaveBeenCalledOnce();
    state.visibleReady = true;
    state.onState?.();
    const release = await pending;
    expect(release.view).toEqual(state.setView.mock.calls[0][0]);
    expect(state.remember).toHaveBeenCalledWith(
      expect.objectContaining({ id: "photo" }),
      state.setView.mock.calls[0][0],
      16016
    );
    expect(state.releasePixels).not.toHaveBeenCalled();
    expect(state.releaseNetwork).not.toHaveBeenCalled();
    expect(state.unsubscribe).toHaveBeenCalledOnce();
    release();
    release();
    expect(state.releasePixels).toHaveBeenCalledOnce();
    expect(state.releaseNetwork).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("unions all five physical camera frames at the highest required sampling density", () => {
    const frames = Array.from({ length: 5 }, finalFrame);
    const windows = [
      [100, 100, 200, 150, 0.5],
      [200, 80, 220, 160, 0.75],
      [300, 150, 300, 200, 1],
      [250, 250, 300, 250, 0.8],
      [200, 200, 200, 100, 0.6],
    ];
    state.projectedWindow.mockReset();
    for (const [x, y, width, height, density] of windows)
      state.projectedWindow.mockReturnValueOnce({
        source: { x, y, width, height },
        target: { width: width * density, height: height * density },
      });
    const result = previewLandingView(map, photo, pose, 950, frames, anchor);
    expect(result).toEqual({
      view: { visible: { x: 98, y: 78, width: 504, height: 424 }, density: 1 },
      pixels: 504 * 424,
    });
    expect(state.projectedWindow).toHaveBeenCalledTimes(5);
    frames.forEach((frame) =>
      expect(frame.getProjectionDataForCustomLayer).toHaveBeenCalledWith(true)
    );
  });

  it("rejects an eight-viewport budget overflow before starting any background decoding", async () => {
    state.projectedWindow.mockReturnValue({
      source: { x: 0, y: 0, width: 1000, height: 800 },
      target: { width: 1000, height: 800 },
    });
    const frame = {
      ...finalFrame(),
      width: 100,
      height: 100,
    } as MaplibreMap["transform"];
    await expect(
      preparePreviewLanding(
        map,
        photo,
        pose,
        950,
        frame,
        anchor,
        new AbortController().signal,
        undefined,
        [frame],
        true
      )
    ).rejects.toThrow(/zu groß/);
    expect(state.prewarm).not.toHaveBeenCalled();
    expect(state.acquire).not.toHaveBeenCalled();
  });

  it("rejects a trajectory with an uncovered intermediate frame", () => {
    state.projectedWindow
      .mockReturnValueOnce({
        source: { x: 200, y: 100, width: 300, height: 200 },
        target: { width: 150, height: 100 },
      })
      .mockReturnValueOnce(null);
    expect(() =>
      previewLandingView(
        map,
        photo,
        pose,
        950,
        [finalFrame(), finalFrame()],
        anchor
      )
    ).toThrow(/deckt/);
  });

  it("prewarms in the background without acquiring or replanning the active foreground photo", async () => {
    const stack = {
      error: null as string | null,
      pyramid: {},
      plan: { visibleTarget: {} },
      metrics: { visibleReady: true },
    };
    state.peek.mockReturnValue(stack);
    state.prewarm.mockImplementation(() => {
      stack.metrics.visibleReady = false;
      return state.stopPrewarm;
    });
    const resolved = vi.fn();
    const abort = new AbortController();
    const pending = preparePreviewLanding(
      map,
      photo,
      pose,
      950,
      finalFrame(),
      anchor,
      abort.signal,
      undefined,
      undefined,
      true
    ).then((release) => {
      resolved();
      return release;
    });
    await flush();
    expect(resolved).not.toHaveBeenCalled();
    expect(state.prewarm).toHaveBeenCalledWith(
      expect.objectContaining({ id: "photo" }),
      { visible: { x: 196, y: 96, width: 308, height: 208 }, density: 0.5 },
      16016
    );
    expect(state.acquire).not.toHaveBeenCalled();
    expect(state.networkAcquire).not.toHaveBeenCalled();
    expect(state.setView).not.toHaveBeenCalled();
    stack.metrics.visibleReady = true;
    state.onPool?.();
    const release = await pending;
    expect(release.view).toEqual(state.prewarm.mock.calls[0][1]);
    expect(state.unsubscribePool).toHaveBeenCalledOnce();
    expect(state.stopPrewarm).not.toHaveBeenCalled();
    abort.abort();
    release();
    expect(state.stopPrewarm).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["abort", "timeout", "error"])(
    "releases a pending background forecast after %s",
    async (reason) => {
      const stack = {
        error: null as string | null,
        pyramid: {},
        plan: { visibleTarget: {} },
        metrics: { visibleReady: false },
      };
      state.peek.mockReturnValue(stack);
      const abort = new AbortController();
      const pending = preparePreviewLanding(
        map,
        photo,
        pose,
        950,
        finalFrame(),
        anchor,
        abort.signal,
        undefined,
        undefined,
        true
      );
      const rejected = expect(pending).rejects.toThrow();
      await flush();
      if (reason === "abort") abort.abort();
      else if (reason === "timeout") await vi.advanceTimersByTimeAsync(5000);
      else {
        stack.error = "unavailable";
        state.onPool?.();
      }
      await rejected;
      expect(state.stopPrewarm).toHaveBeenCalledOnce();
      expect(state.unsubscribePool).toHaveBeenCalledOnce();
      expect(state.acquire).not.toHaveBeenCalled();
      expect(state.networkAcquire).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it("waits for the current visible pixels before acquiring or changing the target", async () => {
    let listener: (() => void) | undefined;
    const current = {
      metrics: { visibleReady: false },
      error: null,
      subscribe: vi.fn((fn) => {
        listener = fn;
        return off;
      }),
    };
    const off = vi.fn();
    state.peek.mockReturnValue(current);
    const pending = begin(undefined, {
      ...photo,
      record: { ...photo.record, sourceId: "outgoing" },
    });
    await flush();
    expect(state.acquire).not.toHaveBeenCalled();
    expect(state.networkAcquire).not.toHaveBeenCalled();
    expect(state.setView).not.toHaveBeenCalled();
    current.metrics.visibleReady = true;
    listener?.();
    await flush();
    expect(off).toHaveBeenCalledOnce();
    expect(state.acquire).toHaveBeenCalledOnce();
    state.visibleReady = true;
    state.onState?.();
    (await pending)();
  });

  it("does not accept a previous whole-photo readiness notification during exact-ROI replanning", async () => {
    state.visibleReady = true;
    state.setView.mockImplementation(() => {
      state.onState?.();
      state.visibleReady = false;
    });
    const resolved = vi.fn();
    const pending = begin().then((release) => {
      resolved();
      return release;
    });
    await flush();
    expect(resolved).not.toHaveBeenCalled();
    expect(state.remember).not.toHaveBeenCalled();
    state.visibleReady = true;
    state.onState?.();
    (await pending)();
    expect(resolved).toHaveBeenCalledOnce();
  });

  it("requires the landing plan and pyramid as well as visible readiness", async () => {
    state.visibleReady = true;
    state.hasPlan = false;
    state.hasPyramid = false;
    const resolved = vi.fn();
    const pending = begin().then((release) => {
      resolved();
      return release;
    });
    await flush();
    expect(resolved).not.toHaveBeenCalled();
    state.hasPyramid = true;
    state.onState?.();
    await flush();
    expect(resolved).not.toHaveBeenCalled();
    state.hasPlan = true;
    state.onState?.();
    (await pending)();
  });

  it("aborts before preparation without opening scene or pixel leases", async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(begin(abort.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(state.sceneRelease).not.toHaveBeenCalled();
    expect(state.acquire).not.toHaveBeenCalled();
  });

  it("cancels pending target work and remains idempotent after readiness", async () => {
    const abort = new AbortController();
    const pending = begin(abort.signal);
    const rejection = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    abort.abort();
    await rejection;
    expect(state.releasePixels).toHaveBeenCalledOnce();
    expect(state.releaseNetwork).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    vi.clearAllMocks();
    state.visibleReady = true;
    const next = new AbortController();
    const release = await begin(next.signal);
    next.abort();
    release();
    expect(state.releasePixels).toHaveBeenCalledOnce();
    expect(state.releaseNetwork).toHaveBeenCalledOnce();
  });

  it("releases target leases after a network error", async () => {
    const pending = begin();
    const rejection = expect(pending).rejects.toThrow("target failed");
    state.error = "target failed";
    state.onState?.();
    await rejection;
    expect(state.releasePixels).toHaveBeenCalledOnce();
    expect(state.releaseNetwork).toHaveBeenCalledOnce();
    expect(state.unsubscribe).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects failed target metadata without leaking the target leases", async () => {
    state.ready = Promise.reject(new Error("missing metadata"));
    await expect(begin()).rejects.toThrow("missing metadata");
    expect(state.releasePixels).toHaveBeenCalledOnce();
    expect(state.releaseNetwork).toHaveBeenCalledOnce();
    expect(state.unsubscribe).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds a target that never becomes ready and releases its subscription", async () => {
    const pending = begin();
    const rejection = expect(pending).rejects.toThrow("rechtzeitig");
    await vi.advanceTimersByTimeAsync(20000);
    await rejection;
    expect(state.releasePixels).toHaveBeenCalledOnce();
    expect(state.unsubscribe).toHaveBeenCalledOnce();
    expect(state.releaseNetwork).toHaveBeenCalledOnce();
  });

  it("does not start target work when the current source is missing or cancelled", async () => {
    await expect(begin(undefined, photo)).rejects.toThrow("aktuelle Bild");
    const off = vi.fn();
    state.peek.mockReturnValue({
      metrics: { visibleReady: false },
      subscribe: () => off,
    });
    const abort = new AbortController();
    const pending = begin(abort.signal, photo);
    const rejection = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    abort.abort();
    await rejection;
    expect(off).toHaveBeenCalledOnce();
    expect(state.acquire).not.toHaveBeenCalled();
    expect(state.networkAcquire).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects an uncovered landing instead of requesting a whole-photo fallback", async () => {
    state.projectedWindow.mockReturnValue(null);
    await expect(begin()).rejects.toThrow("deckt");
    expect(state.sceneRelease).toHaveBeenCalledOnce();
    expect(state.acquire).not.toHaveBeenCalled();
    expect(state.setView).not.toHaveBeenCalled();
  });
});
