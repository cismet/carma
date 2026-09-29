import { vi } from "vitest";

const mapLibreEventMock = vi.hoisted(() => ({
  MOVE: "move",
  MOVE_END: "moveend",
  MOVE_START: "movestart",
  RESIZE: "resize",
  STYLE_DATA: "styledata",
  STYLE_LOAD: "style.load",
  TERRAIN: "terrain",
}));

export const TEST_TERRAIN_SOURCE = {
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
  const { TILE_VOLUME_LOAD_REASON } = await vi.importActual<
    typeof import("../../../../engines/maplibre/src/lib/core/tile-volume")
  >("../../../../engines/maplibre/src/lib/core/tile-volume");
  const { MAP_STYLE_PROJECTION_BLEND } = await vi.importActual<
    typeof import("../../../../engines/maplibre/src/lib/core/shared-three-scene-types")
  >("../../../../engines/maplibre/src/lib/core/shared-three-scene-types");
  const { hasStandaloneTerrain, subscribeSharedThreeTerrain } =
    await vi.importActual<
      typeof import("../../../../engines/maplibre/src/lib/runtime/integrations/shared-three-terrain-registry")
    >(
      "../../../../engines/maplibre/src/lib/runtime/integrations/shared-three-terrain-registry"
    );
  return {
    hasStandaloneTerrain,
    subscribeSharedThreeTerrain,
    meshShadowStageError,
    MAP_STYLE_PROJECTION_BLEND,
    TILE_VOLUME_LOAD_REASON,
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

// The scene imports the terrain runtime from the engine's terrain entry, which
// keeps the terrain worker out of the root barrel.
vi.mock("@carma-mapping/engines/maplibre/terrain", () => ({
  buildRasterDemTerrainRuntime: vi.fn(),
}));
