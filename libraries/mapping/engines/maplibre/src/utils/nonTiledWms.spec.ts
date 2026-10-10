import { afterEach, describe, expect, it, vi } from "vitest";
import type { Map as MaplibreMap } from "maplibre-gl";
import {
  attachNonTiledWmsUpdater,
  NON_TILED_METADATA_KEY,
} from "./nonTiledWms";

const setup = (enabled = true) => {
  const callbacks = new Map<string, Set<() => void>>();
  const source = { type: "image", updateImage: vi.fn() };
  const sources = new Map<string, typeof source>([["wms", source]]);
  const layers = new Map<
    string,
    { source: string; metadata: Record<string, unknown> }
  >();
  if (enabled)
    layers.set("wms-layer", {
      source: "wms",
      metadata: {
        [NON_TILED_METADATA_KEY]: {
          url: "https://example.test/wms",
          layers: "labels",
          bufferPx: 0,
        },
      },
    });
  let west = 7;
  const map = {
    getStyle: vi.fn(() => {
      throw new Error("Full style serialization must not run");
    }),
    getLayersOrder: vi.fn(() => [...layers.keys()]),
    getLayer: vi.fn((id: string) => layers.get(id)),
    getSource: vi.fn((id: string) => sources.get(id)),
    getBounds: vi.fn(() => ({
      getWest: () => west,
      getEast: () => west + 0.01,
      getSouth: () => 51,
      getNorth: () => 51.01,
    })),
    getCanvas: () => ({
      clientWidth: 800,
      clientHeight: 600,
      width: 1600,
      height: 1200,
    }),
    on: vi.fn((name: string, callback: () => void) => {
      if (!callbacks.has(name)) callbacks.set(name, new Set());
      callbacks.get(name)!.add(callback);
    }),
    off: vi.fn((name: string, callback: () => void) =>
      callbacks.get(name)?.delete(callback)
    ),
  };
  const emit = (name: string) =>
    callbacks.get(name)?.forEach((callback) => callback());
  const dispose = attachNonTiledWmsUpdater(map as unknown as MaplibreMap);
  return {
    source,
    sources,
    layers,
    map,
    emit,
    dispose,
    move: () => {
      west += 0.001;
    },
  };
};

afterEach(() => vi.useRealTimers());

describe("non-tiled WMS viewport updater", () => {
  it("never serializes the style and keeps maps without WMS layers timer-free", () => {
    vi.useFakeTimers();
    const f = setup(false);
    try {
      for (let i = 0; i < 20; i++) {
        f.emit("moveend");
        f.emit("resize");
      }
      expect(vi.getTimerCount()).toBe(0);
      expect(f.map.getStyle).not.toHaveBeenCalled();
      expect(f.map.getLayersOrder).toHaveBeenCalledOnce();
      expect(f.map.getBounds).not.toHaveBeenCalled();
      expect(f.source.updateImage).not.toHaveBeenCalled();
    } finally {
      f.dispose();
    }
  });

  it("coalesces orbit moveend bursts into one final GetMap after 100ms", () => {
    vi.useFakeTimers();
    const f = setup();
    try {
      expect(f.source.updateImage).toHaveBeenCalledOnce();
      f.source.updateImage.mockClear();
      for (let i = 0; i < 8; i++) {
        f.move();
        f.emit("moveend");
        vi.advanceTimersByTime(25);
        expect(f.source.updateImage).not.toHaveBeenCalled();
      }
      vi.advanceTimersByTime(74);
      expect(f.source.updateImage).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(f.source.updateImage).toHaveBeenCalledOnce();
      const request = f.source.updateImage.mock.calls[0][0] as {
        url: string;
        coordinates: number[][];
      };
      expect(new URL(request.url).searchParams.get("request")).toBe("GetMap");
      expect(request.coordinates[0][0]).toBeCloseTo(7.008, 8);
      expect(f.map.getLayersOrder).toHaveBeenCalledOnce();
      expect(f.map.getStyle).not.toHaveBeenCalled();
    } finally {
      f.dispose();
    }
  });

  it("does not repeat the same request for paint/filter styledata on the same source", () => {
    vi.useFakeTimers();
    const f = setup();
    try {
      for (let i = 0; i < 4; i++) {
        f.emit("styledata");
        vi.advanceTimersByTime(100);
      }
      expect(f.source.updateImage).toHaveBeenCalledOnce();
      expect(f.map.getStyle).not.toHaveBeenCalled();
    } finally {
      f.dispose();
    }
  });

  it("requests the same viewport URL again when the ImageSource identity is replaced", () => {
    vi.useFakeTimers();
    const f = setup();
    try {
      const replacement = { type: "image", updateImage: vi.fn() };
      f.sources.set("wms", replacement);
      f.emit("styledata");
      vi.advanceTimersByTime(100);
      expect(replacement.updateImage).toHaveBeenCalledOnce();
      expect(replacement.updateImage.mock.calls[0][0]).toEqual(
        f.source.updateImage.mock.calls[0][0]
      );
      f.emit("styledata");
      vi.advanceTimersByTime(100);
      expect(replacement.updateImage).toHaveBeenCalledOnce();
    } finally {
      f.dispose();
    }
  });

  it("cancels pending work when the last WMS layer disappears", () => {
    vi.useFakeTimers();
    const f = setup();
    try {
      f.move();
      f.emit("moveend");
      expect(vi.getTimerCount()).toBe(1);
      f.layers.clear();
      f.emit("styledata");
      expect(vi.getTimerCount()).toBe(0);
      vi.advanceTimersByTime(100);
      expect(f.source.updateImage).toHaveBeenCalledOnce();
    } finally {
      f.dispose();
    }
  });

  it("disposes timers and all listeners without a late request", () => {
    vi.useFakeTimers();
    const f = setup();
    f.move();
    f.emit("resize");
    expect(vi.getTimerCount()).toBe(1);
    f.dispose();
    expect(vi.getTimerCount()).toBe(0);
    for (const event of ["moveend", "resize", "styledata"]) f.emit(event);
    vi.advanceTimersByTime(1000);
    expect(f.source.updateImage).toHaveBeenCalledOnce();
    expect(f.map.off.mock.calls.map((call) => call[0]).sort()).toEqual([
      "moveend",
      "resize",
      "styledata",
    ]);
  });
});
