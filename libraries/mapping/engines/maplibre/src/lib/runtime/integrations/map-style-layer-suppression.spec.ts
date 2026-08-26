import { describe, expect, it, vi } from "vitest";

import {
  getMapLibreLayerOpacityProperties,
  suppressMapLibreRegularStyleLayers,
} from "./map-style-layer-suppression";

type TestLayer = {
  id: string;
  type: string;
  source?: string;
  "source-layer"?: string;
};

const createMap = (initialLayers: TestLayer[]) => {
  let layers = initialLayers;
  const paint = new Map<string, unknown>();
  const layout = new Map<string, unknown>();
  const handlers = new Map<string, Set<() => void>>();
  const propertyKey = (layerId: string, property: string) =>
    `${layerId}:${property}`;
  const map = {
    getStyle: vi.fn(() => ({ version: 8, sources: {}, layers })),
    getLayer: vi.fn((layerId: string) => {
      const layer = layers.find((candidate) => candidate.id === layerId);
      if (!layer) return undefined;
      const { "source-layer": sourceLayer, ...runtimeLayer } = layer;
      return { ...runtimeLayer, sourceLayer };
    }),
    getPaintProperty: vi.fn((layerId: string, property: string) =>
      paint.get(propertyKey(layerId, property))
    ),
    setPaintProperty: vi.fn(
      (layerId: string, property: string, value: unknown) => {
        const key = propertyKey(layerId, property);
        if (value == null) paint.delete(key);
        else paint.set(key, value);
      }
    ),
    getLayoutProperty: vi.fn((layerId: string, property: string) =>
      layout.get(propertyKey(layerId, property))
    ),
    setLayoutProperty: vi.fn(
      (layerId: string, property: string, value: unknown) => {
        const key = propertyKey(layerId, property);
        if (value == null) layout.delete(key);
        else layout.set(key, value);
      }
    ),
    on: vi.fn((event: string, handler: () => void) => {
      const eventHandlers = handlers.get(event) ?? new Set();
      eventHandlers.add(handler);
      handlers.set(event, eventHandlers);
    }),
    off: vi.fn((event: string, handler: () => void) => {
      handlers.get(event)?.delete(handler);
    }),
  };

  return {
    map,
    paint,
    layout,
    setLayers(nextLayers: TestLayer[]) {
      layers = nextLayers;
    },
    emit(event: string) {
      for (const handler of handlers.get(event) ?? []) handler();
    },
    getPaint(layerId: string, property: string) {
      return paint.get(propertyKey(layerId, property));
    },
    setPaint(layerId: string, property: string, value: unknown) {
      paint.set(propertyKey(layerId, property), value);
    },
    getVisibility(layerId: string) {
      return layout.get(propertyKey(layerId, "visibility"));
    },
    setVisibility(layerId: string, value: unknown) {
      layout.set(propertyKey(layerId, "visibility"), value);
    },
  };
};

