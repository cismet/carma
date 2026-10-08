import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Layer } from "@carma-mapping/layers";
import type { AddonEntry, AddonOverridesState } from "@carma-mapping/addons";
import { obliqueFachzwilling } from "../../constants/fachzwillinge/oblique";
import { MapStyleKeys } from "../../constants/MapStyleKeys";
import {
  OBLIQUE_MESH_2024_STYLE_URI,
  OBLIQUE_LOD2_STYLE,
} from "../../config/oblique.config";

type TerrainRuntime = {
  id: string;
  ready: Promise<boolean>;
  isBaseViewReady: ReturnType<typeof vi.fn>;
  setGroundVisible: ReturnType<typeof vi.fn>;
  setTileDemandPaused: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
};
type SceneLease = {
  options?: { mapStylePresentation?: boolean };
  release: ReturnType<typeof vi.fn>;
  setPointLabelOverlayVisible: ReturnType<typeof vi.fn>;
  setMeshLabelStyle: ReturnType<typeof vi.fn>;
  layer: {
    addRuntime: ReturnType<typeof vi.fn>;
    removeRuntime: ReturnType<typeof vi.fn>;
  };
};

const state = vi.hoisted(() => ({
  sourceParityStyle: {
    version: 8,
    metadata: {
      carmaConf: {
        "3d": {
          tilesetUrl: "https://example.test/mesh2024/tileset.json",
          basemap: "none",
        },
      },
    },
    sources: {},
    layers: [],
  },
  layers: [] as unknown[],
  pathname: "/",
  search: "",
  shadow: undefined as Record<string, unknown> | undefined,
  addons: [] as AddonEntry[],
  overrides: undefined as AddonOverridesState | undefined,
  backgroundOptions: [] as Array<Record<string, unknown>>,
  currentStyle: "luftbild",
  setCurrentStyle: vi.fn(),
  obliqueEnabled: false,
  previewVisible: false,
  map: null as { getCenter: () => { lng: number; lat: number } } | null,
  leases: [] as SceneLease[],
  runtimes: [] as TerrainRuntime[],
  terrainUsable: true,
  pendingTerrain: [] as Array<(ready: boolean) => void>,
  unregisters: [] as ReturnType<typeof vi.fn>[],
  restores: [] as ReturnType<typeof vi.fn>[],
  acquireComposition: vi.fn(),
  acquireDemandPause: vi.fn(),
  demandPauseReleases: [] as ReturnType<typeof vi.fn>[],
  acquireZoomLimit: vi.fn(),
  buildTerrain: vi.fn(),
  notifyChanged: vi.fn(),
  shadedReady: false,
  presentationListeners: new Set<() => void>(),
  contentListeners: new Set<() => void>(),
  sceneRuntimes: [] as Array<{
    id: string;
    providesTerrain?: boolean;
    mapStyleProjectionBlend?: string;
  }>,
}));

