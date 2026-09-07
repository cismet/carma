import type { Map as MaplibreMap } from "maplibre-gl";
import { describe, expect, it, vi } from "vitest";
import { MAPLIBRE_EVENT } from "../../../constants/mapEvents";
import { createMapStyleFramebufferCache } from "./map-style-framebuffer-cache";

const fixture = () => {
  const listeners = new Map<string, Set<() => void>>();
  const map = {
    on: (event: string, handler: () => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler);
    },
    off: (event: string, handler: () => void) =>
      listeners.get(event)?.delete(handler),
    getStyle: vi.fn(
      (): {
        sources: Record<string, { type: string }>;
        layers: Array<Record<string, unknown>>;
      } => ({
        sources: { dem: { type: "raster-dem" } },
        layers: [
          { id: "background", type: "background" },
          { id: "terrain", type: "custom" },
        ],
      })
    ),
    listImages: () => ["icon"],
    getLayersOrder: vi.fn(() => ["background", "terrain"]),
    getLayer: vi.fn((id: string) => ({
      type: id === "terrain" ? "custom" : "background",
    })),
    getImage: vi.fn(
      (): {
        version: number;
        userImage?: { render: () => boolean };
      } => ({ version: 0 })
    ),
    triggerRepaint: vi.fn(),
    loaded: vi.fn(() => true),
    isMoving: vi.fn(() => false),
  };
  const cache = createMapStyleFramebufferCache(
    map as unknown as MaplibreMap,
    "terrain"
  );
  const emit = (event: string) =>
    listeners.get(event)?.forEach((handler) => handler());
  return { cache, map, emit, listeners };
};

describe("MapLibre ground capture reuse", () => {
  it("keeps copying until idle, then shares one capture across 128 sun samples", () => {
    const { cache, emit, map } = fixture();
    cache.captured("pose");
    expect(cache.canReuse("pose", true)).toBe(false);
    emit(MAPLIBRE_EVENT.IDLE);
    expect(cache.canReuse("pose", true)).toBe(false);
    cache.captured("pose");
    for (let i = 0; i < 128; i++) {
      expect(cache.canReuse("pose", true)).toBe(true);
      emit(MAPLIBRE_EVENT.IDLE);
    }
    expect(cache.stats).toEqual({ captures: 2, reuses: 128 });
    expect(map.getStyle).toHaveBeenCalledTimes(1);
    expect(map.triggerRepaint).toHaveBeenCalledTimes(1);
    expect(cache.canReuse("pose", false)).toBe(false);
  });

  it.each([
    MAPLIBRE_EVENT.SOURCE_DATA,
    MAPLIBRE_EVENT.SOURCE_DATA_LOADING,
    MAPLIBRE_EVENT.TERRAIN,
    MAPLIBRE_EVENT.STYLE_DATA,
    MAPLIBRE_EVENT.STYLE_DATA_LOADING,
    MAPLIBRE_EVENT.STYLE_LOAD,
    MAPLIBRE_EVENT.MOVE,
    MAPLIBRE_EVENT.RESIZE,
    MAPLIBRE_EVENT.WEBGL_CONTEXT_LOST,
    MAPLIBRE_EVENT.WEBGL_CONTEXT_RESTORED,
  ])("invalidates ground and requires a fresh capture after %s", (event) => {
    const { cache, emit } = fixture();
    cache.captured("pose");
    emit(MAPLIBRE_EVENT.IDLE);
    emit(event);
    expect(cache.canReuse("pose", true)).toBe(false);
    emit(MAPLIBRE_EVENT.IDLE);
    expect(cache.canReuse("pose", true)).toBe(false);
    cache.captured("pose");
    expect(cache.canReuse("pose", true)).toBe(true);
  });

  it("requires exact camera/viewport registration and no pending move/source work", () => {
    const { cache, emit, map } = fixture();
    cache.captured("camera|1280,720");
    emit(MAPLIBRE_EVENT.IDLE);
    expect(cache.canReuse("camera|1280,721", true)).toBe(false);
    map.isMoving.mockReturnValue(true);
    expect(cache.canReuse("camera|1280,720", true)).toBe(false);
    map.isMoving.mockReturnValue(false);
    map.loaded.mockReturnValue(false);
    expect(cache.canReuse("camera|1280,720", true)).toBe(false);
  });

  it.each(["canvas", "video"])("never caches an animated %s source", (type) => {
    const { cache, emit, map } = fixture();
    map.getStyle.mockReturnValue({
      sources: { dem: { type } },
      layers: [{ id: "terrain", type: "custom" }],
    });
    cache.captured("pose");
    emit(MAPLIBRE_EVENT.IDLE);
    expect(cache.canReuse("pose", true)).toBe(false);
  });

  it("never caches an earlier custom pass or animated sprite", () => {
    const { cache, emit, map } = fixture();
    cache.captured("pose");
    map.getStyle.mockReturnValue({
      sources: {},
      layers: [
        { id: "animated", type: "custom" },
        { id: "terrain", type: "custom" },
      ],
    });
    map.getLayersOrder.mockReturnValue(["animated", "terrain"]);
    map.getLayer.mockReturnValue({ type: "custom" });
    emit(MAPLIBRE_EVENT.IDLE);
    expect(cache.canReuse("pose", true)).toBe(false);
    map.getStyle.mockReturnValue({
      sources: {},
      layers: [{ id: "terrain", type: "custom" }],
    });
    map.getLayersOrder.mockReturnValue(["terrain"]);
    map.getImage.mockReturnValue({
      version: 0,
      userImage: { render: () => true },
    });
    emit(MAPLIBRE_EVENT.STYLE_DATA);
    cache.captured("pose");
    emit(MAPLIBRE_EVENT.IDLE);
    expect(cache.canReuse("pose", true)).toBe(false);
  });

  it("releases all listeners on removal", () => {
    const { cache, listeners } = fixture();
    cache.dispose();
    expect(
      [...listeners.values()].every((handlers) => handlers.size === 0)
    ).toBe(true);
  });

  it("uses public layer order when getStyle omits custom receivers", () => {
    const { cache, emit, map } = fixture();
    map.getStyle.mockReturnValue({
      sources: {},
      layers: [{ id: "background", type: "background" }],
    });
    emit(MAPLIBRE_EVENT.IDLE);
    cache.captured("pose");
    expect(cache.canReuse("pose", true)).toBe(true);
  });

  it("invalidates eventless updateImage calls before reporting its revision", () => {
    const { cache, emit, map } = fixture();
    emit(MAPLIBRE_EVENT.IDLE);
    cache.captured("pose");
    const revision = cache.revision;
    map.getImage.mockReturnValue({ version: 1 });
    expect(cache.revision).toBeGreaterThan(revision);
    expect(cache.canReuse("pose", true)).toBe(false);
    emit(MAPLIBRE_EVENT.IDLE);
    cache.captured("pose");
    expect(cache.canReuse("pose", true)).toBe(true);
  });

  it("preserves eventless feature-state highlighting through the fallback", () => {
    const { cache, emit, map } = fixture();
    map.getStyle.mockReturnValue({
      sources: {},
      layers: [
        {
          id: "fill",
          type: "fill",
          paint: {
            "fill-opacity": [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              1,
              0.5,
            ],
          },
        },
      ],
    });
    emit(MAPLIBRE_EVENT.IDLE);
    cache.captured("pose");
    expect(cache.canReuse("pose", true)).toBe(false);
  });
});
