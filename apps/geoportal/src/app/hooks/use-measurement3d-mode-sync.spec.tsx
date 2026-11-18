import type { PropsWithChildren } from "react";

import { renderHook } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  isOn: false,
  available: false,
  endMode: vi.fn(),
  setHighlightMode: vi.fn(),
}));

vi.mock("@carma-mapping/addons", () => ({
  useAddonState: () => [undefined, state.setHighlightMode],
  useMeasurement3dActions: () => ({
    isOn: state.isOn,
    available: state.available,
    endMode: state.endMode,
    setViewHidden: () => undefined,
    setShowAllTools: () => undefined,
  }),
}));
vi.mock("@carma-mapping/components", () => ({
  useMapFrameworkSwitcherContext: () => ({ isCesium: false }),
}));
vi.mock("@carma-providers/feature-flag", () => ({
  useFeatureFlags: () => ({}),
}));

import uiReducer, { setUIMode, UIMode } from "../store/slices/ui";
import { useMeasurement3dModeSync } from "./use-measurement3d-mode-sync";

const createTestStore = () => configureStore({ reducer: { ui: uiReducer } });

const renderModeSync = (store: ReturnType<typeof createTestStore>) =>
  renderHook(() => useMeasurement3dModeSync(), {
    wrapper: ({ children }: PropsWithChildren) => (
      <Provider store={store}>{children}</Provider>
    ),
  });

describe("useMeasurement3dModeSync", () => {
  beforeEach(() => {
    state.isOn = false;
    state.available = false;
    state.endMode.mockClear();
    state.setHighlightMode.mockClear();
  });

  it("leaves the other modes alone while the tool is on without a surface", () => {
    const store = createTestStore();
    store.dispatch(setUIMode(UIMode.MEASUREMENT));
    const sync = renderModeSync(store);
    state.isOn = true;
    sync.rerender();
    expect(store.getState().ui.mode).toBe(UIMode.MEASUREMENT);
    expect(state.setHighlightMode).not.toHaveBeenCalled();
  });

  it("takes the map from the other modes once the tool can measure", () => {
    const store = createTestStore();
    store.dispatch(setUIMode(UIMode.MEASUREMENT));
    state.isOn = true;
    const sync = renderModeSync(store);
    state.available = true;
    sync.rerender();
    expect(store.getState().ui.mode).toBe(UIMode.DEFAULT);
    expect(state.setHighlightMode).toHaveBeenCalledWith({ isOn: false });
  });

  it("ends the tool when another mode starts", () => {
    const store = createTestStore();
    state.isOn = true;
    state.available = true;
    const sync = renderModeSync(store);
    store.dispatch(setUIMode(UIMode.FEATURE_INFO));
    sync.rerender();
    expect(state.endMode).toHaveBeenCalledTimes(1);
  });
});
