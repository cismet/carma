import { describe, expect, it, vi } from "vitest";
import type { Map as MapLibreMap } from "maplibre-gl";
import { createMapViewSyncGroup } from "./map-view-sync";

const fakeMap = (longitude = 7) => {
  const listeners = new Map<string, Set<(event: object) => void>>();
  let state = {
    center: [longitude, 51],
    zoom: 17,
    pitch: 20,
    bearing: 30,
    elevation: 200,
  };
  let fov = 40;
  const emit = (name: string, event = {}) => {
    for (const listener of [...(listeners.get(name) ?? [])]) listener(event);
  };
  const api = {
    getCenter: () => ({ lng: state.center[0], lat: state.center[1] }),
    getZoom: () => state.zoom,
    getPitch: () => state.pitch,
    getBearing: () => state.bearing,
    getCameraTargetElevation: () => state.elevation,
    getVerticalFieldOfView: () => fov,
    setVerticalFieldOfView: vi.fn((value: number) => {
      fov = value;
      emit("move");
    }),
    jumpTo: vi.fn((next: typeof state, event?: object) => {
      state = { ...next, center: [...next.center] };
      emit("move", event);
    }),
    on: (name: string, listener: (event: object) => void) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)?.add(listener);
    },
    off: (name: string, listener: (event: object) => void) => {
      listeners.get(name)?.delete(listener);
    },
  };
  return {
    map: api as unknown as MapLibreMap,
    api,
    emit,
    move: (changes: Partial<typeof state>) => {
      state = { ...state, ...changes };
      emit("move");
    },
    state: () => ({ ...state, fov }),
    listenerCount: () =>
      [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
  };
};

describe("map view sync group", () => {
  it("retains the physical target elevation between 3D viewports", () => {
    const group = createMapViewSyncGroup();
    const a = fakeMap(),
      b = fakeMap();
    group.add(a.map);
    group.add(b.map);
    a.move({ elevation: 325 });
    expect(b.state().elevation).toBe(325);
    expect(b.api.jumpTo.mock.calls[0][0].elevation).toBe(325);
    expect(a.api.jumpTo).not.toHaveBeenCalled();
    group.dispose();
  });
  it("late joiners follow the latest source; either map can lead", () => {
    const group = createMapViewSyncGroup();
    const a = fakeMap(),
      b = fakeMap(8),
      c = fakeMap(9);
    group.add(a.map);
    a.move({ center: [7.2, 51.3], zoom: 18, pitch: 35, bearing: 80 });
    group.add(b.map);
    expect(b.state()).toEqual(a.state());
    b.move({ center: [7.4, 51.5], zoom: 19, pitch: 40, bearing: 100 });
    expect(a.state()).toEqual(b.state());
    group.add(c.map);
    expect(c.state()).toEqual(b.state());
    group.dispose();
  });

  it("syncs FOV and does not reflect synthetic move events", () => {
    const group = createMapViewSyncGroup();
    const a = fakeMap(),
      b = fakeMap();
    group.add(a.map);
    group.add(b.map);
    a.api.setVerticalFieldOfView(12);
    expect(b.state().fov).toBe(12);
    expect(a.api.jumpTo).not.toHaveBeenCalled();
    expect(b.api.jumpTo).toHaveBeenCalledTimes(1);
    const synthetic = b.api.jumpTo.mock.calls[0][1];
    b.emit("move", synthetic);
    b.emit("move");
    b.emit("resize");
    expect(a.api.jumpTo).not.toHaveBeenCalled();
    expect(b.api.jumpTo).toHaveBeenCalledTimes(1);
    group.dispose();
  });

  it("removes maps and all listeners without disposing maps", () => {
    const group = createMapViewSyncGroup();
    const a = fakeMap(),
      b = fakeMap();
    const remove = group.add(a.map);
    group.add(b.map);
    remove();
    remove();
    expect(a.listenerCount()).toBe(0);
    b.move({ zoom: 10 });
    expect(a.state().zoom).toBe(17);
    b.emit("remove");
    expect(b.listenerCount()).toBe(0);
    group.dispose();
    group.dispose();
    expect(() => group.add(fakeMap().map)).toThrow("disposed");
  });

  it("does not change stable targets or accept duplicate registrations", () => {
    const group = createMapViewSyncGroup();
    const a = fakeMap(),
      b = fakeMap();
    group.add(a.map);
    group.add(b.map);
    expect(() => group.add(a.map)).toThrow("already");
    a.emit("move");
    a.emit("resize");
    expect(b.api.jumpTo).not.toHaveBeenCalled();
    group.dispose();
  });
});
