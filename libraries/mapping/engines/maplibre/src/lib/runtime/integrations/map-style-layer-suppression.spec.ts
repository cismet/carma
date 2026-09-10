import { describe, expect, it, vi } from "vitest";

import {
  acquireMapLibreTerrainMeshComposition,
  getMapStyleLocationLabelFlatOffset,
  getMapLibreLayerOpacityProperties,
  isMapStyleLocationLabelLayer,
  isMapStyleHouseNumberLabelLayer,
  isMapStylePointLabelLayer,
  isMapStyleWaterLabelLayer,
  isMapStyleRoadLabelLayer,
  MAPLIBRE_TERRAIN_MESH_BASE_OPACITY,
  notifyMapLibreStyleCompositionReady,
  notifyMapLibreStyleCompositionStarted,
  suppressMapLibreRegularStyleLayers,
} from "./map-style-layer-suppression";

type TestLayer = {
  id: string;
  type: string;
  source?: string;
  "source-layer"?: string;
  layout?: Record<string, unknown>;
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
  it("keeps only point-based location labels above Three", () => {
    expect(isMapStyleLocationLabelLayer({ id: "roads", type: "line" })).toBe(
      false
    );
    expect(
      isMapStyleLocationLabelLayer({
        id: "place-city",
        type: "symbol",
        "source-layer": "place",
      })
    ).toBe(true);
    expect(
      isMapStyleLocationLabelLayer({
        id: "road-labels",
        type: "symbol",
        "source-layer": "transportation_name",
        layout: { "symbol-placement": "line" },
      })
    ).toBe(false);
    expect(
      isMapStyleLocationLabelLayer({
        id: "raster-dop-overlay-1-raster",
        type: "raster",
        source: "rvrSchriftNT",
      })
    ).toBe(false);
    expect(
      isMapStyleLocationLabelLayer({
        id: "bg-basemap_relief::Name_Stadtgemeinde_bis_500000",
        type: "symbol",
        "source-layer": "Name_Punkt",
      })
    ).toBe(true);
    expect(
      isMapStyleLocationLabelLayer({
        id: "bg-basemap_relief::Name_Staatsgrenze",
        type: "symbol",
        "source-layer": "Name_Linie",
        layout: { "symbol-placement": "line" },
      })
    ).toBe(false);
    expect(
      isMapStyleLocationLabelLayer({
        id: "bg-basemap_relief::Name_Wald",
        type: "symbol",
        "source-layer": "Name_Punkt",
      })
    ).toBe(false);
  });

  it("classifies every point symbol as an overlay label", () => {
    expect(
      isMapStylePointLabelLayer({
        id: "house-numbers",
        type: "symbol",
        "source-layer": "Hausnummer",
        layout: { "text-field": ["get", "hausnummer"] },
      })
    ).toBe(true);
    expect(
      isMapStylePointLabelLayer({
        id: "road-labels",
        type: "symbol",
        layout: { "symbol-placement": "line" },
      })
    ).toBe(false);
    expect(
      isMapStylePointLabelLayer({
        id: "autobahn-route-shields",
        type: "symbol",
        layout: { "symbol-placement": "point" },
      })
    ).toBe(true);
    expect(
      isMapStyleRoadLabelLayer({
        id: "Verkehr_Strasse_Fernverkehr_Nummer",
        type: "symbol",
        layout: { "symbol-placement": "point" },
      })
    ).toBe(true);
    expect(
      isMapStylePointLabelLayer({
        id: "boundary-labels",
        type: "symbol",
        layout: { "symbol-placement": "line-center" },
      })
    ).toBe(false);
    // basemap.de street names switch between line placements per zoom.
    expect(
      isMapStylePointLabelLayer({
        id: "Name_Kreis_Gemeindestr",
        type: "symbol",
        layout: {
          "symbol-placement": {
            stops: [
              [13, "line"],
              [16, "line-center"],
            ],
          },
        },
      })
    ).toBe(false);
    expect(
      isMapStylePointLabelLayer({
        id: "Name_Landesstr",
        type: "symbol",
        layout: {
          "symbol-placement": ["step", ["zoom"], "line", 16, "line-center"],
        },
      })
    ).toBe(false);
  });

  it("recognizes water and house-number labels for the mesh drape", () => {
    expect(
      isMapStyleWaterLabelLayer({
        id: "bg-basemap_relief-Name_GewaesserL_Fluss",
        type: "symbol",
        "source-layer": "Gewaesserlinie",
      })
    ).toBe(true);
    expect(
      isMapStyleWaterLabelLayer({
        id: "bg-basemap_relief-Name_Kreis_Gemeindestr",
        type: "symbol",
        "source-layer": "Verkehrslinie",
      })
    ).toBe(false);
    expect(
      isMapStyleHouseNumberLabelLayer({
        id: "bg-basemap_relief-Hauskoordinate",
        type: "symbol",
        "source-layer": "Hauskoordinate",
      })
    ).toBe(true);
    expect(
      isMapStyleHouseNumberLabelLayer({
        id: "place-city",
        type: "symbol",
        "source-layer": "place",
      })
    ).toBe(false);
  });

  it("lifts place labels by their encoded basemap.de prominence", () => {
    const layer = (id: string): TestLayer => ({
      id: `bg-basemap_relief::${id}`,
      type: "symbol",
      "source-layer": "Name_Punkt",
    });

    expect(
      getMapStyleLocationLabelFlatOffset(layer("Name_Landeshauptstadt"))
    ).toEqual([0, -3]);
    expect(
      getMapStyleLocationLabelFlatOffset(layer("Name_Stadtgemeinde_bis_500000"))
    ).toEqual([0, -2.5]);
    expect(
      getMapStyleLocationLabelFlatOffset(layer("Name_Stadtgemeinde_bis_50000"))
    ).toEqual([0, -2]);
    expect(
      getMapStyleLocationLabelFlatOffset(
        layer("Name_Landgemeinde_groesser_10000")
      )
    ).toEqual([0, -1.5]);
    expect(
      getMapStyleLocationLabelFlatOffset(
        layer("Name_Ortsteil_Stadtteil_bis_1000")
      )
    ).toEqual([0, -1]);
    expect(
      getMapStyleLocationLabelFlatOffset(layer("Name_Wohnplatz_bis_20"))
    ).toEqual([0, -0.65]);
  });

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

describe("MapLibre terrain mesh composition", () => {
  it("waits for a full style replacement to finish before applying once", () => {
    const testMap = createMap([
      { id: "city-map", type: "raster", source: "amtlich" },
    ]);
    testMap.setPaint("city-map", "raster-opacity", 0.9);
    notifyMapLibreStyleCompositionReady(testMap.map as never);
    notifyMapLibreStyleCompositionStarted(testMap.map as never);

    const release = acquireMapLibreTerrainMeshComposition(testMap.map as never);
    expect(testMap.getPaint("city-map", "raster-opacity")).toBe(0.9);

    notifyMapLibreStyleCompositionReady(testMap.map as never);
    expect(testMap.getPaint("city-map", "raster-opacity")).toBe(
      MAPLIBRE_TERRAIN_MESH_BASE_OPACITY
    );
    expect(testMap.map.setPaintProperty).toHaveBeenCalledTimes(1);
    release();
  });

  it("fades base surfaces and preserves roads and label-only overlays", () => {
    const testMap = createMap([
      { id: "background", type: "background" },
      { id: "city-map", type: "raster", source: "amtlich" },
      { id: "landcover", type: "fill", source: "landcover" },
      { id: "road-surface", type: "fill", source: "transport" },
      {
        id: "spw2-light-grundriss-raster",
        type: "raster",
        source: "spw2-light-grundriss",
      },
      { id: "dop-overlay-raster", type: "raster", source: "dop-overlay" },
      { id: "roads", type: "line", source: "transport" },
      { id: "labels", type: "symbol", source: "labels" },
      { id: "three", type: "custom" },
      { id: "---boundary:first---", type: "background" },
    ]);
    testMap.setPaint("background", "background-opacity", 1);
    testMap.setPaint("city-map", "raster-opacity", 0.9);
    testMap.setPaint("landcover", "fill-opacity", ["get", "opacity"]);
    testMap.setPaint("road-surface", "fill-opacity", 0.75);
    testMap.setPaint("spw2-light-grundriss-raster", "raster-opacity", 0.8);
    testMap.setPaint("dop-overlay-raster", "raster-opacity", 0.85);
    testMap.setPaint("roads", "line-opacity", 0.7);
    testMap.setPaint("labels", "text-opacity", 1);
    testMap.setPaint("---boundary:first---", "background-opacity", 0);

    const release = acquireMapLibreTerrainMeshComposition(testMap.map as never);

    // One coherent StyleComposer completion signal applies the composition;
    // intermediate styledata events are deliberately ignored.
    expect(testMap.getPaint("city-map", "raster-opacity")).toBe(0.9);
    notifyMapLibreStyleCompositionReady(testMap.map as never);

    expect(testMap.getPaint("background", "background-opacity")).toBe(
      MAPLIBRE_TERRAIN_MESH_BASE_OPACITY
    );
    expect(testMap.getPaint("city-map", "raster-opacity")).toBe(
      MAPLIBRE_TERRAIN_MESH_BASE_OPACITY
    );
    expect(testMap.getPaint("landcover", "fill-opacity")).toBe(
      MAPLIBRE_TERRAIN_MESH_BASE_OPACITY
    );
    expect(testMap.getPaint("road-surface", "fill-opacity")).toBe(0.75);
    expect(
      testMap.getPaint("spw2-light-grundriss-raster", "raster-opacity")
    ).toBe(MAPLIBRE_TERRAIN_MESH_BASE_OPACITY);
    expect(testMap.getPaint("dop-overlay-raster", "raster-opacity")).toBe(0.85);
    expect(testMap.getPaint("roads", "line-opacity")).toBe(0.7);
    expect(testMap.getPaint("labels", "text-opacity")).toBe(1);
    expect(testMap.getPaint("---boundary:first---", "background-opacity")).toBe(
      0
    );

    release();

    expect(testMap.getPaint("background", "background-opacity")).toBe(1);
    expect(testMap.getPaint("city-map", "raster-opacity")).toBe(0.9);
    expect(testMap.getPaint("landcover", "fill-opacity")).toEqual([
      "get",
      "opacity",
    ]);
  });
});