vi.mock("react-redux", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-redux")>()),
  useSelector: (select: () => unknown) => select(),
}));
vi.mock("react-router-dom", () => ({
  useLocation: () => ({ pathname: state.pathname, search: state.search }),
}));
vi.mock("../../store/slices/mapping", () => ({
  getLayers: () => state.layers,
  getBackgroundLayer: () => ({ id: "background" }),
}));
vi.mock("../../config/backgroundConfig", () => ({
  backgroundConfig: { namedLayers: {} },
}));
vi.mock("../useGeoportalMapStyle", () => ({
  useMapStyle: () => ({
    currentStyle: state.currentStyle,
    setCurrentStyle: state.setCurrentStyle,
  }),
}));
vi.mock("@carma-mapping/contexts", () => ({
  useLibreContext: () => ({ map: state.map }),
}));
vi.mock("@carma-commons/resources", () => ({
  NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN: { id: "test-terrain" },
}));
vi.mock("@carma-commons/utils", () => ({ isHttpCacheForced: () => false }));
vi.mock("@carma-mapping/components", () => ({
  applyDynamicStylingToStylesheet: (style: unknown) => style,
  buildFilterExpression: () => null,
}));
vi.mock("../../config/oblique.config", () => ({
  OBLIQUE_VIEWER_CONFIG: {},
  OBLIQUE_VIEWER_DEPLOYMENTS: ["localDev", "dev", "pr"],
  OBLIQUE_MESH_2024_STYLE_URI: "/data/test-parity.style.json",
  OBLIQUE_LOD2_STYLE: {
    version: 8,
    metadata: {
      carmaConf: {
        "3d": {
          tilesetUrl: "https://example.test/lod2/tileset.json",
          providesTerrain: false,
        },
      },
    },
    sources: {},
    layers: [],
  },
  OBLIQUE_BASE_TILESET_URLS: [
    "https://example.test/mesh2024/tileset.json",
    "https://example.test/meshx2024/tileset.json",
    "https://example.test/lod2/tileset.json",
  ],
}));
vi.mock("@carma-mapping/engines/maplibre", () => ({
  THREE_TILES_LAYER_TYPE: "three-tiles",
  THREE_TILES_SHADER_KIND: { CLAY: "clay" },
  TILES3D_BASEMAP: { NONE: "none", LABELS: "labels" },
  acquireSharedThreeScene: (_map: unknown, options?: SceneLease["options"]) => {
    let attached: TerrainRuntime | undefined;
    const lease = {
      options,
      release: vi.fn(),
      setPointLabelOverlayVisible: vi.fn(),
      setMeshLabelStyle: vi.fn(),
      layer: {
        addRuntime: vi.fn((runtime: TerrainRuntime) => {
          attached = runtime;
        }),
        removeRuntime: vi.fn((id: string) => {
          if (attached?.id === id) attached.dispose();
        }),
      },
    };
    state.leases.push(lease);
    return lease;
  },
  registerSharedThreeSceneRuntime: () => {
    const unregister = vi.fn();
    state.unregisters.push(unregister);
    return unregister;
  },
  notifySharedThreeSceneContentChanged: state.notifyChanged,
  getSharedThreeSceneRuntimes: () => state.sceneRuntimes,
  subscribeSharedThreeSceneContent: (_map: unknown, listener: () => void) => {
    state.contentListeners.add(listener);
    return () => state.contentListeners.delete(listener);
  },
  hasSharedThreeShadedPresentation: () => state.shadedReady,
  subscribeSharedThreeShadedPresentation: (
    _map: unknown,
    listener: () => void
  ) => {
    state.presentationListeners.add(listener);
    return () => state.presentationListeners.delete(listener);
  },
  WUPPERTAL_TERRAIN_SOURCE_ID: "test-dem-source",
  acquireMapLibreTerrainZoomLimit: (...args: unknown[]) => {
    state.acquireZoomLimit(...args);
    return vi.fn();
  },
  acquireMapLibreTerrainDemandPause: (...args: unknown[]) => {
    state.acquireDemandPause(...args);
    const release = vi.fn();
    state.demandPauseReleases.push(release);
    return release;
  },
  acquireMapLibreTerrainMeshComposition: (...args: unknown[]) => {
    state.acquireComposition(...args);
    const restore = vi.fn();
    state.restores.push(restore);
    return restore;
  },
}));
vi.mock("@carma-mapping/engines/maplibre/terrain", () => ({
  buildRasterDemTerrainRuntime: (...args: unknown[]) => {
    state.buildTerrain(...args);
    const runtime: TerrainRuntime = {
      id: String(args[0]),
      ready: new Promise<boolean>((resolve) =>
        state.pendingTerrain.push(resolve)
      ),
      isBaseViewReady: vi.fn(() => state.terrainUsable),
      setGroundVisible: vi.fn(),
      setTileDemandPaused: vi.fn(),
      dispose: vi.fn(),
    };
    state.runtimes.push(runtime);
    return runtime;
  },
}));
vi.mock("@carma-mapping/addons", async () => {
  const { conditionRouteOf, isShownByCondition } = await vi.importActual<
    typeof import("../../../../../../libraries/mapping/addons/src/addons/ConditionalLayer")
  >("../../../../../../libraries/mapping/addons/src/addons/ConditionalLayer");
  type Entry = { kind: string; config?: unknown };
  return {
    conditionRouteOf,
    isShownByCondition,
    useAddonState: () => [state.shadow],
    useRouteAddons: () => state.addons,
    usePersistedAddonOverrides: () => [state.overrides],
    useObliqueViewerActions: () => ({
      isOn: state.obliqueEnabled,
      previewVisible: state.previewVisible,
    }),
    // Registry and persistence have their own tests; exercise this hook without
    // initializing unrelated addon components and mapping-engine barrels.
    resolveAddonEntries: (entries: AddonEntry[]) =>
      entries.map((entry) =>
        typeof entry === "string"
          ? { kind: entry }
          : {
              kind: "addon" in entry ? entry.addon : entry.kind,
              config: entry.config,
            }
      ),
    applyAddonOverrides: (
      entries: Entry[],
      overrides?: AddonOverridesState
    ) => [
      ...entries.filter(
        (entry) => !overrides?.suspended.some((kind) => kind === entry.kind)
      ),
      ...(overrides?.enabled ?? [])
        .filter((kind) => !entries.some((entry) => entry.kind === kind))
        .map((kind) => ({ kind })),
    ],
  };
});
vi.mock(
  "../../components/GeoportalMap/geoportalBackgroundToLibreLayers",
  () => ({
    geoportalBackgroundToLibreLayers: (
      _backgroundLayer: unknown,
      _namedLayers: unknown,
      options: Record<string, unknown>
    ) => {
      state.backgroundOptions.push(options);
      return [];
    },
  })
);
vi.mock(
  "../../components/GeoportalMap/geoportalLayersToLibreLayers",
  async () => {
    const actual = await vi.importActual<
      typeof import("../../components/GeoportalMap/geoportalLayersToLibreLayers")
    >("../../components/GeoportalMap/geoportalLayersToLibreLayers");
    return {
      ...actual,
      geoportalLayersToLibreLayers: (layers: Layer[]) =>
        layers.map((layer) => ({ id: layer.id })),
    };
  }
);

import { useLibreLayers } from "./useLibreLayers";

const expectedParityStyle = {
  ...state.sourceParityStyle,
  metadata: {
    carmaConf: {
      "3d": {
        ...state.sourceParityStyle.metadata.carmaConf["3d"],
        basemap: "labels",
      },
    },
  },
};

const bridgeMask = {
  id: "buga-bruecke",
  title: "Brückenmaske",
  visible: true,
  tools: [
    {
      addon: "conditionalLayer",
      config: { showWhen: [{ param: "mask", value: "buga-bruecke" }] },
    },
  ],
} as unknown as Layer;

const standaloneMesh = {
  id: "mesh",
  title: "Mesh",
  visible: true,
  props: { style: { metadata: { carmaConf: { "3d": { basemap: "none" } } } } },
} as unknown as Layer;

