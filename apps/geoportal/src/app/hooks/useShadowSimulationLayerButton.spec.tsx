import type { PropsWithChildren } from "react";

import { act, renderHook, waitFor } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";

const addonStateMock = vi.hoisted(() => ({
  routeAddons: [] as unknown[],
  overrides: undefined as
    | { suspended: string[]; enabled: string[] }
    | undefined,
  setShadowState: vi.fn(),
  shadowState: undefined as { enabled: boolean } | undefined,
}));

vi.mock("@carma-mapping/addons", () => ({
  applyAddonOverrides: (
    entries: Array<{ kind: string }>,
    overrides?: { suspended: string[] }
  ) => entries.filter((entry) => !overrides?.suspended.includes(entry.kind)),
  resolveAddonEntries: (entries?: unknown[]) => entries ?? [],
  normalizeAddonEntries: (entries?: unknown[]) => entries ?? [],
  isAlwaysOnTop: () => false,
  getAddonKind: (entry: { addon?: string; kind?: string }) =>
    entry.addon ?? entry.kind,
  // only what this hook asks: which style launches the shadows
  getLayerLaunchedAddons: (
    layers: Array<{ id: string; visible?: boolean; tools?: unknown }>
  ) =>
    layers.flatMap((layer) =>
      Array.isArray(layer.tools) &&
      (layer.tools as Array<{ addon?: string }>).some(
        (tool) => tool.addon === "shadowTexture"
      )
        ? [
            {
              layerId: layer.id,
              visible: layer.visible !== false,
              entry: { addon: "shadowTexture" },
            },
          ]
        : []
    ),
  SHADOW_TEXTURE_LAYER_ID: "__shadow_texture__",
  resolveShadowTextureAddon: (
    entries?: Array<{ kind: string; config?: unknown }>,
    overrides?: { suspended: string[] }
  ) =>
    entries?.find(
      (entry) =>
        entry.kind === "shadowTexture" &&
        !overrides?.suspended.includes(entry.kind)
    ) ?? null,
  createShadowTextureLayer: (
    addon: { kind: string; config?: unknown } | null,
    visible: boolean
  ) =>
    addon
      ? {
          id: "__shadow_texture__",
          title: "Schatten-Textur",
          type: "object",
          visible,
          tools: [addon],
        }
      : null,
  useAddonState: (key: string) =>
    key === "shadowSimulation"
      ? [addonStateMock.shadowState, addonStateMock.setShadowState]
      : [undefined, vi.fn()],
  usePersistedAddonOverrides: () => [addonStateMock.overrides, vi.fn()],
  useRouteAddons: () => addonStateMock.routeAddons,
}));

import mappingReducer, { appendLayer } from "../store/slices/mapping";
import uiReducer from "../store/slices/ui";
import { formatShadowSelection } from "@carma-mapping/shadow-simulation";
import {
  SHADOW_SIMULATION_LAYER_ID,
  SHADOW_TEXTURE_LAYER_ID,
  useShadowSimulationLayerButton,
} from "./useShadowSimulationLayerButton";

const createTestStore = () =>
  configureStore({
    reducer: {
      mapping: mappingReducer,
      ui: uiReducer,
    },
  });

const createNonUpdatingLayerStore = (visible: boolean) => {
  const mappingState = mappingReducer(undefined, { type: "test/setup" });
  const fixedMappingState = {
    ...mappingState,
    layers: [
      {
        id: SHADOW_SIMULATION_LAYER_ID,
        title: "Schatten",
        type: "object" as const,
        visible,
      },
    ],
  };

  return configureStore({
    reducer: {
      mapping: () => fixedMappingState,
      ui: uiReducer,
    },
  });
};

type TestStore = ReturnType<typeof createTestStore>;

const createWrapper =
  (store: TestStore) =>
  ({ children }: PropsWithChildren) =>
    <Provider store={store}>{children}</Provider>;

const findShadowLayer = (store: TestStore) =>
  store
    .getState()
    .mapping.layers.find((layer) => layer.id === SHADOW_SIMULATION_LAYER_ID);