describe("MapLibre regular style layer suppression", () => {
  it("makes every opacity-capable regular layer transparent and restores exact values", () => {
    const layerTypes = [
      "background",
      "circle",
      "color-relief",
      "fill",
      "fill-extrusion",
      "heatmap",
      "line",
      "raster",
      "symbol",
    ];
    const testMap = createMap([
      ...layerTypes.map((type) => ({
        id: type,
        type,
        source: type,
        "source-layer": `${type}-features`,
      })),
      { id: "hillshade", type: "hillshade", source: "terrain" },
      { id: "three", type: "custom" },
    ]);
    const originals = new Map<string, unknown>();
    for (const type of layerTypes) {
      for (const property of getMapLibreLayerOpacityProperties(type)) {
        const value = property === "fill-opacity" ? ["get", "opacity"] : 0.4;
        originals.set(`${type}:${property}`, value);
        testMap.setPaint(type, property, value);
      }
    }
    testMap.setVisibility("hillshade", undefined);
    testMap.setPaint("three", "custom-opacity", 0.8);

    const restore = suppressMapLibreRegularStyleLayers(testMap.map as never);

    for (const type of layerTypes) {
      for (const property of getMapLibreLayerOpacityProperties(type)) {
        expect(testMap.getPaint(type, property)).toBe(0);
      }
    }
    expect(testMap.getVisibility("hillshade")).toBe("none");
    expect(testMap.getPaint("three", "custom-opacity")).toBe(0.8);
    expect(testMap.map.setPaintProperty).not.toHaveBeenCalledWith(
      "three",
      expect.anything(),
      expect.anything()
    );

    restore();

    for (const [key, value] of originals) {
      const separator = key.indexOf(":");
      expect(
        testMap.getPaint(key.slice(0, separator), key.slice(separator + 1))
      ).toEqual(value);
    }
    expect(testMap.getVisibility("hillshade")).toBeUndefined();
    expect(testMap.map.setLayoutProperty).toHaveBeenCalledWith(
      "hillshade",
      "visibility",
      null
    );
    expect(testMap.map.off).toHaveBeenCalledWith(
      "styledata",
      expect.any(Function)
    );
  });

  it("suppresses layers added later and adopts a reloaded style's values", () => {
    const testMap = createMap([
      { id: "basemap", type: "raster", source: "base" },
    ]);
    testMap.setPaint("basemap", "raster-opacity", 0.5);
    const restore = suppressMapLibreRegularStyleLayers(testMap.map as never);

    testMap.setLayers([
      { id: "basemap", type: "raster", source: "base" },
      { id: "overlay", type: "fill", source: "overlay" },
    ]);
    testMap.setPaint("overlay", "fill-opacity", 0.7);
    testMap.emit("styledata");
    expect(testMap.getPaint("overlay", "fill-opacity")).toBe(0);

    testMap.emit("styledataloading");
    testMap.setLayers([
      { id: "basemap", type: "raster", source: "replacement" },
      { id: "labels", type: "symbol", source: "replacement" },
    ]);
    testMap.setPaint("basemap", "raster-opacity", 0.85);
    testMap.setPaint("labels", "icon-opacity", 0.25);
    testMap.setPaint("labels", "text-opacity", undefined);
    testMap.emit("styledata");

    expect(testMap.getPaint("basemap", "raster-opacity")).toBe(0);
    expect(testMap.getPaint("labels", "icon-opacity")).toBe(0);
    expect(testMap.getPaint("labels", "text-opacity")).toBe(0);

    restore();
    expect(testMap.getPaint("basemap", "raster-opacity")).toBe(0.85);
    expect(testMap.getPaint("labels", "icon-opacity")).toBe(0.25);
    expect(testMap.getPaint("labels", "text-opacity")).toBeUndefined();
    expect(testMap.map.setPaintProperty).toHaveBeenCalledWith(
      "labels",
      "text-opacity",
      null
    );
  });

  it("keeps suppression until the final idempotent release", () => {
    const testMap = createMap([
      { id: "basemap", type: "raster", source: "base" },
    ]);
    testMap.setPaint("basemap", "raster-opacity", 0.6);

    const releaseFirst = suppressMapLibreRegularStyleLayers(
      testMap.map as never
    );
    const releaseSecond = suppressMapLibreRegularStyleLayers(
      testMap.map as never
    );
    releaseFirst();
    releaseFirst();
    expect(testMap.getPaint("basemap", "raster-opacity")).toBe(0);

    releaseSecond();
    expect(testMap.getPaint("basemap", "raster-opacity")).toBe(0.6);
  });

  it("retains the current restore snapshot if a style load never completes", () => {
    const testMap = createMap([
      { id: "basemap", type: "raster", source: "base" },
    ]);
    testMap.setPaint("basemap", "raster-opacity", 0.45);
    const restore = suppressMapLibreRegularStyleLayers(testMap.map as never);

    testMap.emit("styledataloading");
    restore();

    expect(testMap.getPaint("basemap", "raster-opacity")).toBe(0.45);
  });
});
