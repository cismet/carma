// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HashStateChangeEvent } from "@carma-providers/hash-state";

const routing = vi.hoisted(() => ({
  listeners: new Set<(event: HashStateChangeEvent) => void>(),
  updateHashState: vi.fn(),
  getHashStateValues: vi.fn(() => ({})),
  getIsLeaflet: () => true,
  getIsTransitioning: () => false,
}));

vi.mock("@carma-providers/hash-state", () => ({
  HASH_CLEAR_STATE_KEY_SET: { LAUNCH_MODE: "launch-mode" },
  useHashState: () => ({
    updateHashState: routing.updateHashState,
    getHashStateValues: routing.getHashStateValues,
    registerOnPopState: (listener: (event: HashStateChangeEvent) => void) => {
      routing.listeners.add(listener);
      return () => routing.listeners.delete(listener);
    },
  }),
}));
vi.mock("@carma-mapping/components", () => ({
  useMapFrameworkSwitcherContext: () => ({
    getIsLeaflet: routing.getIsLeaflet,
    getIsTransitioning: routing.getIsTransitioning,
    activeFramework: "leaflet",
  }),
}));
vi.mock("./useRegisterDefaultMapHashClearStateKeySets", () => ({
  useRegisterDefaultMapHashClearStateKeySets: vi.fn(),
}));

import { useMapHashRouting } from "./useMapHashRouting";

const historicalView = { lat: 51.257, lng: 7.136, zoom: 20.307 };

const mountRouting = () => {
  const map = {
    getCenter: () => ({ lat: 51.26, lng: 7.14 }),
    getBearing: () => 43,
    getPitch: () => 12,
    setView: vi.fn(),
    setBearing: vi.fn(),
    setPitch: vi.fn(),
    once: vi.fn(),
  };
  renderHook(() =>
    useMapHashRouting({
      getLeafletMap: () => map,
      getLeafletZoom: () => 18.3,
    })
  );
  return map;
};

const navigate = (
  changedStateKeys: string[],
  removedStateKeys: string[] = []
) => {
  act(() => {
    for (const listener of routing.listeners) {
      listener({
        source: "popstate",
        hashParams: {},
        stateValues: historicalView,
        changedStateKeys,
        removedStateKeys,
      });
    }
  });
};

describe("map hash camera navigation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
    routing.listeners.clear();
    vi.useRealTimers();
  });

  it.each([
    [[], ["shadowSimulation"]],
    [["shadowDate"], []],
    [[], []],
  ])(
    "does not replay a stale camera for unrelated hash changes %j / %j",
    (changed, removed) => {
      const map = mountRouting();
      navigate(changed, removed);
      expect(map.setView).not.toHaveBeenCalled();
      expect(map.setBearing).not.toHaveBeenCalled();
      expect(map.setPitch).not.toHaveBeenCalled();
      expect(map.once).not.toHaveBeenCalled();
    }
  );

  it.each(["lat", "lng", "zoom", "bearing", "pitch"])(
    "restores the historical camera when %s changes",
    (key) => {
      const map = mountRouting();
      navigate([key]);
      expect(map.setView).toHaveBeenCalledWith(
        { lat: 51.257, lng: 7.136 },
        20.307
      );
      expect(map.setBearing).toHaveBeenCalledWith(0);
      expect(map.setPitch).toHaveBeenCalledWith(0);
    }
  );

  it("restores a flat view when history removes orientation", () => {
    const map = mountRouting();
    navigate([], ["bearing", "pitch"]);
    expect(map.setView).toHaveBeenCalledWith(
      { lat: 51.257, lng: 7.136 },
      20.307
    );
    expect(map.setBearing).toHaveBeenCalledWith(0);
    expect(map.setPitch).toHaveBeenCalledWith(0);
  });
});