describe("useShadowSimulationLayerButton", () => {
  it("formats the local selection for layerbar text", () => {
    expect(
      formatShadowSelection({ year: 2026, dayOfYear: 237, minutes: 900 })
    ).toBe("25. Aug. · 15:00");
  });

  beforeEach(() => {
    addonStateMock.overrides = undefined;
    addonStateMock.setShadowState.mockReset();
    addonStateMock.routeAddons = [
      { kind: "shadowSimulation", config: { initialMinutes: 900 } },
    ];
    addonStateMock.shadowState = {
      enabled: false,
    };
  });

  it("adds the top-level layer and opens its info view when enabled", async () => {
    const store = createTestStore();
    const { rerender } = renderHook(() => useShadowSimulationLayerButton(), {
      wrapper: createWrapper(store),
    });

    expect(findShadowLayer(store)).toBeUndefined();

    addonStateMock.shadowState = {
      ...addonStateMock.shadowState!,
      enabled: true,
    };
    rerender();

    await waitFor(() => {
      expect(findShadowLayer(store)).toEqual(
        expect.objectContaining({
          id: SHADOW_SIMULATION_LAYER_ID,
          pinned: "last",
          visible: true,
          tools: [
            expect.objectContaining({
              kind: "shadowSimulation",
              config: { initialMinutes: 900 },
            }),
          ],
        })
      );
      // The entry stays selectable so the info view's arrows reach it.
      expect(findShadowLayer(store)).not.toHaveProperty("skipSelection");
      const { layers, selectedLayerIndex } = store.getState().mapping;
      expect(selectedLayerIndex).toBe(
        layers.findIndex((layer) => layer.id === SHADOW_SIMULATION_LAYER_ID)
      );
    });
  });

  it("uses a separate shadow-texture row for the projection mapping route", async () => {
    addonStateMock.routeAddons = [
      {
        kind: "shadowTexture",
        config: { assetBaseUrl: "/assets/dz-b-prm/5m" },
      },
    ];
    addonStateMock.shadowState = { enabled: true };
    const store = createTestStore();
    renderHook(() => useShadowSimulationLayerButton(), {
      wrapper: createWrapper(store),
    });

    await waitFor(() => {
      const layers = store.getState().mapping.layers;
      expect(
        layers.find((layer) => layer.id === SHADOW_TEXTURE_LAYER_ID)
      ).toEqual(
        expect.objectContaining({
          title: "Schatten-Textur",
          visible: true,
          tools: [expect.objectContaining({ kind: "shadowTexture" })],
        })
      );
      expect(findShadowLayer(store)).toBeUndefined();
    });
  });

  it("adds no row while a style launches the shadows", async () => {
    addonStateMock.routeAddons = [
      {
        kind: "shadowTexture",
        config: { assetBaseUrl: "/assets/dz-b-prm/5m" },
      },
    ];
    addonStateMock.shadowState = { enabled: true };
    const store = createTestStore();
    store.dispatch(
      appendLayer({
        id: "custom:schatten",
        title: "Schatten BuGa-Entwurf",
        type: "layer",
        visible: true,
        tools: [
          {
            addon: "shadowTexture",
            config: { assetBaseUrl: "/assets/dz-b-prm/5m" },
          },
        ],
      } as never)
    );
    const dispatch = vi.spyOn(store, "dispatch");
    renderHook(() => useShadowSimulationLayerButton(), {
      wrapper: createWrapper(store),
    });

    await waitFor(() => expect(store.getState().mapping.layers).toHaveLength(1));
    expect(
      store
        .getState()
        .mapping.layers.some((layer) => layer.id === SHADOW_TEXTURE_LAYER_ID)
    ).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
    expect(addonStateMock.setShadowState).not.toHaveBeenCalled();
  });

  it("keeps the layer entry but hides it when the simulation is disabled", async () => {
    const store = createTestStore();
    addonStateMock.shadowState = {
      ...addonStateMock.shadowState!,
      enabled: true,
    };
    const { rerender } = renderHook(() => useShadowSimulationLayerButton(), {
      wrapper: createWrapper(store),
    });

    await waitFor(() => expect(findShadowLayer(store)).toBeDefined());

    act(() => {
      addonStateMock.shadowState = {
        ...addonStateMock.shadowState!,
        enabled: false,
      };
      rerender();
    });

    await waitFor(() => {
      expect(findShadowLayer(store)?.visible).toBe(false);
    });
  });

  it("removes and disables the layer when the addon manager suspends it", async () => {
    const store = createTestStore();
    addonStateMock.shadowState = {
      ...addonStateMock.shadowState!,
      enabled: true,
    };
    const { rerender } = renderHook(() => useShadowSimulationLayerButton(), {
      wrapper: createWrapper(store),
    });

    await waitFor(() => expect(findShadowLayer(store)).toBeDefined());

    addonStateMock.overrides = {
      suspended: ["shadowSimulation"],
      enabled: [],
    };
    rerender();

    await waitFor(() => {
      expect(findShadowLayer(store)).toBeUndefined();
      expect(addonStateMock.setShadowState).toHaveBeenCalled();
    });

    const updateState = addonStateMock.setShadowState.mock.calls[0]?.[0];
    expect(updateState).toBeTypeOf("function");
    const latestState = {
      enabled: true,
    };
    expect(updateState(latestState)).toEqual({
      ...latestState,
      enabled: false,
    });
  });

  it("does not rerun the layer lifecycle when only the time selection changes", async () => {
    const store = createNonUpdatingLayerStore(false);
    addonStateMock.shadowState = {
      ...addonStateMock.shadowState!,
      enabled: true,
    };
    const dispatch = vi.spyOn(store, "dispatch");
    const { rerender } = renderHook(() => useShadowSimulationLayerButton(), {
      wrapper: createWrapper(store),
    });

    await waitFor(() => expect(dispatch).toHaveBeenCalled());
    dispatch.mockClear();

    act(() => {
      addonStateMock.shadowState = {
        ...addonStateMock.shadowState,
      };
      rerender();
    });

    expect(dispatch).not.toHaveBeenCalled();
  });
});
