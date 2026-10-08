// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

import type { SharedThreeSceneRuntime } from "../../core/shared-three-scene-types";
import {
  acquireForegroundNetwork,
  getForegroundNetworkReasons,
  isForegroundNetworkHeld,
  subscribeForegroundNetwork,
} from "./foreground-network-lease";
import { registerSharedThreeSceneRuntime } from "./shared-three-scene-content-registry";

const createDemManager = () => {
  const manager = {
    _paused: false,
    pause: vi.fn(() => {
      manager._paused = true;
    }),
    resume: vi.fn(() => {
      manager._paused = false;
    }),
    getSource: () => ({ type: "raster-dem" }),
  };
  return manager;
};

const createMap = (tileManagers: Record<string, unknown> = {}) => {
  const listeners = new Map<string, Set<(event: object) => void>>();
  const map = {
    style: { tileManagers },
    on: vi.fn((name: string, handler: (event: object) => void) => {
      const handlers = listeners.get(name) ?? new Set();
      handlers.add(handler);
      listeners.set(name, handlers);
    }),
    off: vi.fn((name: string, handler: (event: object) => void) => {
      listeners.get(name)?.delete(handler);
    }),
  };
  return {
    map: map as never,
    listenerCount: () =>
      [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
    emit(name: string, event: object = {}) {
      for (const listener of [...(listeners.get(name) ?? [])]) listener(event);
    },
  };
};

const createRuntime = (id: string) => {
  const setLoadingPaused = vi.fn();
  return {
    runtime: { id, setLoadingPaused } as unknown as SharedThreeSceneRuntime,
    setLoadingPaused,
  };
};

afterEach(() => {
  vi.useRealTimers();
});

describe("foreground network lease", () => {
  it("pauses producers once and resumes them after the last release", () => {
    const { map } = createMap();
    const mesh = createRuntime("mesh");
    const unregister = registerSharedThreeSceneRuntime(map, mesh.runtime);
    const changes = vi.fn();
    subscribeForegroundNetwork(map, changes);
    const first = acquireForegroundNetwork(map, "preview");
    const second = acquireForegroundNetwork(map, "transition");
    expect(mesh.setLoadingPaused.mock.calls).toEqual([[true]]);
    expect(isForegroundNetworkHeld(map)).toBe(true);
    expect(getForegroundNetworkReasons(map)).toEqual(["preview", "transition"]);
    first();
    first();
    expect(isForegroundNetworkHeld(map)).toBe(true);
    expect(mesh.setLoadingPaused.mock.calls).toEqual([[true]]);
    second();
    expect(mesh.setLoadingPaused.mock.calls).toEqual([[true], [false]]);
    expect(isForegroundNetworkHeld(map)).toBe(false);
    expect(changes).toHaveBeenCalledTimes(2);
    unregister();
  });

  it("pauses runtimes registered while held and leaves runtimes without the hook alone", () => {
    const { map, listenerCount } = createMap();
    const release = acquireForegroundNetwork(map, "preview");
    const late = createRuntime("terrain");
    const unregisterLate = registerSharedThreeSceneRuntime(map, late.runtime);
    const unregisterPlain = registerSharedThreeSceneRuntime(map, {
      id: "plain",
    } as unknown as SharedThreeSceneRuntime);
    expect(late.setLoadingPaused.mock.calls).toEqual([[true]]);
    release();
    expect(late.setLoadingPaused.mock.calls).toEqual([[true], [false]]);
    // A fresh acquisition after the last release starts from scratch.
    const again = acquireForegroundNetwork(map, "preview");
    expect(late.setLoadingPaused.mock.calls).toEqual([[true], [false], [true]]);
    again();
    expect(listenerCount()).toBe(0);
    unregisterLate();
    unregisterPlain();
  });

  it("releases an acquisition at its cap without touching later ones", () => {
    vi.useFakeTimers();
    const { map } = createMap();
    const mesh = createRuntime("mesh");
    const unregister = registerSharedThreeSceneRuntime(map, mesh.runtime);
    const stuck = acquireForegroundNetwork(map, "stuck", { maxHoldMs: 1000 });
    vi.advanceTimersByTime(600);
    const fresh = acquireForegroundNetwork(map, "fresh", { maxHoldMs: 1000 });
    vi.advanceTimersByTime(400);
    expect(getForegroundNetworkReasons(map)).toEqual(["fresh"]);
    expect(mesh.setLoadingPaused.mock.calls).toEqual([[true]]);
    vi.advanceTimersByTime(600);
    expect(isForegroundNetworkHeld(map)).toBe(false);
    expect(mesh.setLoadingPaused.mock.calls).toEqual([[true], [false]]);
    // Releasing after the cap is a no-op, also for a newer hold.
    const next = acquireForegroundNetwork(map, "next");
    stuck();
    fresh();
    expect(isForegroundNetworkHeld(map)).toBe(true);
    next();
    unregister();
  });

  it("pauses native DEM demand, including sources added while held", () => {
    const dem = createDemManager();
    const managers: Record<string, unknown> = {
      dem,
      basemap: {
        getSource: () => ({ type: "raster" }),
        pause: vi.fn(),
        resume: vi.fn(),
      },
    };
    const { map, emit } = createMap(managers);
    const release = acquireForegroundNetwork(map, "preview");
    expect(dem.pause).toHaveBeenCalledOnce();
    const later = createDemManager();
    managers.later = later;
    emit("styledata");
    expect(later.pause).toHaveBeenCalledOnce();
    expect(
      (managers.basemap as { pause: () => void }).pause
    ).not.toHaveBeenCalled();
    release();
    expect(dem.resume).toHaveBeenCalledOnce();
    expect(later.resume).toHaveBeenCalledOnce();
  });

  it("composes with another holder of the same DEM pause", async () => {
    const { acquireMapLibreTerrainDemandPause } = await import(
      "./maplibre-terrain-demand"
    );
    const dem = createDemManager();
    const { map } = createMap({ dem });
    const preview = acquireMapLibreTerrainDemandPause(map, "dem");
    const release = acquireForegroundNetwork(map, "preview");
    release();
    expect(dem.resume).not.toHaveBeenCalled();
    preview();
    expect(dem.resume).toHaveBeenCalledOnce();
  });

  it("ends every acquisition when the map is removed", () => {
    const { map, emit, listenerCount } = createMap();
    const mesh = createRuntime("mesh");
    const unregister = registerSharedThreeSceneRuntime(map, mesh.runtime);
    const release = acquireForegroundNetwork(map, "preview");
    emit("remove");
    expect(isForegroundNetworkHeld(map)).toBe(false);
    expect(mesh.setLoadingPaused.mock.calls).toEqual([[true], [false]]);
    expect(listenerCount()).toBe(0);
    release();
    expect(mesh.setLoadingPaused).toHaveBeenCalledTimes(2);
    unregister();
  });
  it("resumes a detached runtime without releasing the map's remaining producers", () => {
    const { map } = createMap();
    const detached = createRuntime("detached");
    const remaining = createRuntime("remaining");
    const unregister = registerSharedThreeSceneRuntime(map, detached.runtime);
    const unregisterRemaining = registerSharedThreeSceneRuntime(
      map,
      remaining.runtime
    );
    const release = acquireForegroundNetwork(map, "preview");
    unregister();
    expect(detached.setLoadingPaused.mock.calls).toEqual([[true], [false]]);
    expect(remaining.setLoadingPaused.mock.calls).toEqual([[true]]);
    release();
    expect(detached.setLoadingPaused).toHaveBeenCalledTimes(2);
    expect(remaining.setLoadingPaused.mock.calls).toEqual([[true], [false]]);
    unregisterRemaining();
  });

  it("clears every pending deadline on map removal", () => {
    vi.useFakeTimers();
    const { map, emit } = createMap();
    acquireForegroundNetwork(map, "first");
    acquireForegroundNetwork(map, "second");
    expect(vi.getTimerCount()).toBe(2);
    emit("remove");
    expect(vi.getTimerCount()).toBe(0);
  });
});
