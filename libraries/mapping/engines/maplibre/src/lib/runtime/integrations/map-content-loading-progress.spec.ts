import type { Map as MaplibreMap, MapSourceDataEvent } from "maplibre-gl";
import { describe, expect, it, vi } from "vitest";
import { MAPLIBRE_EVENT as EVENT } from "../../../constants/mapEvents";
import { getMapLoadingProgress } from "./map-loading-progress";
import { trackMapContentLoadingProgress } from "./map-content-loading-progress";

const fixture = () => {
  const listeners = new Map<string, Set<(event: MapSourceDataEvent) => void>>();
  const map = {
    on: (name: string, listener: (event: MapSourceDataEvent) => void) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(listener);
    },
    off: (name: string, listener: (event: MapSourceDataEvent) => void) =>
      listeners.get(name)?.delete(listener),
    loaded: vi.fn(() => false),
    isStyleLoaded: vi.fn(() => true),
    getSource: vi.fn(() => ({})),
    isSourceLoaded: vi.fn(() => false),
  };
  const handle = map as unknown as MaplibreMap;
  const dispose = trackMapContentLoadingProgress(handle);
  const emit = (name: string, event = {}) =>
    listeners.get(name)?.forEach((fn) => fn(event as MapSourceDataEvent));
  return { map, handle, dispose, emit, listeners };
};
describe("MapLibre public loading events", () => {
  it("includes source loading and final placement/fades, then hides on idle", () => {
    const { handle, emit, dispose } = fixture();
    expect(getMapLoadingProgress(handle).active).toBe(true);
    emit(EVENT.SOURCE_DATA_LOADING, { sourceId: "roads" });
    emit(EVENT.SOURCE_DATA_LOADING, { sourceId: "land" });
    emit(EVENT.SOURCE_DATA, { sourceId: "roads", isSourceLoaded: true });
    expect(getMapLoadingProgress(handle).percent).toBe(33);
    emit(EVENT.SOURCE_DATA, { sourceId: "land", isSourceLoaded: true });
    expect(getMapLoadingProgress(handle).percent).toBe(67);
    emit(EVENT.IDLE);
    expect(getMapLoadingProgress(handle)).toMatchObject({
      active: false,
      percent: 100,
    });
    emit(EVENT.SOURCE_DATA_LOADING, { sourceId: "roads" });
    expect(getMapLoadingProgress(handle).percent).toBe(0);
    dispose();
  });
  it("settles aborted/failed loads and removes all listeners on unmount", () => {
    const { map, handle, emit, dispose, listeners } = fixture();
    emit(EVENT.SOURCE_DATA_LOADING, { sourceId: "roads" });
    emit(EVENT.SOURCE_DATA_ABORT, { sourceId: "roads", isSourceLoaded: true });
    expect(getMapLoadingProgress(handle).percent).toBe(50);
    map.isStyleLoaded.mockReturnValue(false);
    emit(EVENT.ERROR);
    expect(getMapLoadingProgress(handle).active).toBe(false);
    emit(EVENT.STYLE_DATA_LOADING);
    dispose();
    expect(getMapLoadingProgress(handle).active).toBe(false);
    expect([...listeners.values()].every((set) => set.size === 0)).toBe(true);
  });
});
