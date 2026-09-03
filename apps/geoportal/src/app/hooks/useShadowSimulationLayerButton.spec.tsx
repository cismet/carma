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
  shadowState: undefined as
    | { enabled: boolean; selection: Record<string, number> }
    | undefined,
}));

vi.mock("@carma-mapping/addons", () => ({
  applyAddonOverrides: (
    entries: Array<{ kind: string }>,
    overrides?: { suspended: string[] }
  ) => entries.filter((entry) => !overrides?.suspended.includes(entry.kind)),
  resolveAddonEntries: (entries?: unknown[]) => entries ?? [],
  useAddonState: (key: string) =>
    key === "shadowSimulation"
      ? [addonStateMock.shadowState, addonStateMock.setShadowState]
      : [undefined, vi.fn()],
  usePersistedAddonOverrides: () => [addonStateMock.overrides, vi.fn()],
  useRouteAddons: () => addonStateMock.routeAddons,
}));

import mappingReducer from "../store/slices/mapping";
import uiReducer from "../store/slices/ui";
import { formatShadowSelection } from "@carma-mapping/shadow-simulation";
import {
  SHADOW_SIMULATION_LAYER_ID,
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
      selection: { year: 2026, dayOfYear: 172, minutes: 900 },
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
      selection: { year: 2026, dayOfYear: 180, minutes: 930 },
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
        selection: { year: 2026, dayOfYear: 172, minutes: 901 },
      };
      rerender();
    });

    expect(dispatch).not.toHaveBeenCalled();
  });
});
