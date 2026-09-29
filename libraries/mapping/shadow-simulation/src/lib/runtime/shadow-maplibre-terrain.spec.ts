// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

const mapLibreEventMock = vi.hoisted(() => ({
  MOVE: "move",
  MOVE_END: "moveend",
  MOVE_START: "movestart",
  RESIZE: "resize",
  STYLE_DATA: "styledata",
  STYLE_LOAD: "style.load",
  TERRAIN: "terrain",
}));

const TEST_TERRAIN_SOURCE = {
  id: "terrain-source",
  url: "https://example.test/terrain/{z}/{x}/{y}.png",
  tileSize: 512,
  minzoom: 5,
  maxzoom: 15,
  encoding: "terrarium" as const,
  bounds: [6.4, 50.8, 7.8, 51.6] as const,
};

vi.mock("@carma-mapping/engines/maplibre", async () => {
  // Node-only renderer fixtures: load the pure implementation, not Leaflet/UI.
  const { isTerrainShadingStyleLayer, TERRAIN_MAP_STYLE } =
    await vi.importActual<
      typeof import("../../../../engines/maplibre/src/lib/core/terrain-map-style")
    >("../../../../engines/maplibre/src/lib/core/terrain-map-style");
  const { meshShadowStageError } = await vi.importActual<
    typeof import("../../../../engines/maplibre/src/lib/core/mesh-error-policy")
  >("../../../../engines/maplibre/src/lib/core/mesh-error-policy");
  const {
    claimStandaloneTerrain,
    hasStandaloneTerrain,
    subscribeSharedThreeTerrain,
  } = await vi.importActual<
    typeof import("../../../../engines/maplibre/src/lib/runtime/integrations/shared-three-terrain-registry")
  >(
    "../../../../engines/maplibre/src/lib/runtime/integrations/shared-three-terrain-registry"
  );
  return {
    claimStandaloneTerrain,
    hasStandaloneTerrain,
    subscribeSharedThreeTerrain,
    meshShadowStageError,
    isTerrainShadingStyleLayer,
    TERRAIN_MAP_STYLE,
    MAPLIBRE_EVENT: mapLibreEventMock,
    WUPPERTAL_TERRAIN_SOURCE_ID: "terrain-source",
    acquireSharedThreeScene: vi.fn(),
    getGenericThreeLayers: vi.fn(() => []),
    getSharedThreeShadowViewSignature: vi.fn(({ camera, shadowMapSize }) =>
      [
        ...camera.matrixWorld.elements,
        ...camera.projectionMatrix.elements,
        shadowMapSize.width,
        shadowMapSize.height,
      ].join(",")
    ),
    getSharedThreeSceneRuntimes: vi.fn(() => []),
    TILES_MESH_ERROR_TARGET_DEFAULT_PIXELS: 6,
    subscribeGenericThreeLayers: vi.fn(() => vi.fn()),
    subscribeSharedThreeSceneContent: vi.fn(() => vi.fn()),
    isSharedThreeTerrainLoading: vi.fn(() => false),
    subscribeSharedThreeTerrainLoading: vi.fn(() => vi.fn()),
    isMapStyleContourLineLayer: (layer: {
      type?: string;
      id?: string;
      "source-layer"?: string;
    }) =>
      layer.type === "line" &&
      /hoehenlinie/i.test(`${layer.id}:${layer["source-layer"]}`),
    suppressMapLibreRegularStyleLayers: vi.fn(() => vi.fn()),
  };
});

import { claimStandaloneTerrain } from "@carma-mapping/engines/maplibre";

import { acquireShadowMapLibreTerrain } from "./shadow-maplibre-terrain";

