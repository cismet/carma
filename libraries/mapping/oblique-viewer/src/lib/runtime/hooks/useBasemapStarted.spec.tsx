import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Map as MaplibreMap } from "maplibre-gl";
import { useBasemapStarted } from "./useBasemapStarted";

const scene = vi.hoisted(() => ({
  runtimes: [] as object[],
  listeners: new Set<() => void>(),
  unsubscribe: vi.fn(),
}));
vi.mock("@carma-mapping/engines/maplibre", () => ({
  getSharedThreeSceneRuntimes: () => scene.runtimes,
  subscribeSharedThreeSceneContent: (_map: unknown, listener: () => void) => {
    scene.listeners.add(listener);
    return () => {
      scene.listeners.delete(listener);
      scene.unsubscribe();
    };
  },
}));
let nextFrame = 0;
const frames = new Map<number, FrameRequestCallback>();
const paint = () =>
  act(() => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(0));
  });
const setup = (warm = false, requireScene = false) => {
  let usable = true;
  let sourceWarm = warm;
  const listeners = new Map<
    string,
    Set<(event?: { sourceId?: string }) => void>
  >();
  const map = {
    getStyle: () =>
      usable
        ? {
            sources: {
              base: { type: "raster" },
              "carma-oblique-footprint-outline-source": { type: "geojson" },
            },
            layers: [{ id: "base", source: "base" }],
          }
        : undefined,
    isStyleLoaded: () => false,
    getSource: () => ({ loaded: () => sourceWarm }),
    isSourceLoaded: () => false,
    areTilesLoaded: vi.fn(() => false),
    triggerRepaint: vi.fn(),
    on: vi.fn(
      (type: string, listener: (event?: { sourceId?: string }) => void) => {
        const handlers = listeners.get(type) ?? new Set();
        handlers.add(listener);
        listeners.set(type, handlers);
      }
    ),
    off: vi.fn(
      (type: string, listener: (event?: { sourceId?: string }) => void) =>
        listeners.get(type)?.delete(listener)
    ),
  };
  const emit = (type: string, event?: { sourceId?: string }) =>
    act(() => listeners.get(type)?.forEach((listener) => listener(event)));
  const props = {
    map: map as unknown as MaplibreMap,
    enabled: true,
    requireScene,
  };
  const view = renderHook(
    ({ map, enabled, requireScene }) =>
      useBasemapStarted(map, enabled, requireScene),
    { initialProps: props }
  );
  return {
    ...view,
    props,
    map,
    emit,
    listeners,
    setUsable: (value: boolean) => {
      usable = value;
    },
    setWarm: (value: boolean) => {
      sourceWarm = value;
    },
  };
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  scene.runtimes = [];
  scene.listeners.clear();
  frames.clear();
  nextFrame = 0;
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      const id = ++nextFrame;
      frames.set(id, callback);
      return id;
    })
  );
  vi.stubGlobal(
    "cancelAnimationFrame",
    vi.fn((id: number) => frames.delete(id))
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("basemap networking and first paint gate", () => {
  it("waits for a render after source loading and leaves a paint opportunity before releasing ingest", () => {
    const view = setup();
    view.emit("render");
    paint();
    expect(view.result.current).toBe(false);
    view.emit("sourcedataloading", { sourceId: "base" });
    expect(view.result.current).toBe(false);
    view.emit("render");
    paint();
    expect(view.result.current).toBe(false);
    paint();
    expect(view.result.current).toBe(true);
    expect(scene.unsubscribe).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("ignores footprint sources and releases on actual shared terrain/mesh registration", () => {
    const view = setup();
    view.emit("sourcedataloading", {
      sourceId: "carma-oblique-footprint-outline-source",
    });
    view.emit("render");
    paint();
    paint();
    expect(view.result.current).toBe(false);
    scene.runtimes = [{ providesTerrain: true }];
    act(() => scene.listeners.forEach((listener) => listener()));
    view.emit("render");
    paint();
    paint();
    expect(view.result.current).toBe(true);
    expect(view.map.areTilesLoaded).not.toHaveBeenCalled();
  });
  it("detects an already warm source before all viewport tiles are loaded", () => {
    const view = setup(true);
    expect(view.map.triggerRepaint).toHaveBeenCalledOnce();
    expect(view.result.current).toBe(false);
    view.emit("render");
    paint();
    paint();
    expect(view.result.current).toBe(true);
    expect(view.map.areTilesLoaded).not.toHaveBeenCalled();
  });
  it("uses one bounded fallback for a usable style without a network-start notification", () => {
    const view = setup();
    view.emit("render");
    act(() => vi.advanceTimersByTime(12000));
    expect(view.result.current).toBe(false);
    expect(view.map.triggerRepaint).toHaveBeenCalledOnce();
    view.emit("render");
    paint();
    paint();
    expect(view.result.current).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("keeps a failed/unusable style gated until a later usable style event, without polling", () => {
    const view = setup();
    view.setUsable(false);
    act(() => vi.advanceTimersByTime(12000));
    expect(view.result.current).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    view.setUsable(true);
    view.emit("styledata");
    view.emit("render");
    paint();
    paint();
    expect(view.result.current).toBe(true);
  });
  it("cancels queued paints, subscriptions and fallback when disabled or unmounted", () => {
    const view = setup();
    view.emit("sourcedataloading", { sourceId: "base" });
    view.emit("render");
    expect(frames.size).toBe(1);
    view.rerender({ ...view.props, enabled: false });
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    paint();
    expect(view.result.current).toBe(false);
    view.setWarm(true);
    view.rerender(view.props);
    view.emit("render");
    paint();
    view.unmount();
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(scene.listeners.size).toBe(0);
  });
  it("gives the expected 3D basemap priority over warm sources and label networking", () => {
    const view = setup(true, true);
    view.emit("sourcedataloading", { sourceId: "base" });
    view.emit("styledata");
    view.emit("render");
    paint();
    paint();
    act(() => vi.advanceTimersByTime(2000));
    expect(view.result.current).toBe(false);
    expect(view.map.triggerRepaint).not.toHaveBeenCalled();
    scene.runtimes = [{ receivesMapStyleTexture: true }];
    act(() => scene.listeners.forEach((listener) => listener()));
    expect(view.result.current).toBe(false);
    view.emit("render");
    paint();
    expect(view.result.current).toBe(false);
    paint();
    expect(view.result.current).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("releases a failed expected basemap once after twelve seconds and a usable painted frame", () => {
    const view = setup(true, true);
    act(() => vi.advanceTimersByTime(11999));
    view.emit("render");
    paint();
    paint();
    expect(view.result.current).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(view.map.triggerRepaint).toHaveBeenCalledOnce();
    expect(view.result.current).toBe(false);
    view.emit("render");
    paint();
    paint();
    expect(view.result.current).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("accepts a concrete basemap source failure but ignores unrelated and footprint errors", () => {
    const view = setup(false, true);
    view.emit("error", { sourceId: "carma-oblique-footprint-outline-source" });
    view.emit("error", { sourceId: "unknown" });
    view.emit("render");
    paint();
    paint();
    expect(view.result.current).toBe(false);
    view.emit("error", { sourceId: "base" });
    view.emit("render");
    paint();
    paint();
    expect(view.result.current).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
