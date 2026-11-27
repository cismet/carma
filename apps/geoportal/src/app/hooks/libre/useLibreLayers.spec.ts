import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Layer } from "@carma-mapping/layers";
import type { AddonEntry, AddonOverridesState } from "@carma-mapping/addons";

const state = vi.hoisted(() => ({
  layers: [] as unknown[],
  pathname: "/",
  search: "",
  shadow: undefined as Record<string, unknown> | undefined,
  addons: [] as AddonEntry[],
  overrides: undefined as AddonOverridesState | undefined,
  backgroundOptions: [] as Array<Record<string, unknown>>,
  layerOptions: [] as unknown[],
  measurement3dServices: null as object | null,
  libre3d: false,
  selected3d: {} as Record<string, number>,
  background3dOpacityByCategory: {} as Record<string, number>,
  background3dMainOpacity: 1,
  drawnBackgrounds: [] as unknown[],
  backgroundVisible: true,
}));

const category3d = {
  id: "background",
  libre3d: [
    {
      base: "base-a",
      styles: ["models-a"],
      shadowStyles: ["models-a-shadow"],
      opacity: 0.9,
    },
    { base: "base-b", styles: ["models-b"] },
    { styles: ["models-c"] },
  ],
};

vi.mock("react-redux", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-redux")>()),
  useSelector: (select: () => unknown) => select(),
}));
vi.mock("react-router-dom", () => ({
  useLocation: () => ({ pathname: state.pathname, search: state.search }),
}));
vi.mock("../../store/slices/mapping", () => ({
  getLayers: () => state.layers,
  getBackgroundLayer: () => ({
    id: "background",
    visible: state.backgroundVisible,
  }),
  getSelected3dByCategory: () => state.selected3d,
  getBackground3dOpacityByCategory: () => state.background3dOpacityByCategory,
  getBackground3dMainOpacity: () => state.background3dMainOpacity,
}));
vi.mock("../../store/slices/ui", () => ({
  getLibre3d: () => state.libre3d,
  getLibre3dTransition: () => false,
}));
vi.mock("../../config/backgroundConfig", () => ({
  backgroundConfig: { namedLayers: {} },
  findBackgroundCategory: () => category3d,
  getLibre3dOption: (category: typeof category3d | undefined, index = 0) =>
    category?.libre3d[index] ?? category?.libre3d[0],
  toBackgroundLayer: (id: string) => ({ id, layers: id }),
}));
// Registry resolution does not render the canvas-based annotation tools.
vi.mock(
  "../../../../../../libraries/mapping/addons/src/addons/Annotation",
  () => ({
    AnnotationControl: () => null,
    AnnotationOverlay: () => null,
  })
);
vi.mock("@carma-mapping/addons", async () => {
  const { applyAddonOverrides } = await vi.importActual<
    typeof import("../../../../../../libraries/mapping/addons/src/lib/addon-overrides")
  >("../../../../../../libraries/mapping/addons/src/lib/addon-overrides");
  const { resolveAddonEntries } = await vi.importActual<
    typeof import("../../../../../../libraries/mapping/addons/src/lib/registry")
  >("../../../../../../libraries/mapping/addons/src/lib/registry");
  // Keep the real route and override rules without loading the addon barrel.
  const { conditionRouteOf, isShownByCondition } = await vi.importActual<
    typeof import("../../../../../../libraries/mapping/addons/src/addons/ConditionalLayer")
  >("../../../../../../libraries/mapping/addons/src/addons/ConditionalLayer");
  return {
    conditionRouteOf,
    isShownByCondition,
    useAddonState: () => [state.shadow],
    useMeasurement3dRuntimeServices: () => state.measurement3dServices,
    useRouteAddons: () => state.addons,
    usePersistedAddonOverrides: () => [state.overrides],
    applyAddonOverrides,
    resolveAddonEntries,
  };
});
vi.mock(
  "../../components/GeoportalMap/geoportalBackgroundToLibreLayers",
  () => ({
    geoportalBackgroundToLibreLayers: (
      backgroundLayer: unknown,
      _namedLayers: unknown,
      options: Record<string, unknown>
    ) => {
      state.drawnBackgrounds.push(backgroundLayer);
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
      geoportalLayersToLibreLayers: (
        layers: Layer[],
        options?: { skip3dMeasurementSets?: boolean }
      ) => {
        state.layerOptions.push(options);
        return layers.map((layer) => ({ id: layer.id }));
      },
    };
  }
);

import { useLibreLayers } from "./useLibreLayers";

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
  beforeEach(() => {
    state.layers = [];
    state.pathname = "/";
    state.search = "";
    state.shadow = undefined;
    state.addons = [];
    state.overrides = undefined;
    state.backgroundOptions = [];
    state.layerOptions = [];
    state.measurement3dServices = null;
    state.libre3d = false;
    state.selected3d = {};
    state.background3dOpacityByCategory = {};
    state.background3dMainOpacity = 1;
    state.drawnBackgrounds = [];
    state.backgroundVisible = true;
  });

  it("hides the 3D models with the background", () => {
    state.libre3d = true;
    state.backgroundVisible = false;

    expect(renderHook(() => useLibreLayers()).result.current).toEqual([]);
  });

  it("draws the 3D models at their default, then at their slider times the main slider", () => {
    state.libre3d = true;
    const models = () => renderHook(() => useLibreLayers()).result.current;
    const lastBaseOpacity = () =>
      (state.drawnBackgrounds.at(-1) as { opacity: number }).opacity;

    expect(models()).toEqual([
      expect.objectContaining({ style: "models-a", opacity: 0.9 }),
    ]);
    expect(lastBaseOpacity()).toBe(1);

    state.background3dOpacityByCategory = { background: 0.4 };
    state.background3dMainOpacity = 0.5;
    expect(models()).toEqual([
      expect.objectContaining({ style: "models-a", opacity: 0.2 }),
    ]);
    expect(lastBaseOpacity()).toBe(0.5);
  });

  it("draws the picked 3D option's base map and models in place of the 2D one", () => {
    const styles = () =>
      renderHook(() => useLibreLayers()).result.current.map(
        (layer) => (layer as { style?: string }).style
      );
    const lastBase = () =>
      (state.drawnBackgrounds.at(-1) as { layers: string }).layers;

    state.libre3d = true;
    expect(styles()).toEqual(["models-a"]);
    expect(lastBase()).toBe("base-a");

    state.selected3d = { background: 1 };
    expect(styles()).toEqual(["models-b"]);
    expect(lastBase()).toBe("base-b");

    // an option without a base map draws only its models
    state.selected3d = { background: 2 };
    const drawnBefore = state.drawnBackgrounds.length;
    expect(styles()).toEqual(["models-c"]);
    expect(state.drawnBackgrounds.length).toBe(drawnBefore);
  });

  it("draws the option's shadow styles while shadows are on", () => {
    state.libre3d = true;
    const styles = () =>
      renderHook(() => useLibreLayers()).result.current.map(
        (layer) => (layer as { style?: string }).style
      );

    state.shadow = { enabled: true };
    expect(styles()).toEqual(["models-a-shadow"]);

    state.shadow = { enabled: false };
    expect(styles()).toEqual(["models-a"]);

    // an option without shadow styles keeps its own
    state.shadow = { enabled: true };
    state.selected3d = { background: 1 };
    expect(styles()).toEqual(["models-b"]);
  });

  it("leaves saved 3D measurement sets to the 3D measurement only while its runtime draws them", () => {
    drawnIds();
    expect(state.layerOptions.at(-1)).toEqual({ skip3dMeasurementSets: false });
    state.measurement3dServices = {};
    drawnIds();
    expect(state.layerOptions.at(-1)).toEqual({ skip3dMeasurementSets: true });
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
});
