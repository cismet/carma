import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LayerSpecification, Map as MaplibreMap } from "maplibre-gl";
import type { FeatureCollection, Position } from "geojson";
import type { ObliquePose } from "../core/types";
import { createFootprintOutlineLayer } from "./footprint-outline-layer";

vi.mock("maplibre-gl", async () => {
  const { MercatorCoordinate } = await import(
    "maplibre-gl/src/geo/mercator_coordinate"
  );
  return { MercatorCoordinate };
});
const scene = vi.hoisted(() => ({
  runtimes: [] as object[],
  release: vi.fn(),
  surface: vi.fn(),
}));
vi.mock("@carma-mapping/engines/maplibre", () => ({
  getSharedThreeSceneRuntimes: () => scene.runtimes,
  acquireSharedThreeScene: () => ({
    layer: { id: "shared", setMapStyleSurfaceOverlay: scene.surface },
    release: scene.release,
  }),
}));
const ring: Position[] = [
  [0, 0],
  [0.002, 0],
  [0.002, -0.002],
  [0, -0.002],
  [0, 0],
];
const pose = { direction: [0, 0, -1], up: [0, 1, 0] } as ObliquePose;
const drawSurfaceLabel = vi.fn();
const setup = (mesh = false) => {
  scene.runtimes = mesh ? [{ id: "mesh" }] : [];
  const layers = new Map<string, LayerSpecification>();
  const images = new Map<string, ImageData>();
  const sources = new Map<
    string,
    { data: FeatureCollection; setData: (next: FeatureCollection) => void }
  >();
  const listeners = new Map<string, Set<() => void>>();
  let order = mesh ? ["shared"] : [];
  const fire = (event: string) =>
    listeners.get(event)?.forEach((listener) => listener());
  const map = {
    getSource: (id: string) => sources.get(id),
    addSource: vi.fn((id: string, source: { data: FeatureCollection }) => {
      const value = {
        data: source.data,
        setData: vi.fn((next: FeatureCollection) => {
          value.data = next;
        }),
      };
      sources.set(id, value);
    }),
    removeSource: vi.fn((id: string) => sources.delete(id)),
    getLayer: (id: string) => layers.get(id),
    addLayer: vi.fn((layer: LayerSpecification) => {
      layers.set(layer.id, layer);
      order.push(layer.id);
      fire("styledata");
    }),
    removeLayer: vi.fn((id: string) => {
      layers.delete(id);
      order = order.filter((value) => value !== id);
    }),
    getLayersOrder: () => order,
    moveLayer: vi.fn((id: string, before: string) => {
      order = order.filter((value) => value !== id);
      order.splice(order.indexOf(before), 0, id);
      fire("styledata");
    }),
    setPaintProperty: vi.fn(),
    setLayoutProperty: vi.fn(),
    queryTerrainElevation: vi.fn(),
    triggerRepaint: vi.fn(),
    getZoom: () => 17,
    queryRenderedFeatures: vi.fn(
      (): Array<{ id?: string; properties?: Record<string, unknown> }> => [
        { id: "footprint", properties: { revision: 1 } },
      ]
    ),
    hasImage: (id: string) => images.has(id),
    addImage: vi.fn((id: string, image: ImageData) => images.set(id, image)),
    updateImage: vi.fn((id: string, image: ImageData) => images.set(id, image)),
    removeImage: vi.fn((id: string) => images.delete(id)),
    on: (event: string, listener: () => void) => {
      const handlers = listeners.get(event) ?? new Set();
      handlers.add(listener);
      listeners.set(event, handlers);
    },
    off: (event: string, listener: () => void) =>
      listeners.get(event)?.delete(listener),
  };
  const handle = createFootprintOutlineLayer(
    map as unknown as MaplibreMap,
    "footprint",
    { color: "white", width: 5, opacity: 1 }
  );
  return { handle, map, layers, sources, images, fire };
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: () => ({ width: 400 }),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    save: vi.fn(),
    clip: vi.fn(),
    clearRect: vi.fn(),
    restore: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    setTransform: vi.fn(),
    drawImage: drawSurfaceLabel,
    fillText: vi.fn(),
    getImageData: () => ({
      width: 512,
      height: 256,
      data: new Uint8ClampedArray(512 * 256 * 4),
    }),
  } as unknown as CanvasRenderingContext2D);
});