describe("shadow scene MapLibre terrain", () => {
  it("leaves the label drape to the shared scene for a textured terrain mesh", () => {
    type Handler = () => void;
    const handlers = new Map<string, Set<Handler>>();
    let terrain: { source: string; exaggeration: number } | null = null;
    let terrainSourceAdded = false;
    const layers = [
      { id: "background", type: "background" },
      { id: "basemap", type: "raster", source: "basemap-source" },
      { id: "landcover", type: "fill", source: "vector-source" },
      { id: "roads", type: "line", source: "vector-source" },
      {
        id: "bg-basemap_relief-Hoehenlinie_10er",
        type: "line",
        source: "vector-source",
        "source-layer": "Hoehenlinie",
      },
      { id: "road-labels", type: "symbol", source: "vector-source" },
      { id: "three", type: "custom" },
    ];
    const paint = new Map<string, unknown>([["basemap:raster-opacity", 0.9]]);
    const layout = new Map<string, unknown>([["roads:visibility", "visible"]]);
    const map = {
      terrain: null,
      getTerrain: vi.fn(() => terrain),
      getSource: vi.fn((sourceId: string) =>
        sourceId === "terrain-source" && terrainSourceAdded
          ? { id: sourceId }
          : undefined
      ),
      isStyleLoaded: vi.fn(() => true),
      addSource: vi.fn((sourceId: string) => {
        if (sourceId === "terrain-source") terrainSourceAdded = true;
      }),
      setTerrain: vi.fn((next: typeof terrain) => {
        terrain = next;
      }),
      getStyle: vi.fn(() => ({ layers })),
      getLayer: vi.fn((layerId: string) =>
        layers.find(({ id }) => id === layerId)
      ),
      addLayer: vi.fn((layer: (typeof layers)[number]) => {
        layers.unshift(layer);
      }),
      removeLayer: vi.fn((layerId: string) => {
        const index = layers.findIndex(({ id }) => id === layerId);
        if (index >= 0) layers.splice(index, 1);
      }),
      getPaintProperty: vi.fn((layerId: string, property: string) =>
        paint.get(`${layerId}:${property}`)
      ),
      setPaintProperty: vi.fn(
        (layerId: string, property: string, value: unknown) => {
          paint.set(`${layerId}:${property}`, value);
        }
      ),
      getLayoutProperty: vi.fn((layerId: string, property: string) =>
        layout.get(`${layerId}:${property}`)
      ),
      setLayoutProperty: vi.fn(
        (layerId: string, property: string, value: unknown) => {
          if (value == null) layout.delete(`${layerId}:${property}`);
          else layout.set(`${layerId}:${property}`, value);
        }
      ),
      on: vi.fn((event: string, handler: Handler) => {
        const listeners = handlers.get(event) ?? new Set<Handler>();
        listeners.add(handler);
        handlers.set(event, listeners);
      }),
      off: vi.fn(),
    };

    let drapeMode: "opaque" | "labels" = "labels";
    const release = acquireShadowMapLibreTerrain(
      map as never,
      TEST_TERRAIN_SOURCE,
      () => true,
      () => drapeMode
    );

    expect(terrain).toEqual({ source: "terrain-source", exaggeration: 1 });
    expect(map.addSource).toHaveBeenCalledWith(
      "terrain-source",
      expect.objectContaining({
        type: "raster-dem",
        tiles: [TEST_TERRAIN_SOURCE.url],
        encoding: "terrarium",
      })
    );
    expect(layers.some(({ id }) => id === "carma-shadow-map-style-base")).toBe(
      false
    );
    // Hiding fills and strokes is the registry's job; the scene leaves the
    // authored visibilities and opacities alone in labels mode.
    expect(layout.has("basemap:visibility")).toBe(false);
    expect(layout.get("roads:visibility")).toBe("visible");
    expect(layout.has("road-labels:visibility")).toBe(false);
    expect(layout.has("three:visibility")).toBe(false);
    expect(paint.get("basemap:raster-opacity")).toBe(0.9);

    // The mesh leaves the scene: the opaque basemap drape takes over again.
    drapeMode = "opaque";
    release.refresh();
    expect(terrain).toEqual({ source: "terrain-source", exaggeration: 1 });
    expect(layout.get("roads:visibility")).toBe("visible");
    expect(layout.has("basemap:visibility")).toBe(false);
    expect(paint.get("basemap:raster-opacity")).toBe(1);
    expect(layers[0]).toMatchObject({ id: "carma-shadow-map-style-base" });

    drapeMode = "labels";
    release.refresh();
    expect(terrain).toEqual({ source: "terrain-source", exaggeration: 1 });
    expect(layers.some(({ id }) => id === "carma-shadow-map-style-base")).toBe(
      false
    );
    expect(paint.get("basemap:raster-opacity")).toBe(0.9);
    expect(layout.get("roads:visibility")).toBe("visible");

    release();
    expect(layout.get("roads:visibility")).toBe("visible");
    expect(layout.has("basemap:visibility")).toBe(false);
  });
  it("keeps the native terrain enabled and restores the previous setting", () => {
    type Handler = () => void;
    const handlers = new Map<string, Set<Handler>>();
    const previousTerrain = { source: "previous-terrain", exaggeration: 0.75 };
    let terrain: typeof previousTerrain | null = previousTerrain;
    const terrainRuntime = {
      getMeshFrameDelta: vi.fn(() => 42),
    };
    const sources = new Set(["terrain-source", "previous-terrain"]);
    const layers = [
      {
        id: "basemap",
        type: "raster",
        source: "basemap-source",
      },
      { id: "landcover", type: "fill", source: "vector-source" },
      { id: "terrain-shading", type: "hillshade", source: "terrain-source" },
      { id: "terrain-relief", type: "color-relief", source: "terrain-source" },
      {
        id: "bg-basemap_relief::Schummerung_Col",
        type: "raster",
        source: "bg-basemap_relief::schummerung_col",
      },
      {
        id: "bg-basemap_relief::Schummerung_Comb",
        type: "raster",
        source: "bg-basemap_relief::schummerung_comb",
      },
      { id: "roads", type: "line", source: "vector-source" },
    ];
    const paint = new Map([
      ["basemap:raster-opacity", 0.9],
      ["landcover:fill-opacity", 0.6],
      ["bg-basemap_relief::Schummerung_Col:raster-opacity", 0.8],
      ["bg-basemap_relief::Schummerung_Comb:raster-opacity", 0.5],
    ]);
    const layout = new Map([
      ["terrain-shading:visibility", "visible"],
      ["terrain-relief:visibility", "visible"],
      ["bg-basemap_relief::Schummerung_Col:visibility", "visible"],
      ["bg-basemap_relief::Schummerung_Comb:visibility", "visible"],
    ]);
    const map = {
      terrain: terrainRuntime,
      getTerrain: vi.fn(() => terrain),
      getSource: vi.fn((sourceId: string) =>
        sources.has(sourceId) ? { id: sourceId } : undefined
      ),
      setTerrain: vi.fn((nextTerrain: typeof terrain) => {
        terrain = nextTerrain;
        for (const handler of handlers.get("terrain") ?? []) handler();
      }),
      getStyle: vi.fn(() => ({ layers })),
      getLayer: vi.fn((layerId: string) =>
        layers.find(({ id }) => id === layerId)
      ),
      addLayer: vi.fn((layer: (typeof layers)[number], beforeId?: string) => {
        const index = beforeId
          ? layers.findIndex(({ id }) => id === beforeId)
          : layers.length;
        layers.splice(index < 0 ? layers.length : index, 0, layer);
      }),
      removeLayer: vi.fn((layerId: string) => {
        const index = layers.findIndex(({ id }) => id === layerId);
        if (index >= 0) layers.splice(index, 1);
      }),
      getPaintProperty: vi.fn((layerId: string, property: string) =>
        paint.get(`${layerId}:${property}`)
      ),
      setPaintProperty: vi.fn(
        (layerId: string, property: string, value: unknown) => {
          paint.set(`${layerId}:${property}`, value as number);
        }
      ),
      getLayoutProperty: vi.fn((layerId: string, property: string) =>
        layout.get(`${layerId}:${property}`)
      ),
      setLayoutProperty: vi.fn(
        (layerId: string, property: string, value: unknown) => {
          layout.set(`${layerId}:${property}`, value as string);
        }
      ),
      on: vi.fn((event: string, handler: Handler) => {
        const listeners = handlers.get(event) ?? new Set<Handler>();
        listeners.add(handler);
        handlers.set(event, listeners);
      }),
      off: vi.fn((event: string, handler: Handler) => {
        handlers.get(event)?.delete(handler);
      }),
    };

    let mapStyleContentVisible = true;
    const release = acquireShadowMapLibreTerrain(
      map as never,
      TEST_TERRAIN_SOURCE,
      () => mapStyleContentVisible
    );

    expect(terrain).toEqual({ source: "terrain-source", exaggeration: 1 });
    expect(terrainRuntime.getMeshFrameDelta(15)).toBe(0);
    expect(layers[0]).toMatchObject({
      id: "carma-shadow-map-style-base",
      type: "background",
    });
    expect(paint.get("basemap:raster-opacity")).toBe(1);
    expect(paint.get("landcover:fill-opacity")).toBe(1);
    expect(layout.get("terrain-shading:visibility")).toBe("none");
    expect(layout.get("terrain-relief:visibility")).toBe("none");
    expect(layout.get("bg-basemap_relief::Schummerung_Col:visibility")).toBe(
      "none"
    );
    expect(layout.get("bg-basemap_relief::Schummerung_Comb:visibility")).toBe(
      "none"
    );
    expect(paint.has("roads:line-opacity")).toBe(false);
    terrain = null;
    for (const handler of handlers.get("terrain") ?? []) handler();
    expect(terrain).toEqual({ source: "terrain-source", exaggeration: 1 });
    mapStyleContentVisible = false;
    paint.set("basemap:raster-opacity", 0.75);
    const paintUpdateCount = map.setPaintProperty.mock.calls.length;
    for (const handler of handlers.get("styledata") ?? []) handler();
    expect(paint.get("basemap:raster-opacity")).toBe(0.75);
    expect(map.setPaintProperty).toHaveBeenCalledTimes(paintUpdateCount);
    expect(terrain).toEqual({ source: "terrain-source", exaggeration: 1 });
    mapStyleContentVisible = true;
    for (const handler of handlers.get("styledata") ?? []) handler();
    expect(paint.get("basemap:raster-opacity")).toBe(1);

    release();

    expect(terrain).toEqual(previousTerrain);
    expect(terrainRuntime.getMeshFrameDelta(15)).toBe(42);
    expect(layers.some(({ id }) => id === "carma-shadow-map-style-base")).toBe(
      false
    );
    expect(paint.get("basemap:raster-opacity")).toBe(0.75);
    expect(paint.get("landcover:fill-opacity")).toBe(0.6);
    expect(layout.get("terrain-shading:visibility")).toBe("visible");
    expect(layout.get("terrain-relief:visibility")).toBe("visible");
    expect(layout.get("bg-basemap_relief::Schummerung_Col:visibility")).toBe(
      "visible"
    );
    expect(layout.get("bg-basemap_relief::Schummerung_Comb:visibility")).toBe(
      "visible"
    );
    expect(map.off).toHaveBeenCalledWith("styledata", expect.any(Function));
    expect(map.off).toHaveBeenCalledWith("terrain", expect.any(Function));
  });

  it("respects standalone mesh ownership through terrain acquisition, handover and disposal", () => {
    const handlers = new Map<string, Set<() => void>>();
    const emit = (event: string) => {
      for (const handler of handlers.get(event) ?? []) handler();
    };
    let terrain: { source: string; exaggeration: number } | null = null;
    let centerElevation = 0;
    const layers = [
      { id: "basemap", type: "raster", source: "basemap-source" },
      { id: "hillshade", type: "hillshade", source: "terrain-source" },
    ];
    const paint = new Map<string, unknown>([["basemap:raster-opacity", 0.6]]);
    const layout = new Map<string, unknown>([
      ["hillshade:visibility", "visible"],
    ]);
    const map = {
      getTerrain: () => terrain,
      getSource: (id: string) => ({ id }),
      setTerrain: vi.fn((next: typeof terrain) => {
        terrain = next;
        centerElevation = next ? 150 : 0;
        emit("terrain");
      }),
      getStyle: vi.fn(() => ({ layers })),
      getLayer: (id: string) => layers.find((layer) => layer.id === id),
      addLayer: (layer: (typeof layers)[number]) => layers.unshift(layer),
      removeLayer: (id: string) => {
        const index = layers.findIndex((layer) => layer.id === id);
        if (index >= 0) layers.splice(index, 1);
      },
      getPaintProperty: (id: string, property: string) =>
        paint.get(`${id}:${property}`),
      setPaintProperty: (id: string, property: string, value: unknown) =>
        paint.set(`${id}:${property}`, value),
      getLayoutProperty: (id: string, property: string) =>
        layout.get(`${id}:${property}`),
      setLayoutProperty: (id: string, property: string, value: unknown) =>
        layout.set(`${id}:${property}`, value),
      on: (event: string, handler: () => void) => {
        const listeners = handlers.get(event) ?? new Set();
        listeners.add(handler);
        handlers.set(event, listeners);
      },
      off: (event: string, handler: () => void) =>
        handlers.get(event)?.delete(handler),
    };
    const releaseInitialMesh = claimStandaloneTerrain(
      map as never,
      "initial-mesh"
    );
    const releaseShadow = acquireShadowMapLibreTerrain(
      map as never,
      TEST_TERRAIN_SOURCE
    );
    emit("styledata");
    emit("terrain");
    expect(map.setTerrain).not.toHaveBeenCalled();
    expect(centerElevation).toBe(0);
    expect(paint.get("basemap:raster-opacity")).toBe(0.6);

    releaseInitialMesh();
    expect(terrain).toEqual({ source: "terrain-source", exaggeration: 1 });
    expect(paint.get("basemap:raster-opacity")).toBe(1);
    expect(layout.get("hillshade:visibility")).toBe("none");
    const releaseLateMesh = claimStandaloneTerrain(map as never, "late-mesh");
    const styleReadCount = map.getStyle.mock.calls.length;
    const releaseOtherMesh = claimStandaloneTerrain(map as never, "other-mesh");
    expect(map.getStyle).toHaveBeenCalledTimes(styleReadCount);
    expect(terrain).toBeNull();
    expect(centerElevation).toBe(0);
    expect(paint.get("basemap:raster-opacity")).toBe(0.6);
    expect(layout.get("hillshade:visibility")).toBe("visible");
    expect(map.getLayer("carma-shadow-map-style-base")).toBeUndefined();
    releaseLateMesh();
    expect(terrain).toBeNull();
    releaseOtherMesh();
    expect(terrain).toEqual({ source: "terrain-source", exaggeration: 1 });
    releaseShadow();

    // A shadow session started with DEM terrain must not restore that snapshot
    // over a standalone mesh added later, nor reactivate after being disposed.
    const previousTerrain = { source: "previous-terrain", exaggeration: 0.75 };
    map.setTerrain(previousTerrain);
    const releaseNextShadow = acquireShadowMapLibreTerrain(
      map as never,
      TEST_TERRAIN_SOURCE
    );
    const releaseFinalMesh = claimStandaloneTerrain(map as never, "final-mesh");
    expect(terrain).toBeNull();
    releaseNextShadow();
    expect(terrain).toBeNull();
    const updateCount = map.setTerrain.mock.calls.length;
    releaseFinalMesh();
    emit("styledata");
    emit("terrain");
    expect(map.setTerrain).toHaveBeenCalledTimes(updateCount);
  });
});
