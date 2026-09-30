import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Layer } from "@carma-mapping/layers";

const state = vi.hoisted(() => ({
  layers: [] as unknown[],
  pathname: "/",
  search: "",
  shadow: undefined as Record<string, unknown> | undefined,
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
vi.mock("@carma-mapping/addons", async () => {
  // The real condition check, not the addon barrel.
  const { conditionRouteOf, isShownByCondition } = await vi.importActual<
    typeof import("../../../../../../libraries/mapping/addons/src/addons/ConditionalLayer")
  >("../../../../../../libraries/mapping/addons/src/addons/ConditionalLayer");
  return {
    conditionRouteOf,
    isShownByCondition,
    useAddonState: () => [state.shadow],
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

  it("switches to the vector base only while shadows are on", () => {
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
