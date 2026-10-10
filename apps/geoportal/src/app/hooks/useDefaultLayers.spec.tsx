import type { PropsWithChildren } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadStyle, parseLayer } = vi.hoisted(() => ({
  loadStyle: vi.fn(),
  parseLayer: vi.fn(),
}));

vi.mock("@carma-mapping/layers", () => ({
  loadVectorStyle: loadStyle,
  styleUrlTitle: () => "Style fallback",
  buildVectorStyleItem: ({
    id,
    style,
  }: {
    id: string;
    style: { title: string };
  }) => ({
    item: { id, title: style.title },
  }),
}));
vi.mock("@carma-mapping/utils", () => ({ parseToMapLayer: parseLayer }));
vi.mock("@carma-commons/utils", () => ({ isAvailable: () => true }));
vi.mock("../config/availability", () => ({ availabilityContext: {} }));
vi.mock("../constants/discover", () => ({
  layerCatalogConfig: { vectorTileServerUrl: "https://tiles.cismet.de" },
}));
vi.mock("../store/slices/mapping", () => ({
  getLayerStack: (state: TestState) => state.mapping.layers,
  getHiddenPermanentLayers: (state: TestState) => state.mapping.hidden,
  appendLayer: (payload: TestLayer) => ({ type: "append", payload }),
  changeVisibility: (payload: { id: string; visible: boolean }) => ({
    type: "visibility",
    payload,
  }),
}));

import type { DefaultLayer } from "../constants/default-layers";
import { useDefaultLayers } from "./useDefaultLayers";

const meshUrl = "https://tiles.cismet.de/lod2/mesh2024.style.json";
const meshId = `custom:${meshUrl}`;
// An explicitly configured route can still seed a persistent layer; Oblique
// itself now owns its basis at runtime instead of declaring route defaults.
const meshLayers: DefaultLayer[] = [{ styleUrl: meshUrl }];

type TestLayer = {
  id: string;
  title: string;
  visible: boolean;
  permanent?: boolean;
  pinned?: string;
};
type TestState = { mapping: { layers: TestLayer[]; hidden: string[] } };

const createStore = (layers: TestLayer[] = [], hidden: string[] = []) =>
  configureStore({
    reducer: {
      mapping: (
        state = { layers, hidden },
        action: {
          type: string;
          payload?: TestLayer & { hidden?: string[] };
        }
      ) => {
        if (action.type === "append" && action.payload) {
          return { ...state, layers: [...state.layers, action.payload] };
        }
        if (action.type === "hidden") {
          return { ...state, hidden: action.payload?.hidden ?? [] };
        }
        if (action.type === "visibility" && action.payload) {
          const { id, visible } = action.payload;
          return {
            ...state,
            layers: state.layers.map((layer) =>
              layer.id === id ? { ...layer, visible } : layer
            ),
          };
        }
        return state;
      },
    },
  });

const wrapperFor =
  (store: ReturnType<typeof createStore>) =>
  ({ children }: PropsWithChildren) =>
    <Provider store={store}>{children}</Provider>;

describe("route default layers", () => {
  beforeEach(() => {
    loadStyle.mockReset().mockResolvedValue({ title: "3D-MeshX 2024" });
    parseLayer.mockReset().mockImplementation(async (item, _zoom, visible) => ({
      ...item,
      visible,
    }));
  });

  it("loads the route mesh once with the style's title and default-layer placement", async () => {
    const store = createStore();
    const { rerender } = renderHook(
      () => useDefaultLayers("/oblique", meshLayers),
      {
        wrapper: wrapperFor(store),
      }
    );
    await waitFor(() =>
      expect(store.getState().mapping.layers).toHaveLength(1)
    );
    rerender();
    expect(loadStyle).toHaveBeenCalledTimes(1);
    expect(loadStyle).toHaveBeenCalledWith(meshUrl, "https://tiles.cismet.de");
    expect(store.getState().mapping.layers[0]).toMatchObject({
      id: meshId,
      title: "3D-MeshX 2024",
      visible: true,
      permanent: true,
      pinned: "first",
    });
  });

  it("keeps the plain geoportal's defaults on its own route", async () => {
    const store = createStore();
    renderHook(() => useDefaultLayers("/"), { wrapper: wrapperFor(store) });
    await waitFor(() =>
      expect(store.getState().mapping.layers).toHaveLength(1)
    );
    expect(loadStyle).toHaveBeenCalledWith(
      "https://tiles.cismet.de/schwebebahn/default.style.json",
      "https://tiles.cismet.de"
    );
  });

  it.each(["/gesundheit", "/oblique", undefined])(
    "seeds nothing on an unconfigured route %s",
    (path) => {
      const store = createStore();
      renderHook(() => useDefaultLayers(path), { wrapper: wrapperFor(store) });
      expect(loadStyle).not.toHaveBeenCalled();
      expect(store.getState().mapping.layers).toEqual([]);
    }
  );

  it("does not duplicate an already persisted mesh row", async () => {
    const existing = { id: meshId, title: "3D-MeshX 2024", visible: true };
    const store = createStore([existing]);
    renderHook(() => useDefaultLayers("/oblique", meshLayers), {
      wrapper: wrapperFor(store),
    });
    await waitFor(() => expect(parseLayer).toHaveBeenCalled());
    expect(store.getState().mapping.layers).toEqual([existing]);
  });

  it("restores hidden mesh visibility and follows the layer eye", async () => {
    const store = createStore([], [meshId]);
    renderHook(() => useDefaultLayers("/oblique", meshLayers), {
      wrapper: wrapperFor(store),
    });
    await waitFor(() =>
      expect(store.getState().mapping.layers).toHaveLength(1)
    );
    expect(store.getState().mapping.layers[0].visible).toBe(false);
    act(() => {
      store.dispatch({ type: "hidden", payload: { hidden: [] } });
    });
    expect(store.getState().mapping.layers[0].visible).toBe(true);
  });
});
