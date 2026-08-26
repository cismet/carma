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
import {
  formatShadowSelection,
  SHADOW_SIMULATION_CONTROLS_INTERACTION_ID,
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

  it("adds the top-level layer and opens its interaction controls when enabled", async () => {
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
          skipSelection: true,
          interactionButtons: [
            expect.objectContaining({
              id: SHADOW_SIMULATION_CONTROLS_INTERACTION_ID,
              tooltip: "Schatteneinstellungen",
            }),
          ],
          tools: [
            expect.objectContaining({
              kind: "shadowSimulation",
              config: { initialMinutes: 900 },
            }),
          ],
        })
      );
      expect(store.getState().mapping.selectedLayerIndex).toBe(-2);
      expect(store.getState().mapping.activeInteractionLayerID).toBe(
        SHADOW_SIMULATION_LAYER_ID
      );
      expect(store.getState().mapping.activeInteractionButtonID).toBe(
        SHADOW_SIMULATION_CONTROLS_INTERACTION_ID
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
      expect(addonStateMock.setShadowState).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false })
      );
    });
  });
});
