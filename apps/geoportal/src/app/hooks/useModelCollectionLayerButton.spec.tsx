import type { PropsWithChildren } from "react";

import { configureStore } from "@reduxjs/toolkit";
import { renderHook, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const addonMock = vi.hoisted(() => ({
  visible: true,
  setState: vi.fn(),
  addons: [
    {
      kind: "modelCollection",
      config: { manifestUrl: "/assets/dz-b-prm/collection.json" },
    },
  ],
}));

vi.mock("@carma-mapping/addons", () => ({
  applyAddonOverrides: (entries: unknown[]) => entries,
  resolveAddonEntries: (entries: unknown[]) => entries,
  normalizeAddonEntries: (entries: unknown[]) => entries,
  isAlwaysOnTop: () => false,
  useAddonState: () => [{ visible: addonMock.visible }, addonMock.setState],
  usePersistedAddonOverrides: () => [undefined],
  useRouteAddons: () => addonMock.addons,
}));

import mappingReducer, { removeLayer } from "../store/slices/mapping";
import uiReducer from "../store/slices/ui";
import {
  MODEL_COLLECTION_LAYER_ID,
  useModelCollectionLayerButton,
} from "./useModelCollectionLayerButton";

const makeStore = () =>
  configureStore({ reducer: { mapping: mappingReducer, ui: uiReducer } });

describe("useModelCollectionLayerButton", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    addonMock.visible = true;
    addonMock.setState.mockReset();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: MODEL_COLLECTION_LAYER_ID,
        title: "BuGa",
        type: "object",
        visible: true,
        hasInfoView: true,
      }),
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("loads the generated ad-hoc JSON into the layer stack once", async () => {
    const store = makeStore();
    const wrapper = ({ children }: PropsWithChildren) => (
      <Provider store={store}>{children}</Provider>
    );
    renderHook(() => useModelCollectionLayerButton(), { wrapper });

    await waitFor(() => {
      const layer = store
        .getState()
        .mapping.layers.find((entry) => entry.id === MODEL_COLLECTION_LAYER_ID);
      expect(layer?.title).toBe("BuGa");
      expect(layer?.tools?.[0]).toMatchObject({ kind: "modelCollection" });
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    store.dispatch(removeLayer(MODEL_COLLECTION_LAYER_ID));
    await waitFor(() =>
      expect(addonMock.setState).toHaveBeenCalledWith({ visible: false })
    );
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