const pmShowMesh = {
  ...standaloneMesh,
  id: "pm-show-mesh",
  tools: [
    { addon: "conditionalLayer", config: { showWhen: [{ route: "pm-show" }] } },
  ],
} as unknown as Layer;

const drawnIds = () =>
  renderHook(() => useLibreLayers()).result.current.map(
    (layer) => (layer as { id: string }).id
  );
const lastBackgroundOptions = () =>
  state.backgroundOptions[state.backgroundOptions.length - 1];

describe("useLibreLayers with conditional layers", () => {
  it("caps native label DEM in Mesh and does not admit Three DEM demand on preview close", () => {
    state.map = { getCenter: () => ({ lng: 7.2, lat: 51.27 }) };
    state.addons = ["obliqueViewer", "mapStyle3d"];
    state.obliqueEnabled = true;
    state.previewVisible = true;
    const view = renderHook(() => useLibreLayers());
    const terrain = state.runtimes[0];
    expect(state.acquireZoomLimit).toHaveBeenCalledWith(
      state.map,
      "test-dem-source",
      13
    );
    expect(terrain.setTileDemandPaused).toHaveBeenLastCalledWith(true);
    state.previewVisible = false;
    view.rerender();
    expect(terrain.setTileDemandPaused).toHaveBeenLastCalledWith(true);
    state.currentStyle = MapStyleKeys.TOPO;
    view.rerender();
    expect(terrain.setTileDemandPaused).toHaveBeenLastCalledWith(false);
    expect(terrain.setGroundVisible).toHaveBeenLastCalledWith(true);
    expect(state.buildTerrain).toHaveBeenCalledOnce();
  });
  it("keeps Karte DEM demand active through a preview without rebuilding or releasing terrain", () => {
    state.map = { getCenter: () => ({ lng: 7.2, lat: 51.27 }) };
    state.addons = ["obliqueViewer"];
    state.obliqueEnabled = true;
    state.previewVisible = true;
    const view = renderHook(() => useLibreLayers());
    const terrain = state.runtimes[0];
    expect(terrain.setTileDemandPaused).toHaveBeenLastCalledWith(true);
    expect(state.acquireDemandPause).toHaveBeenCalledWith(
      state.map,
      "test-dem-source"
    );
    expect(state.acquireDemandPause).toHaveBeenCalledOnce();
    const releaseAerialPause = state.demandPauseReleases[0];
    state.currentStyle = MapStyleKeys.TOPO;
    view.rerender();
    expect(releaseAerialPause).toHaveBeenCalledOnce();
    expect(state.acquireDemandPause).toHaveBeenCalledOnce();
    expect(terrain.setTileDemandPaused).toHaveBeenLastCalledWith(false);
    expect(terrain.setGroundVisible).toHaveBeenLastCalledWith(true);
    state.previewVisible = false;
    view.rerender();
    expect(state.acquireDemandPause).toHaveBeenCalledOnce();
    expect(terrain.setTileDemandPaused).toHaveBeenLastCalledWith(false);
    expect(state.buildTerrain).toHaveBeenCalledOnce();
    expect(state.runtimes[0]).toBe(terrain);
    expect(terrain.dispose).not.toHaveBeenCalled();
    expect(state.unregisters[0]).not.toHaveBeenCalled();
    state.currentStyle = MapStyleKeys.AERIAL;
    state.previewVisible = true;
    view.rerender();
    expect(state.acquireDemandPause).toHaveBeenCalledTimes(2);
    expect(terrain.setTileDemandPaused).toHaveBeenLastCalledWith(true);
    state.currentStyle = MapStyleKeys.TOPO;
    view.rerender();
    expect(state.demandPauseReleases[1]).toHaveBeenCalledOnce();
    expect(state.acquireDemandPause).toHaveBeenCalledTimes(2);
    expect(terrain.setTileDemandPaused).toHaveBeenLastCalledWith(false);
    expect(state.buildTerrain).toHaveBeenCalledOnce();
    expect(terrain.dispose).not.toHaveBeenCalled();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => structuredClone(state.sourceParityStyle),
      })
    );
    state.currentStyle = MapStyleKeys.AERIAL;
    state.obliqueEnabled = false;
    state.previewVisible = false;
    state.map = null;
    state.leases = [];
    state.runtimes = [];
    state.pendingTerrain = [];
    state.unregisters = [];
    state.restores = [];
    state.demandPauseReleases = [];
    state.terrainUsable = true;
    state.shadedReady = false;
    state.presentationListeners.clear();
    state.contentListeners.clear();
    state.sceneRuntimes = [];
    state.layers = [];
    state.pathname = "/";
    state.search = "";
    state.shadow = undefined;
    state.addons = [];
    state.overrides = undefined;
    state.backgroundOptions = [];
  });

  it("leaves a bridge mask off the map unless the url names its insert", () => {
    state.layers = [bridgeMask];
    expect(drawnIds()).toEqual([]);
    state.search = "?mask=buga-bruecke";
    expect(drawnIds()).toEqual(["buga-bruecke"]);
  });

  it("drops the base map when the drawn user layers are only standalone meshes", () => {
    state.layers = [standaloneMesh, bridgeMask];
    drawnIds();
    expect(lastBackgroundOptions()).toMatchObject({ standaloneMeshOnly: true });
    state.search = "?mask=buga-bruecke";
    drawnIds();
    expect(lastBackgroundOptions()).toMatchObject({
      standaloneMeshOnly: false,
    });
  });

  it("keeps the base map while a conditional mesh is not drawn", () => {
    state.layers = [pmShowMesh];
    expect(drawnIds()).toEqual([]);
    expect(lastBackgroundOptions()).toMatchObject({
      standaloneMeshOnly: false,
    });
    state.pathname = "/pm-show";
    expect(drawnIds()).toEqual(["pm-show-mesh"]);
    expect(lastBackgroundOptions()).toMatchObject({ standaloneMeshOnly: true });
  });

  it("gates the remembered vector override by the active route presentation", () => {
    state.shadow = { enabled: true, overrideBaseMapWithVectorStyle: true };
    const view = renderHook(() => useLibreLayers());
    expect(lastBackgroundOptions()).toMatchObject({
      mapStyle3dActive: false,
      vectorBaseOverride: false,
    });
    state.addons = ["mapStyle3d"];
    view.rerender();
    expect(lastBackgroundOptions()).toMatchObject({
      mapStyle3dActive: true,
      vectorBaseOverride: true,
    });
    state.addons = [];
    view.rerender();
    expect(lastBackgroundOptions()).toMatchObject({
      mapStyle3dActive: false,
      vectorBaseOverride: false,
    });
  });

  it("follows addon-manager suspension and activation", () => {
    state.shadow = { enabled: true, overrideBaseMapWithVectorStyle: true };
    state.addons = ["mapStyle3d"];
    state.overrides = { suspended: ["mapStyle3d"], enabled: [] };
    const view = renderHook(() => useLibreLayers());
    expect(lastBackgroundOptions()).toMatchObject({
      mapStyle3dActive: false,
      vectorBaseOverride: false,
    });
    state.addons = [];
    state.overrides = { suspended: [], enabled: ["mapStyle3d"] };
    view.rerender();
    expect(lastBackgroundOptions()).toMatchObject({
      mapStyle3dActive: true,
      vectorBaseOverride: true,
    });
  });

  it("applies the vector override only while shadows are on", () => {
    state.addons = ["mapStyle3d"];
    state.shadow = { enabled: true, overrideBaseMapWithVectorStyle: true };
    drawnIds();
    expect(lastBackgroundOptions()).toMatchObject({ vectorBaseOverride: true });
    state.shadow = { enabled: false, overrideBaseMapWithVectorStyle: true };
    drawnIds();
    expect(lastBackgroundOptions()).toMatchObject({
      vectorBaseOverride: false,
    });
  });

  it("uses oblique route vector base map without shadows and respects suspension", () => {
    state.addons = obliqueFachzwilling.addons ?? [];
    const view = renderHook(() => useLibreLayers());

    expect(state.shadow).toBeUndefined();
    expect(lastBackgroundOptions()).toMatchObject({
      mapStyle3dActive: true,
      vectorBaseOverride: true,
    });

    state.overrides = { suspended: ["mapStyle3d"], enabled: [] };
    view.rerender();
    expect(lastBackgroundOptions()).toMatchObject({
      mapStyle3dActive: false,
      vectorBaseOverride: false,
    });

    state.addons = [];
    state.overrides = undefined;
    view.rerender();
    expect(lastBackgroundOptions()).toMatchObject({
      mapStyle3dActive: false,
      vectorBaseOverride: false,
    });
  });
  it.each(["disabled", "unregistered", "suspended"])(
    "does not own an Oblique basis when the viewer is %s",
    (reason) => {
      state.map = { getCenter: () => ({ lng: 7.2, lat: 51.27 }) };
      state.obliqueEnabled = reason !== "disabled";
      state.addons = reason === "unregistered" ? [] : ["obliqueViewer"];
      state.overrides =
        reason === "suspended"
          ? { suspended: ["obliqueViewer"], enabled: [] }
          : undefined;
      expect(drawnIds()).toEqual([]);
      expect(state.setCurrentStyle).not.toHaveBeenCalled();
      expect(state.leases).toEqual([]);
      expect(state.buildTerrain).not.toHaveBeenCalled();
      expect(lastBackgroundOptions()).toMatchObject({
        meshBaseActive: false,
        mapStyle3dActive: false,
        vectorBaseOverride: false,
        shadowTerrainActive: false,
      });
    }
  );

  it("loads the parity mesh and leases the explicitly enabled map style", async () => {
    state.map = { getCenter: () => ({ lng: 7.2, lat: 51.27 }) };
    state.addons = [
      "obliqueViewer",
      { addon: "mapStyle3d", config: { vectorBaseMap: true } },
    ];
    const view = renderHook(() => useLibreLayers());
    expect(view.result.current).toEqual([]);
    state.obliqueEnabled = true;
    view.rerender();
    expect(view.result.current).toEqual([]);
    expect(fetch).toHaveBeenCalledWith(OBLIQUE_MESH_2024_STYLE_URI, {
      signal: expect.any(AbortSignal),
    });
    await waitFor(() => expect(view.result.current).toHaveLength(1));
    expect(view.result.current).toEqual([
      expect.objectContaining({
        type: "vector",
        name: "oblique-mesh2024",
        carmaLayerId: "__oblique-basemap",
        style: expectedParityStyle,
      }),
    ]);
    expect(state.layers).toEqual([]);
    expect(state.setCurrentStyle).toHaveBeenCalledOnce();
    expect(state.setCurrentStyle).toHaveBeenCalledWith(MapStyleKeys.AERIAL);
    expect(state.leases).toHaveLength(2);
    expect(state.leases[0].options).toEqual({ mapStylePresentation: true });
    expect(state.leases[0].setPointLabelOverlayVisible).toHaveBeenCalledWith(
      true
    );
    expect(lastBackgroundOptions()).toMatchObject({
      mapStyle3dActive: true,
      vectorBaseOverride: true,
      meshBaseActive: true,
      shadowTerrainActive: false,
      standaloneMeshOnly: false,
    });
    view.rerender();
    expect(state.setCurrentStyle).toHaveBeenCalledTimes(1);
    expect(state.leases).toHaveLength(2);
    state.obliqueEnabled = false;
    view.rerender();
    expect(view.result.current).toEqual([]);
    expect(state.leases[0].release).toHaveBeenCalledOnce();
    expect(state.leases[1].release).toHaveBeenCalledOnce();
    expect(state.runtimes[0].dispose).toHaveBeenCalledOnce();
    expect(lastBackgroundOptions()).toMatchObject({
      mapStyle3dActive: true,
      meshBaseActive: false,
    });
    state.obliqueEnabled = true;
    view.rerender();
    expect(state.setCurrentStyle).toHaveBeenCalledTimes(2);
  });

  it("keeps one DEM runtime while leasing raster presentation only in Karte without point labels", async () => {
    state.map = { getCenter: () => ({ lng: 7.2, lat: 51.27 }) };
    state.addons = ["obliqueViewer"];
    state.obliqueEnabled = true;
    const view = renderHook(() => useLibreLayers());
    await waitFor(() => expect(view.result.current).toHaveLength(1));
    expect(view.result.current[0]).toMatchObject({ name: "oblique-mesh2024" });
    expect(lastBackgroundOptions()).toMatchObject({
      mapStyle3dActive: false,
      vectorBaseOverride: false,
      meshBaseActive: true,
    });
    expect(state.buildTerrain).toHaveBeenCalledOnce();
    expect(state.leases).toHaveLength(1);
    const runtime = state.runtimes[0];
    state.currentStyle = MapStyleKeys.TOPO;
    view.rerender();
    expect(view.result.current[0]).toMatchObject({ name: "oblique-lod2" });
    expect(lastBackgroundOptions()).toMatchObject({
      mapStyle3dActive: false,
      vectorBaseOverride: false,
      shadowTerrainActive: true,
    });
    expect(state.buildTerrain).toHaveBeenCalledOnce();
    expect(state.runtimes[0]).toBe(runtime);
    expect(runtime.dispose).not.toHaveBeenCalled();
    expect(state.leases).toHaveLength(2);
    const presentation = state.leases[1];
    expect(presentation.options).toEqual({ mapStylePresentation: true });
    expect(presentation.setMeshLabelStyle).toHaveBeenCalledWith(false);
    expect(presentation.setPointLabelOverlayVisible).not.toHaveBeenCalled();
    expect(state.leases[0].options).toBeUndefined();
    expect(state.leases[0].setPointLabelOverlayVisible).not.toHaveBeenCalled();
    await act(async () => state.pendingTerrain[0](true));
    expect(state.acquireComposition).not.toHaveBeenCalled();
    state.currentStyle = MapStyleKeys.AERIAL;
    view.rerender();
    expect(presentation.release).toHaveBeenCalledOnce();
    expect(state.buildTerrain).toHaveBeenCalledOnce();
    expect(state.runtimes[0]).toBe(runtime);
    expect(runtime.dispose).not.toHaveBeenCalled();
    view.unmount();
    expect(presentation.release).toHaveBeenCalledOnce();
    expect(state.leases[0].release).toHaveBeenCalledOnce();
  });

  it("reuses the DEM through Luftbild/Karte switches without suppressing native paint from readiness", async () => {
    state.map = { getCenter: () => ({ lng: 7.2, lat: 51.27 }) };
    state.addons = [
      "obliqueViewer",
      { addon: "mapStyle3d", config: { vectorBaseMap: true } },
    ];
    state.obliqueEnabled = true;
    const view = renderHook(() => useLibreLayers());
    const presentation = state.leases[0];
    expect(state.buildTerrain).toHaveBeenCalledOnce();
    expect(state.buildTerrain.mock.calls[0][3]).toMatchObject({
      groundVisible: false,
    });
    expect(state.runtimes[0].setGroundVisible).toHaveBeenLastCalledWith(false);
    state.currentStyle = MapStyleKeys.TOPO;
    view.rerender();
    expect(view.result.current).toEqual([
      expect.objectContaining({
        name: "oblique-lod2",
        style: OBLIQUE_LOD2_STYLE,
      }),
    ]);
    expect(state.setCurrentStyle).toHaveBeenCalledTimes(1);
    expect(lastBackgroundOptions()).toMatchObject({
      meshBaseActive: false,
      shadowTerrainActive: true,
      vectorBaseOverride: true,
    });
    expect(state.buildTerrain).toHaveBeenCalledWith(
      "carma-oblique-terrain",
      { id: "test-terrain" },
      [7.2, 51.27],
      expect.objectContaining({
        geometryProjection: "ecef",
        receivesMapStyleTexture: true,
        material: { unlit: true },
        errorTargetPixels: 1,
        motionErrorTargetPixels: 4,
        maximumMeshSegments: 128,
      })
    );
    const terrain = state.runtimes[0];
    const terrainLease = state.leases[1];
    expect(terrain.setGroundVisible).toHaveBeenLastCalledWith(true);
    expect(terrainLease.layer.addRuntime).toHaveBeenCalledWith(terrain);
    expect(state.acquireComposition).not.toHaveBeenCalled();
    await act(async () => {
      state.pendingTerrain[0](true);
    });
    expect(state.acquireComposition).not.toHaveBeenCalled();
    expect(state.leases).toHaveLength(3);
    const rasterOverride = state.leases[2];
    expect(rasterOverride.setMeshLabelStyle).toHaveBeenCalledWith(false);
    const options = state.buildTerrain.mock.calls[0][3] as {
      onContentChanged: (bounds: unknown) => void;
    };
    const bounds = [0, 0, 1, 1];
    options.onContentChanged(bounds);
    expect(state.notifyChanged).toHaveBeenCalledWith(state.map, { bounds });
    state.currentStyle = MapStyleKeys.AERIAL;
    view.rerender();
    await waitFor(() =>
      expect(view.result.current[0]).toMatchObject({
        name: "oblique-mesh2024",
        style: expectedParityStyle,
      })
    );
    expect(rasterOverride.release).toHaveBeenCalledOnce();
    expect(state.buildTerrain).toHaveBeenCalledOnce();
    expect(state.runtimes).toEqual([terrain]);
    expect(terrain.setGroundVisible).toHaveBeenLastCalledWith(false);
    expect(state.unregisters[0]).not.toHaveBeenCalled();
    expect(terrainLease.layer.removeRuntime).not.toHaveBeenCalled();
    expect(terrain.dispose).not.toHaveBeenCalled();
    expect(state.restores).toHaveLength(0);
    expect(terrainLease.release).not.toHaveBeenCalled();
    expect(presentation.release).not.toHaveBeenCalled();
    state.currentStyle = MapStyleKeys.TOPO;
    view.rerender();
    expect(state.buildTerrain).toHaveBeenCalledOnce();
    expect(state.runtimes[0]).toBe(terrain);
    expect(terrain.setGroundVisible.mock.calls).toEqual([
      [false],
      [true],
      [false],
      [true],
    ]);
    view.unmount();
    expect(state.unregisters[0]).toHaveBeenCalledOnce();
    expect(terrainLease.layer.removeRuntime).toHaveBeenCalledWith(terrain.id);
    expect(terrain.dispose).toHaveBeenCalledOnce();
    expect(state.restores).toHaveLength(0);
    expect(terrainLease.release).toHaveBeenCalledOnce();
    expect(presentation.release).toHaveBeenCalledOnce();
  });

  it("owns a Karte mesh-label override even when MapStyle3d already has presentation", () => {
    state.map = { getCenter: () => ({ lng: 7.2, lat: 51.27 }) };
    state.addons = [
      "obliqueViewer",
      { addon: "mapStyle3d", config: { vectorBaseMap: true } },
    ];
    state.obliqueEnabled = true;
    state.currentStyle = MapStyleKeys.TOPO;
    const view = renderHook(() => useLibreLayers());
    expect(state.leases).toHaveLength(3);
    expect(
      state.leases.filter((lease) => lease.options?.mapStylePresentation)
    ).toHaveLength(2);
    const presentation = state.leases[0],
      rasterOverride = state.leases[2],
      terrain = state.runtimes[0];
    expect(rasterOverride.setMeshLabelStyle).toHaveBeenCalledWith(false);
    expect(rasterOverride.setPointLabelOverlayVisible).not.toHaveBeenCalled();
    state.currentStyle = MapStyleKeys.AERIAL;
    view.rerender();
    expect(state.leases).toHaveLength(3);
    expect(rasterOverride.release).toHaveBeenCalledOnce();
    expect(presentation.release).not.toHaveBeenCalled();
    expect(state.runtimes[0]).toBe(terrain);
    expect(state.buildTerrain).toHaveBeenCalledOnce();
    expect(state.acquireComposition).not.toHaveBeenCalled();
    view.unmount();
    expect(presentation.release).toHaveBeenCalledOnce();
    expect(rasterOverride.release).toHaveBeenCalledOnce();
  });

  it("starts Karte hidden until scene ownership is checked, then displays DEM ground", () => {
    state.map = { getCenter: () => ({ lng: 7.2, lat: 51.27 }) };
    state.addons = ["obliqueViewer"];
    state.obliqueEnabled = true;
    state.currentStyle = MapStyleKeys.TOPO;
    const view = renderHook(() => useLibreLayers());
    expect(state.buildTerrain.mock.calls[0][3]).toMatchObject({
      groundVisible: false,
    });
    expect(state.runtimes[0].setGroundVisible).toHaveBeenLastCalledWith(true);
    view.unmount();
    expect(state.runtimes[0].dispose).toHaveBeenCalledOnce();
  });

  it("keeps Karte terrain hidden until the old mesh has left the scene", () => {
    state.map = { getCenter: () => ({ lng: 7.2, lat: 51.27 }) };
    state.addons = ["obliqueViewer"];
    state.obliqueEnabled = true;
    state.shadedReady = true;
    state.sceneRuntimes = [{ id: "mesh2024", providesTerrain: true }];
    const view = renderHook(() => useLibreLayers());
    const terrain = state.runtimes[0];
    expect(state.acquireComposition).toHaveBeenCalledOnce();
    const restore = state.restores[0];

    state.currentStyle = MapStyleKeys.TOPO;
    view.rerender();
    expect(terrain.setGroundVisible).toHaveBeenLastCalledWith(false);
    expect(terrain.setTileDemandPaused).toHaveBeenLastCalledWith(true);
    expect(restore).not.toHaveBeenCalled();
    act(() => {
      state.shadedReady = false;
      state.presentationListeners.forEach((listener) => listener());
    });
    expect(terrain.setGroundVisible).toHaveBeenLastCalledWith(false);
    expect(restore).not.toHaveBeenCalled();

    act(() => {
      state.sceneRuntimes = [
        { id: "carma-oblique-terrain", providesTerrain: true },
        { id: "lod2", providesTerrain: false },
        {
          id: "map-drape",
          providesTerrain: true,
          mapStyleProjectionBlend: "replace",
        },
      ];
      state.contentListeners.forEach((listener) => listener());
    });
    expect(terrain.setGroundVisible).toHaveBeenLastCalledWith(true);
    expect(terrain.setTileDemandPaused).toHaveBeenLastCalledWith(false);
    expect(restore).toHaveBeenCalledOnce();
    expect(state.buildTerrain).toHaveBeenCalledOnce();
    expect(terrain.dispose).not.toHaveBeenCalled();
  });

  it("does not release terrain after a delayed mesh-removal event when already back in Aerial", () => {
    state.map = { getCenter: () => ({ lng: 7.2, lat: 51.27 }) };
    state.addons = ["obliqueViewer"];
    state.obliqueEnabled = true;
    state.sceneRuntimes = [{ id: "mesh2024", providesTerrain: true }];
    const view = renderHook(() => useLibreLayers());
    const terrain = state.runtimes[0];
    state.currentStyle = MapStyleKeys.TOPO;
    view.rerender();
    const oldListeners = [...state.contentListeners];
    state.currentStyle = MapStyleKeys.AERIAL;
    view.rerender();
    terrain.setGroundVisible.mockClear();
    terrain.setTileDemandPaused.mockClear();
    act(() => {
      state.sceneRuntimes = [];
      state.shadedReady = false;
      oldListeners.forEach((listener) => listener());
      state.contentListeners.forEach((listener) => listener());
      state.presentationListeners.forEach((listener) => listener());
    });
    expect(terrain.setGroundVisible).not.toHaveBeenCalledWith(true);
    expect(terrain.setTileDemandPaused).not.toHaveBeenCalledWith(false);
    expect(terrain.setGroundVisible).toHaveBeenLastCalledWith(false);
    expect(terrain.setTileDemandPaused).toHaveBeenLastCalledWith(true);
    expect(state.buildTerrain).toHaveBeenCalledOnce();
    view.unmount();
    expect(state.contentListeners.size).toBe(0);
    expect(state.presentationListeners.size).toBe(0);
  });

  it("accepts late DEM readiness in Luftbild after a Karte switch without rebuilding the runtime", async () => {
    state.map = { getCenter: () => ({ lng: 7.2, lat: 51.27 }) };
    state.addons = ["obliqueViewer"];
    state.obliqueEnabled = true;
    const view = renderHook(() => useLibreLayers());
    const terrain = state.runtimes[0],
      lease = state.leases[0];
    state.currentStyle = MapStyleKeys.TOPO;
    view.rerender();
    state.currentStyle = MapStyleKeys.AERIAL;
    view.rerender();
    await act(async () => state.pendingTerrain[0](true));
    expect(state.buildTerrain).toHaveBeenCalledOnce();
    expect(state.runtimes[0]).toBe(terrain);
    expect(terrain.dispose).not.toHaveBeenCalled();
    expect(state.acquireComposition).not.toHaveBeenCalled();
    view.unmount();
    expect(terrain.dispose).toHaveBeenCalledOnce();
    expect(lease.release).toHaveBeenCalledOnce();
  });

  it.each([
    { ready: false, usable: true },
    { ready: true, usable: false },
  ])(
    "keeps native ground paint when terrain readiness is $ready and usability is $usable",
    async ({ ready, usable }) => {
      state.map = { getCenter: () => ({ lng: 7.2, lat: 51.27 }) };
      state.addons = ["obliqueViewer"];
      state.obliqueEnabled = true;
      state.terrainUsable = usable;
      const view = renderHook(() => useLibreLayers());
      state.currentStyle = MapStyleKeys.TOPO;
      view.rerender();
      await act(async () => {
        state.pendingTerrain[0](ready);
      });
      expect(state.acquireComposition).not.toHaveBeenCalled();
      view.unmount();
      expect(state.runtimes[0].dispose).toHaveBeenCalledOnce();
      expect(state.unregisters[0]).toHaveBeenCalledOnce();
    }
  );

  it.each(["map", "off", "suspended", "unmount"])(
    "ignores late terrain readiness after %s and releases the terrain runtime",
    async (exit) => {
      state.map = { getCenter: () => ({ lng: 7.2, lat: 51.27 }) };
      state.addons = ["obliqueViewer"];
      state.obliqueEnabled = true;
      const view = renderHook(() => useLibreLayers());
      state.currentStyle = MapStyleKeys.TOPO;
      view.rerender();
      if (exit === "unmount") view.unmount();
      else {
        if (exit === "map")
          state.map = { getCenter: () => ({ lng: 7.3, lat: 51.3 }) };
        if (exit === "off") state.obliqueEnabled = false;
        if (exit === "suspended")
          state.overrides = { suspended: ["obliqueViewer"], enabled: [] };
        view.rerender();
      }
      await act(async () => {
        state.pendingTerrain[0](true);
      });
      expect(state.acquireComposition).not.toHaveBeenCalled();
      expect(state.unregisters[0]).toHaveBeenCalledOnce();
      expect(state.leases[0].layer.removeRuntime).toHaveBeenCalledWith(
        "carma-oblique-terrain"
      );
      expect(state.runtimes[0].dispose).toHaveBeenCalledOnce();
      expect(state.leases[0].release).toHaveBeenCalledOnce();
    }
  );

  it("draws managed tileset URLs once and restores their explicit stack entries when the viewer is off", async () => {
    const mesh = {
      id: "explicit-mesh",
      visible: true,
      conf: {
        "3d": { tilesetUrl: "https://example.test/mesh2024/tileset.json" },
      },
    };
    const lod2 = {
      id: "explicit-lod2",
      visible: true,
      props: { style: OBLIQUE_LOD2_STYLE },
    };
    const custom = {
      id: "different-mesh",
      visible: true,
      conf: {
        "3d": {
          tilesetUrl: "https://example.test/mesh2024/tileset.json?custom=1",
        },
      },
    };
    state.layers = [mesh, lod2, custom];
    state.obliqueEnabled = true;
    state.addons = ["obliqueViewer"];
    const view = renderHook(() => useLibreLayers());
    await waitFor(() => expect(view.result.current).toHaveLength(2));
    expect(view.result.current).toEqual([
      expect.objectContaining({ carmaLayerId: "__oblique-basemap" }),
      { id: "different-mesh" },
    ]);
    expect(state.layers).toEqual([mesh, lod2, custom]);
    state.obliqueEnabled = false;
    view.rerender();
    expect(view.result.current).toEqual([
      { id: "explicit-mesh" },
      { id: "explicit-lod2" },
      { id: "different-mesh" },
    ]);
  });

  it("switches an explicitly selected MeshX basis to raster-draped terrain and LOD2 on Karte", async () => {
    const meshX = {
      id: "explicit-meshx",
      visible: true,
      conf: {
        "3d": { tilesetUrl: "https://example.test/meshx2024/tileset.json" },
      },
    };
    state.layers = [meshX];
    state.addons = ["obliqueViewer"];
    state.obliqueEnabled = true;
    state.map = { getCenter: () => ({ lng: 7.2, lat: 51.27 }) };
    const view = renderHook(() => useLibreLayers());
    await waitFor(() => expect(view.result.current).toHaveLength(1));
    expect(view.result.current[0]).toMatchObject({ name: "oblique-mesh2024" });
    const terrain = state.runtimes[0];
    state.currentStyle = MapStyleKeys.TOPO;
    view.rerender();
    expect(view.result.current).toEqual([
      expect.objectContaining({ name: "oblique-lod2" }),
    ]);
    expect(terrain.setGroundVisible).toHaveBeenLastCalledWith(true);
    expect(lastBackgroundOptions()).toMatchObject({
      meshBaseActive: false,
      shadowTerrainActive: true,
      vectorBaseOverride: false,
    });
    expect(state.layers).toEqual([meshX]);
    state.currentStyle = MapStyleKeys.AERIAL;
    view.rerender();
    expect(view.result.current).toEqual([
      expect.objectContaining({ name: "oblique-mesh2024" }),
    ]);
    expect(terrain.setGroundVisible).toHaveBeenLastCalledWith(false);
    expect(state.buildTerrain).toHaveBeenCalledOnce();
  });

  it("hides native ground paint once the aerial mesh is presented and restores it on exit", () => {
    state.map = { getCenter: () => ({ lng: 7.2, lat: 51.27 }) };
    state.addons = ["obliqueViewer"];
    state.obliqueEnabled = true;
    const view = renderHook(() => useLibreLayers());
    expect(state.acquireComposition).not.toHaveBeenCalled();
    act(() => {
      state.shadedReady = true;
      for (const listener of state.presentationListeners) listener();
    });
    expect(state.acquireComposition).toHaveBeenCalledOnce();
    act(() => {
      for (const listener of state.presentationListeners) listener();
    });
    expect(state.acquireComposition).toHaveBeenCalledOnce();
    state.obliqueEnabled = false;
    view.rerender();
    expect(state.restores[0]).toHaveBeenCalledOnce();
    expect(state.presentationListeners.size).toBe(0);
  });

  it("releases aerial suppression if the shared mesh is no longer presented", () => {
    state.map = { getCenter: () => ({ lng: 7.2, lat: 51.27 }) };
    state.addons = ["obliqueViewer"];
    state.obliqueEnabled = true;
    state.shadedReady = true;
    const view = renderHook(() => useLibreLayers());
    expect(state.acquireComposition).toHaveBeenCalledOnce();
    act(() => {
      state.shadedReady = false;
      for (const listener of state.presentationListeners) listener();
    });
    expect(state.restores[0]).toHaveBeenCalledOnce();
    view.unmount();
    expect(state.restores[0]).toHaveBeenCalledOnce();
  });

  it("ignores a late parity response after the viewer is disabled", async () => {
    let deliver!: (response: unknown) => void;
    vi.mocked(fetch).mockReturnValueOnce(
      new Promise((resolve) => {
        deliver = resolve;
      }) as Promise<Response>
    );
    state.addons = ["obliqueViewer"];
    state.obliqueEnabled = true;
    const view = renderHook(() => useLibreLayers());
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
    expect(view.result.current).toEqual([]);
    state.obliqueEnabled = false;
    view.rerender();
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      deliver({
        ok: true,
        json: async () => structuredClone(state.sourceParityStyle),
      });
    });
    expect(view.result.current).toEqual([]);
    expect(lastBackgroundOptions().meshBaseActive).toBe(false);
  });

  it("does not claim a mesh basis for ordinary MapStyle3d aerial rendering", () => {
    state.addons = [{ addon: "mapStyle3d", config: { vectorBaseMap: true } }];
    drawnIds();
    expect(lastBackgroundOptions()).toMatchObject({
      mapStyle3dActive: true,
      vectorBaseOverride: true,
      meshBaseActive: false,
      shadowTerrainActive: false,
    });
    expect(state.buildTerrain).not.toHaveBeenCalled();
  });
});