describe("native footprint draping and activation", () => {
  it("paints on existing receivers without terrain samples or additional scene geometry", () => {
    const { handle, map, fire } = setup(true);
    scene.runtimes = [{ id: "mesh", receivesMapStyleTexture: true }];
    handle.setRing(ring, { pose, seriesLabel: "2026Test" });
    const overlay = scene.surface.mock.calls.at(-1)?.[1];
    expect(overlay.bounds[0]).toBeLessThan(0);
    expect(overlay.bounds[2]).toBeGreaterThan(0.002);
    expect(overlay.texture.image.width).toBeLessThanOrEqual(2048);
    expect(overlay.texture.image.height).toBeLessThanOrEqual(2048);
    expect(overlay.opacity).toBe(1);
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      "footprint",
      "line-opacity",
      ["*", 0, ["case", ["==", ["get", "active"], false], 0.1, 1]]
    );
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      "footprint-label",
      "icon-opacity",
      0
    );
    const updates = scene.surface.mock.calls.length;
    for (let index = 0; index < 20; index++) {
      fire("idle");
      fire("render");
    }
    expect(scene.surface).toHaveBeenCalledTimes(updates);
    expect(map.queryTerrainElevation).not.toHaveBeenCalled();
    const dispose = vi.spyOn(overlay.texture, "dispose");
    handle.destroy();
    expect(scene.surface).toHaveBeenLastCalledWith("footprint", null);
    expect(dispose).toHaveBeenCalledOnce();
  });
  it("rebuilds labelled surface data after synchronous image-registration style events", () => {
    const { handle, map, images, fire } = setup(true);
    scene.runtimes = [{ id: "mesh", receivesMapStyleTexture: true }];
    map.addImage.mockImplementation((id, image) => {
      images.set(id, image);
      fire("styledata");
    });
    map.updateImage.mockImplementation((id, image) => {
      images.set(id, image);
      fire("styledata");
    });
    drawSurfaceLabel.mockClear();

    handle.setRing(ring, { pose, seriesLabel: "2024" });
    const firstOverlay = scene.surface.mock.calls.at(-1)?.[1];
    expect(firstOverlay).toBeTruthy();
    expect(drawSurfaceLabel).toHaveBeenCalled();

    drawSurfaceLabel.mockClear();
    const secondRing = ring.map(([lng, lat]) => [lng + 0.01, lat + 0.02]);
    handle.setRing(secondRing, { pose, seriesLabel: "2026" });
    const secondOverlay = scene.surface.mock.calls.at(-1)?.[1];
    expect(secondOverlay).toBeTruthy();
    expect(secondOverlay.bounds[0]).toBeCloseTo(0.00998, 4);
    expect(secondOverlay.bounds[1]).toBeCloseTo(0.01797, 4);
    expect(secondOverlay.bounds[2]).toBeCloseTo(0.01202, 4);
    expect(secondOverlay.bounds[3]).toBeCloseTo(0.02003, 4);
    expect(drawSurfaceLabel).toHaveBeenCalled();
    handle.destroy();
  });
  it("retains active outlines, caps fill and inactive opacity, and prefers the active hit", () => {
    const { handle, map, sources } = setup();
    handle.setStyle({
      color: "white",
      width: 5,
      opacity: 1,
      fillOpacity: 0.8,
      inactiveOpacity: 0.6,
    });
    handle.setRing(ring, { pose, imageId: "active", seriesLabel: "2024" }, [
      { id: "other", ring },
    ]);
    const features = sources.get("footprint-source")!.data.features;
    expect(
      features
        .filter((f) => f.geometry.type === "Polygon")
        .map((f) => f.properties?.active)
    ).toEqual([false, true]);
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      "footprint-interior",
      "fill-opacity",
      ["*", 1, ["case", ["==", ["get", "active"], false], 0.1, 0.2]]
    );
    map.queryRenderedFeatures.mockReturnValue([
      {
        id: "other",
        properties: { revision: 1, active: false, imageId: "other" },
      },
      {
        id: "active",
        properties: { revision: 1, active: true, imageId: "active" },
      },
    ]);
    expect(handle.imageAtScreenPoint({ x: 80, y: 40 })).toBe("active");
    map.queryRenderedFeatures.mockReturnValue([
      {
        id: "other",
        properties: { revision: 1, active: false, imageId: "other" },
      },
    ]);
    expect(handle.imageAtScreenPoint({ x: 80, y: 40 })).toBe("other");
    handle.setLocked(true);
    expect(handle.imageAtScreenPoint({ x: 80, y: 40 })).toBeNull();
    handle.destroy();
  });
  it("stops repainting when the finite surface fade is complete and restores the native fallback", () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(100);
    const { handle, map, fire } = setup(true);
    scene.runtimes = [{ id: "mesh", receivesMapStyleTexture: true }];
    handle.setRing(ring, { pose, seriesLabel: "2024" });
    handle.setLocked(true, { duration: 100, delay: 0 });
    now.mockReturnValue(150);
    fire("render");
    expect(scene.surface.mock.calls.at(-1)?.[1]?.opacity).toBeCloseTo(0.5);
    now.mockReturnValue(200);
    fire("render");
    expect(scene.surface.mock.calls.at(-1)?.[1]?.opacity).toBe(0);
    const updates = scene.surface.mock.calls.length;
    const repaints = map.triggerRepaint.mock.calls.length;
    fire("render");
    fire("idle");
    expect(scene.surface).toHaveBeenCalledTimes(updates);
    expect(map.triggerRepaint).toHaveBeenCalledTimes(repaints);
    scene.runtimes = [];
    handle.setLocked(false, { duration: 0, delay: 0 });
    fire("idle");
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      "footprint",
      "line-opacity",
      ["*", 1, ["case", ["==", ["get", "active"], false], 0.1, 1]]
    );
    expect(scene.surface).toHaveBeenLastCalledWith("footprint", null);
    handle.destroy();
    now.mockRestore();
  });
  it("sends only the polygon, open caret and one label to the native worker-backed source", () => {
    const { handle, map, sources, layers, fire } = setup();
    handle.setRing(ring, { pose, seriesLabel: "2026Test" });
    const features = sources.get("footprint-source")!.data.features;
    expect(features.map((feature) => feature.geometry.type)).toEqual([
      "Polygon",
      "LineString",
      "Point",
    ]);
    expect(features[0].geometry).toEqual({
      type: "Polygon",
      coordinates: [ring],
    });
    expect(
      features[1].geometry.type === "LineString" &&
        features[1].geometry.coordinates.length
    ).toBe(3);
    expect(layers.get("footprint-label")?.metadata).toEqual({
      "carma:map-style-placement": "draped",
    });
    expect(map.queryTerrainElevation).not.toHaveBeenCalled();
    for (let index = 0; index < 20; index++) fire("idle");
    expect(map.queryTerrainElevation).not.toHaveBeenCalled();
    handle.destroy();
  });
  it("stays before the shared capture and does not request recurring layer moves at rest", () => {
    const { handle, map, fire } = setup(true);
    expect(map.getLayersOrder()).toEqual([
      "footprint-interior",
      "footprint",
      "footprint-caret",
      "footprint-label",
      "shared",
    ]);
    const moves = map.moveLayer.mock.calls.length;
    const releases = scene.release.mock.calls.length;
    for (let index = 0; index < 20; index++) {
      fire("styledata");
      fire("idle");
    }
    expect(map.moveLayer).toHaveBeenCalledTimes(moves);
    expect(scene.release).toHaveBeenCalledTimes(releases);
    expect(map.queryTerrainElevation).not.toHaveBeenCalled();
    handle.destroy();
  });
  it("uses native rendered polygon hits and removes the target immediately when locked", () => {
    const { handle, map } = setup();
    handle.setRing(ring);
    expect(handle.containsScreenPoint({ x: 80, y: 40 })).toBe(true);
    expect(map.queryRenderedFeatures).toHaveBeenCalledWith(
      { x: 80, y: 40 },
      { layers: ["footprint-interior"] }
    );
    map.queryRenderedFeatures.mockReturnValue([
      { id: "old-footprint", properties: { revision: 0 } },
    ]);
    expect(handle.containsScreenPoint({ x: 80, y: 40 })).toBe(false);
    map.queryRenderedFeatures.mockReturnValue([]);
    expect(handle.containsScreenPoint({ x: 300, y: 40 })).toBe(false);
    handle.setLocked(true);
    const queries = map.queryRenderedFeatures.mock.calls.length;
    expect(handle.containsScreenPoint({ x: 80, y: 40 })).toBe(false);
    expect(map.queryRenderedFeatures).toHaveBeenCalledTimes(queries);
    expect(map.setLayoutProperty).toHaveBeenCalledWith(
      "footprint-interior",
      "visibility",
      "none"
    );
    handle.setLocked(false);
    expect(map.setLayoutProperty).toHaveBeenCalledWith(
      "footprint-interior",
      "visibility",
      "visible"
    );
    handle.setStyle({ color: "white", width: 5, opacity: 0 });
    expect(handle.containsScreenPoint({ x: 80, y: 40 })).toBe(false);
    handle.destroy();
  });
  it("removes the label for one series and restores cached data after style replacement", () => {
    const { handle, map, layers, sources, images, fire } = setup();
    handle.setRing(ring, { pose, seriesLabel: "2024" });
    expect(images.size).toBe(1);
    handle.setRing(ring, { pose });
    expect(sources.get("footprint-source")!.data.features).toHaveLength(2);
    layers.clear();
    sources.clear();
    images.clear();
    fire("styledata");
    expect(layers.size).toBe(4);
    expect(sources.get("footprint-source")!.data.features).toHaveLength(2);
    handle.setRing(null);
    expect(sources.get("footprint-source")!.data.features).toHaveLength(0);
    handle.destroy();
    expect(layers.size).toBe(0);
    expect(sources.size).toBe(0);
    expect(images.size).toBe(0);
    expect(map.removeImage).toHaveBeenCalled();
    expect(handle.containsScreenPoint({ x: 80, y: 40 })).toBe(false);
  });
});
