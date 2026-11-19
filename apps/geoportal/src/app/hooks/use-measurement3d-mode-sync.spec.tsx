import type { PropsWithChildren } from "react";

import { act, renderHook } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  isOn: false,
  setOn: vi.fn(),
}));

vi.mock("@carma-mapping/addons", () => ({
  useMeasurement3dActions: () => ({
    isOn: state.isOn,
    setOn: state.setOn,
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

import uiReducer, { setLibre3d, setUIMode, UIMode } from "../store/slices/ui";
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
    state.setOn.mockClear();
  });

  it("switches the tool on with the measurement mode in the 3D view", () => {
    const store = createTestStore();
    store.dispatch(setLibre3d(true));
    renderModeSync(store);
    act(() => {
      store.dispatch(setUIMode(UIMode.MEASUREMENT));
    });
    expect(state.setOn).toHaveBeenLastCalledWith(true);
  });

  it("starts the measurement mode when the tool is switched on elsewhere", () => {
    const store = createTestStore();
    store.dispatch(setLibre3d(true));
    const sync = renderModeSync(store);
    state.isOn = true;
    sync.rerender();
    expect(store.getState().ui.mode).toBe(UIMode.MEASUREMENT);
  });

  it("ends the tool when another mode starts", () => {
    const store = createTestStore();
    store.dispatch(setLibre3d(true));
    store.dispatch(setUIMode(UIMode.MEASUREMENT));
    state.isOn = true;
    renderModeSync(store);
    act(() => {
      store.dispatch(setUIMode(UIMode.FEATURE_INFO));
    });
    expect(state.setOn).toHaveBeenLastCalledWith(false);
  });

  it("keeps the tool off outside the 3D view", () => {
    const store = createTestStore();
    store.dispatch(setUIMode(UIMode.MEASUREMENT));
    state.isOn = true;
    renderModeSync(store);
    expect(state.setOn).toHaveBeenLastCalledWith(false);
    expect(store.getState().ui.mode).toBe(UIMode.MEASUREMENT);
  });
});
