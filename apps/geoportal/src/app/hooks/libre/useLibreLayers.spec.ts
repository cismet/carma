import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Layer } from "@carma-mapping/layers";
import type { AddonEntry, AddonOverridesState } from "@carma-mapping/addons";
import { obliqueFachzwilling } from "../../constants/fachzwillinge/oblique";

const state = vi.hoisted(() => ({
  layers: [] as unknown[],
  pathname: "/",
  search: "",
  shadow: undefined as Record<string, unknown> | undefined,
  addons: [] as AddonEntry[],
  overrides: undefined as AddonOverridesState | undefined,
  backgroundOptions: [] as Array<Record<string, unknown>>,
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
});
