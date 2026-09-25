import type { PropsWithChildren } from "react";

import { configureStore } from "@reduxjs/toolkit";
import { renderHook } from "@testing-library/react";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";
import type { ModelCollectionLayerBridge } from "@carma-mapping/addons";

const addonMock = vi.hoisted(() => ({
  useLayerButton: vi.fn(),
}));

vi.mock("@carma-mapping/addons", () => ({
  isAlwaysOnTop: () => false,
  normalizeAddonEntries: (entries?: unknown[]) => entries ?? [],
  useModelCollectionLayerButton: addonMock.useLayerButton,
  MODEL_COLLECTION_LAYER_ID: "dzb-prm-buga",
}));

import mappingReducer from "../store/slices/mapping";
import uiReducer from "../store/slices/ui";
import {
  MODEL_COLLECTION_LAYER_ID,
  useModelCollectionLayerButton,
} from "./useModelCollectionLayerButton";

const makeStore = () =>
  configureStore({ reducer: { mapping: mappingReducer, ui: uiReducer } });

describe("useModelCollectionLayerButton", () => {
  it("passes the host layer-store operations to the addon", () => {
    addonMock.useLayerButton.mockReset();
    const store = makeStore();
    const wrapper = ({ children }: PropsWithChildren) => (
      <Provider store={store}>{children}</Provider>
    );
    renderHook(() => useModelCollectionLayerButton(), { wrapper });

    const bridge = addonMock.useLayerButton.mock
      .calls[0][0] as ModelCollectionLayerBridge;
    expect(bridge.baseHref).toBe(globalThis.location.href);
    bridge.append({
      id: MODEL_COLLECTION_LAYER_ID,
      title: "BuGa",
      type: "object",
      visible: true,
    });
    expect(bridge.getLayerStack()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: MODEL_COLLECTION_LAYER_ID }),
      ])
    );
    bridge.remove(MODEL_COLLECTION_LAYER_ID);
    expect(bridge.getLayerStack()).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: MODEL_COLLECTION_LAYER_ID }),
      ])
    );
  });
});
