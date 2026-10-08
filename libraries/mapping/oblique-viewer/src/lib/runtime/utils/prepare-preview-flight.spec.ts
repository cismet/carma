import type { Map as MaplibreMap } from "maplibre-gl";
import type { Degrees } from "@carma-units";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ObliqueViewportPhoto } from "./oblique-viewport-source";
import { preparePreviewFlight } from "./prepare-preview-flight";

const state = vi.hoisted(() => ({
  acquire: vi.fn(),
  releaseNetwork: vi.fn(),
  releasePixels: vi.fn(),
  unsubscribe: vi.fn(),
  setView: vi.fn(),
  remember: vi.fn(),
  visibleReady: false,
  ready: Promise.resolve() as Promise<void>,
  onChange: undefined as (() => void) | undefined,
}));
vi.mock("@carma-mapping/engines/maplibre", () => ({
  acquireForegroundNetwork: () => {
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
  nativePreviewSource: () => ({ id: "photo", url: "photo.avif" }),
  nativePixelPool: { acquire: state.acquire },
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
  state.acquire.mockImplementation(() => ({
    release: state.releasePixels,
    stack: {
      ready: state.ready,
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
