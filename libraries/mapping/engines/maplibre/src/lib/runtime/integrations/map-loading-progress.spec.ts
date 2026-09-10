import type { Map as MaplibreMap } from "maplibre-gl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAP_LOADING_PHASE as PHASE } from "../../core/map-loading-progress";
import {
  getMapLoadingProgress,
  publishMapLoadingProgress,
  subscribeMapLoadingProgress,
} from "./map-loading-progress";

afterEach(() => vi.useRealTimers());
describe("map-local loading store", () => {
  it("learns completed phase wall times for the next cycle, not the current one", () => {
    vi.useFakeTimers({ toFake: ["performance", "setTimeout", "clearTimeout"] });
    const map = {} as MaplibreMap;
    publishMapLoadingProgress(map, PHASE.CONTENT, "map", 0);
    publishMapLoadingProgress(map, PHASE.SHADOW, "sun", 0);
    vi.advanceTimersByTime(600);
    publishMapLoadingProgress(map, PHASE.CONTENT, "map", 1);
    expect(getMapLoadingProgress(map).percent).toBe(33);
    vi.advanceTimersByTime(5400);
    publishMapLoadingProgress(map, PHASE.SHADOW, "sun", 1);
    publishMapLoadingProgress(map, PHASE.CONTENT, "map", 0);
    publishMapLoadingProgress(map, PHASE.SHADOW, "sun", 0);
    publishMapLoadingProgress(map, PHASE.CONTENT, "map", 1);
    expect(getMapLoadingProgress(map).percent).toBe(20);
  });
  it("does not learn teardown/cancel completion as faster useful work", () => {
    vi.useFakeTimers({ toFake: ["performance", "setTimeout", "clearTimeout"] });
    const map = {} as MaplibreMap;
    publishMapLoadingProgress(map, PHASE.CONTENT, "map", 0);
    vi.advanceTimersByTime(6000);
    publishMapLoadingProgress(map, PHASE.CONTENT, "map", 1, false);
    publishMapLoadingProgress(map, PHASE.CONTENT, "map", 0);
    publishMapLoadingProgress(map, PHASE.SHADOW, "sun", 0);
    publishMapLoadingProgress(map, PHASE.CONTENT, "map", 1);
    expect(getMapLoadingProgress(map).percent).toBe(33);
  });
  it("coalesces sample/tile updates and releases pending notifications", () => {
    vi.useFakeTimers();
    const map = {} as MaplibreMap;
    const listener = vi.fn();
    const unsubscribe = subscribeMapLoadingProgress(map, listener);
    for (let i = 0; i < 64; i++)
      publishMapLoadingProgress(map, PHASE.SHADOW, "sun", i / 64);
    expect(listener).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getMapLoadingProgress(map).percent).toBe(98);
    publishMapLoadingProgress(map, PHASE.SHADOW, "sun", 1);
    unsubscribe();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("keeps map instances independent and does no work without readers", () => {
    vi.useFakeTimers();
    const first = {} as MaplibreMap;
    const second = {} as MaplibreMap;
    publishMapLoadingProgress(first, PHASE.TERRAIN, "tiles", 0.25);
    expect(getMapLoadingProgress(first).percent).toBe(25);
    expect(getMapLoadingProgress(second).active).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    const snapshot = getMapLoadingProgress(first);
    publishMapLoadingProgress(first, PHASE.TERRAIN, "tiles", 0.251);
    expect(getMapLoadingProgress(first)).toBe(snapshot);
  });
});
