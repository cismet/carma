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

  it("holds a lifecycle-owned pause beyond timed leases and resumes only on release", () => {
    vi.useFakeTimers();
    const dem = createDemManager();
    const { map, listenerCount } = createMap({ dem });
    const release = acquireForegroundNetwork(map, "direct-preview", {
      maxHoldMs: null,
    });
    expect(vi.getTimerCount()).toBe(0);
    const mesh = createRuntime("late-mesh");
    const unregister = registerSharedThreeSceneRuntime(map, mesh.runtime);
    const timed = acquireForegroundNetwork(map, "target-download");
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(60_000);
    expect(getForegroundNetworkReasons(map)).toEqual(["direct-preview"]);
    expect(mesh.setLoadingPaused.mock.calls).toEqual([[true]]);
    expect(dem.resume).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    timed();
    release();
    release();
    expect(isForegroundNetworkHeld(map)).toBe(false);
    expect(mesh.setLoadingPaused.mock.calls).toEqual([[true], [false]]);
    expect(dem.resume).toHaveBeenCalledOnce();
    expect(listenerCount()).toBe(0);
    unregister();
  });

  it("does not resume another lifecycle owner when the first is cancelled", () => {
    vi.useFakeTimers();
    const { map, emit, listenerCount } = createMap();
    const mesh = createRuntime("mesh");
    const unregister = registerSharedThreeSceneRuntime(map, mesh.runtime);
    const first = acquireForegroundNetwork(map, "old-preview", {
      maxHoldMs: null,
    });
    const next = acquireForegroundNetwork(map, "next-preview", {
      maxHoldMs: null,
    });
    first();
    expect(getForegroundNetworkReasons(map)).toEqual(["next-preview"]);
    expect(mesh.setLoadingPaused.mock.calls).toEqual([[true]]);
    emit("remove");
    expect(isForegroundNetworkHeld(map)).toBe(false);
    expect(mesh.setLoadingPaused.mock.calls).toEqual([[true], [false]]);
    expect(listenerCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    next();
    expect(mesh.setLoadingPaused).toHaveBeenCalledTimes(2);
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
  it("keeps bootstrap and native DEM running, pauses ready detail, and resumes lost coverage", () => {
    const dem = createDemManager();
    const { map, emit, listenerCount } = createMap({ dem });
    const mesh = createRuntime("mesh");
    const unknown = createRuntime("unknown");
    let ready = false;
    mesh.runtime.isBaseViewReady = () => ready;
    const unregister = registerSharedThreeSceneRuntime(map, mesh.runtime);
    const unregisterUnknown = registerSharedThreeSceneRuntime(
      map,
      unknown.runtime
    );
    const release = acquireForegroundNetwork(map, "pixels", {
      refinementOnly: true,
    });
    expect(mesh.setLoadingPaused).not.toHaveBeenCalled();
    expect(unknown.setLoadingPaused).not.toHaveBeenCalled();
    expect(dem.pause).not.toHaveBeenCalled();
    ready = true;
    emit("render");
    emit("render");
    expect(mesh.setLoadingPaused.mock.calls).toEqual([[true]]);
    ready = false;
    emit("render");
    expect(mesh.setLoadingPaused.mock.calls).toEqual([[true], [false]]);
    ready = true;
    emit("render");
    release();
    expect(mesh.setLoadingPaused.mock.calls).toEqual([
      [true],
      [false],
      [true],
      [false],
    ]);
    expect(dem.pause).not.toHaveBeenCalled();
    expect(dem.resume).not.toHaveBeenCalled();
    expect(listenerCount()).toBe(0);
    unregister();
    unregisterUnknown();
  });

  it.each([true, false])(
    "restores exact producer admission after the full owner ends (refinement first: %s)",
    (refinementFirst) => {
      const dem = createDemManager();
      const { map, emit } = createMap({ dem });
      const cold = createRuntime("cold");
      const ready = createRuntime("ready");
      cold.runtime.isBaseViewReady = () => false;
      ready.runtime.isBaseViewReady = () => true;
      const unregisterCold = registerSharedThreeSceneRuntime(map, cold.runtime);
      const unregisterReady = registerSharedThreeSceneRuntime(
        map,
        ready.runtime
      );
      const acquireRefinement = () =>
        acquireForegroundNetwork(map, "pixels", { refinementOnly: true });
      let releaseRefinement: () => void;
      let releaseFull: () => void;
      if (refinementFirst) {
        releaseRefinement = acquireRefinement();
        releaseFull = acquireForegroundNetwork(map, "preview");
      } else {
        releaseFull = acquireForegroundNetwork(map, "preview");
        releaseRefinement = acquireRefinement();
      }
      expect(cold.setLoadingPaused.mock.calls).toEqual([[true]]);
      expect(ready.setLoadingPaused.mock.calls).toEqual([[true]]);
      expect(dem.pause).toHaveBeenCalledOnce();
      emit("render");
      releaseFull();
      expect(cold.setLoadingPaused.mock.calls).toEqual([[true], [false]]);
      expect(ready.setLoadingPaused.mock.calls).toEqual([[true]]);
      expect(dem.resume).toHaveBeenCalledOnce();
      emit("styledata");
      expect(dem.pause).toHaveBeenCalledOnce();
      releaseRefinement();
      expect(ready.setLoadingPaused.mock.calls).toEqual([[true], [false]]);
      unregisterCold();
      unregisterReady();
    }
  );

  it("admits late cold receivers and expires refinement ownership after the default four seconds", () => {
    vi.useFakeTimers();
    const { map, emit, listenerCount } = createMap();
    const release = acquireForegroundNetwork(map, "pixels", {
      refinementOnly: true,
    });
    const late = createRuntime("late-lod2");
    let ready = false;
    late.runtime.isBaseViewReady = () => ready;
    const unregister = registerSharedThreeSceneRuntime(map, late.runtime);
    expect(late.setLoadingPaused).not.toHaveBeenCalled();
    ready = true;
    emit("render");
    vi.advanceTimersByTime(3999);
    expect(isForegroundNetworkHeld(map)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(late.setLoadingPaused.mock.calls).toEqual([[true], [false]]);
    expect(isForegroundNetworkHeld(map)).toBe(false);
    expect(listenerCount()).toBe(0);
    release();
    unregister();
  });
});
