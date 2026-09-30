import { afterEach, describe, expect, it, vi } from "vitest";

import { observeMapVectorPoints } from "./map-vector-point-source";

type Listener = (event: {
  sourceId?: string;
  isSourceLoaded?: boolean;
}) => void;

const createMap = () => {
  const listeners = new Set<Listener>();
  const sources = new Map<string, unknown>();
  const layers = new Map<string, unknown>();
  const queried = new Map<string, unknown[]>();
  return {
    listeners,
    sources,
    layers,
    queried,
    on: vi.fn((_event: string, listener: Listener) => listeners.add(listener)),
    off: vi.fn((_event: string, listener: Listener) =>
      listeners.delete(listener)
    ),
    addSource: vi.fn((id: string, source: unknown) => sources.set(id, source)),
    removeSource: vi.fn((id: string) => sources.delete(id)),
    getSource: vi.fn((id: string) => sources.get(id)),
    addLayer: vi.fn((layer: { id: string }) => layers.set(layer.id, layer)),
    removeLayer: vi.fn((id: string) => layers.delete(id)),
    getLayer: vi.fn((id: string) => layers.get(id)),
    querySourceFeatures: vi.fn(
      (id: string, options?: { sourceLayer?: string }) =>
        options?.sourceLayer === "lamp-alt" ? [] : queried.get(id) ?? []
    ),
  };
};

const style = {
  version: 8,
  sources: {
    lights: { type: "vector", tiles: ["tiles/{z}/{x}/{y}.pbf"] },
  },
  layers: [
    {
      id: "lights-symbols",
      type: "symbol",
      source: "lights",
      "source-layer": "lamp",
      filter: ["==", "kind", "lamp"],
    },
    {
      id: "lights-circles",
      type: "circle",
      source: "lights",
      "source-layer": "lamp",
    },
    {
      id: "lights-alt",
      type: "circle",
      source: "lights",
      "source-layer": "lamp-alt",
    },
  ],
};

afterEach(() => vi.restoreAllMocks());

describe("observeMapVectorPoints", () => {
  it("loads vector sources once per source layer, resolves tiles, and preserves filters", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: () => Promise.resolve(style) })
    );
    const map = createMap();
    const onPoints = vi.fn();
    const dispose = observeMapVectorPoints(
      map as never,
      "https://example.test/styles/main.json",
      {
        idPrefix: "test-points",
        center: [7, 51],
        radiusMeters: 1000,
        limit: 10,
        onPoints,
        onError: vi.fn(),
      }
    );
    await vi.waitFor(() => expect(map.addSource).toHaveBeenCalledTimes(1));
    expect(map.addSource.mock.calls[0][1]).toMatchObject({
      tiles: ["https://example.test/styles/tiles/{z}/{x}/{y}.pbf"],
    });
    expect(map.addLayer.mock.calls[0][0]).toMatchObject({
      filter: ["==", "kind", "lamp"],
      paint: { "circle-opacity": 0 },
    });
    dispose();
  });

  it("filters by radius, deduplicates tiled features, sorts nearest, and limits", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: () => Promise.resolve(style) })
    );
    const map = createMap();
    const onPoints = vi.fn();
    observeMapVectorPoints(map as never, "https://example.test/style.json", {
      idPrefix: "points",
      center: [7, 51],
      radiusMeters: 1000,
      limit: 2,
      onPoints,
      onError: vi.fn(),
    });
    await vi.waitFor(() => expect(map.addSource).toHaveBeenCalled());
    const sourceId = map.addSource.mock.calls[0][0] as string;
    map.queried.set(sourceId, [
      {
        id: "far",
        geometry: { type: "Point", coordinates: [7.02, 51] },
        properties: {},
      },
      {
        id: "near",
        geometry: { type: "Point", coordinates: [7.001, 51] },
        properties: { a: 1 },
      },
      {
        id: "near",
        geometry: { type: "Point", coordinates: [7.001, 51] },
        properties: { a: 1 },
      },
      {
        id: "multi",
        geometry: {
          type: "MultiPoint",
          coordinates: [
            [7.002, 51],
            [7.003, 51],
          ],
        },
        properties: {},
      },
    ]);
    [...map.listeners].forEach((listener) =>
      listener({ sourceId, isSourceLoaded: true })
    );
    expect(onPoints).toHaveBeenLastCalledWith([
      expect.objectContaining({
        id: "lamp:near:7.001,51",
        lngLat: [7.001, 51],
      }),
      expect.objectContaining({
        id: "lamp:multi:7.002,51",
        lngLat: [7.002, 51],
      }),
    ]);
    const callCount = onPoints.mock.calls.length;
    const queryCount = map.querySourceFeatures.mock.calls.length;
    [...map.listeners].forEach((listener) =>
      listener({ sourceId, isSourceLoaded: true })
    );
    expect(onPoints).toHaveBeenCalledTimes(callCount);
    expect(map.querySourceFeatures).toHaveBeenCalledTimes(queryCount + 2);
  });

  it("retains valid points when a later source snapshot is empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: () => Promise.resolve(style) })
    );
    const map = createMap();
    const onPoints = vi.fn();
    const dispose = observeMapVectorPoints(
      map as never,
      "https://example.test/style.json",
      {
        idPrefix: "lease",
        center: [7, 51],
        radiusMeters: 1000,
        limit: 10,
        onPoints,
        onError: vi.fn(),
      }
    );
    await vi.waitFor(() => expect(map.addSource).toHaveBeenCalled());
    const sourceId = map.addSource.mock.calls[0][0] as string;
    map.queried.set(sourceId, [
      {
        id: "kept",
        geometry: { type: "Point", coordinates: [7.001, 51] },
        properties: {},
      },
    ]);
    [...map.listeners].forEach((listener) =>
      listener({ sourceId, isSourceLoaded: true })
    );
    map.queried.set(sourceId, []);
    [...map.listeners].forEach((listener) =>
      listener({ sourceId, isSourceLoaded: true })
    );
    expect(onPoints).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: "lamp:kept:7.001,51" }),
    ]);
    dispose();
  });

  it("does not throw when disposed after the map style is gone", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: () => Promise.resolve(style) })
    );
    const map = createMap();
    (map as unknown as { getStyle: () => undefined }).getStyle = () =>
      undefined;
    const dispose = observeMapVectorPoints(
      map as never,
      "https://example.test/style.json",
      {
        idPrefix: "removed",
        center: [7, 51],
        radiusMeters: 1,
        limit: 1,
        onPoints: vi.fn(),
        onError: vi.fn(),
      }
    );
    dispose();
    expect(map.removeLayer).not.toHaveBeenCalled();
  });

  it("owns cleanup and ignores a late style response", async () => {
    let resolveFetch!: (value: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
      )
    );
    const map = createMap();
    const onError = vi.fn();
    const dispose = observeMapVectorPoints(
      map as never,
      "https://example.test/style.json",
      {
        idPrefix: "late",
        center: [7, 51],
        radiusMeters: 10,
        limit: 1,
        onPoints: vi.fn(),
        onError,
      }
    );
    dispose();
    resolveFetch({ ok: true, json: () => Promise.resolve(style) });
    await Promise.resolve();
    await Promise.resolve();
    expect(map.addSource).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(map.off).toHaveBeenCalledTimes(1);
  });
});
