import type { PropsWithChildren } from "react";

import { act, renderHook, waitFor } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useMapFrameworkSwitcherContextMock = vi.hoisted(() => vi.fn());
const hashStateMock = vi.hoisted(() => ({
  hashParams: {} as Record<string, string>,
  updateHashState: vi.fn(),
  popStateCallbacks: [] as Array<
    (event: { hashParams: Record<string, string> }) => void
  >,
}));

vi.mock("@carma-mapping/components", () => ({
  useMapFrameworkSwitcherContext: () => useMapFrameworkSwitcherContextMock(),
}));

vi.mock("@carma-providers/hash-state", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@carma-providers/hash-state")>();

  return {
    ...actual,
    useHashState: () => ({
      getHashParams: () => hashStateMock.hashParams,
      registerOnPopState: (
        callback: (event: { hashParams: Record<string, string> }) => void
      ) => {
        hashStateMock.popStateCallbacks.push(callback);
        return () => {
          hashStateMock.popStateCallbacks =
            hashStateMock.popStateCallbacks.filter(
              (registeredCallback) => registeredCallback !== callback
            );
        };
      },
      updateHashState: hashStateMock.updateHashState,
    }),
  };
});

import mappingReducer from "../store/slices/mapping";
import uiReducer, { setUIMode, UIMode } from "../store/slices/ui";
import { useGeoportalMeasurementModeHash } from "./use-geoportal-measurement-mode-hash";

type TestStore = ReturnType<typeof createTestStore>;

const createTestStore = () =>
  configureStore({
    reducer: {
      mapping: mappingReducer,
      ui: uiReducer,
    },
  });

const createWrapper =
  (store: TestStore) =>
  ({ children }: PropsWithChildren) =>
    <Provider store={store}>{children}</Provider>;

const build3dHashParams = (
  params: Record<string, string> = {}
): Record<string, string> => ({
  lat: "51.2844431",
  lng: "7.1574316",
  zoom: "17.389",
  h: "262.6",
  ...params,
});

const emitPopState = (hashParams: Record<string, string>) => {
  hashStateMock.hashParams = hashParams;
  act(() => {
    hashStateMock.popStateCallbacks.forEach((callback) => {
      callback({ hashParams });
    });
  });
};

describe("useGeoportalMeasurementModeHash", () => {
  beforeEach(() => {
    useMapFrameworkSwitcherContextMock.mockReset();
    useMapFrameworkSwitcherContextMock.mockReturnValue({
      isCesium: true,
    });
    hashStateMock.hashParams = {};
    hashStateMock.updateHashState.mockReset();
    hashStateMock.popStateCallbacks = [];
  });

  it("activates measurement mode from an initial 3d mm hash", async () => {
    const store = createTestStore();
    hashStateMock.hashParams = build3dHashParams({ mm: "1" });

    renderHook(() => useGeoportalMeasurementModeHash(), {
      wrapper: createWrapper(store),
    });

    await waitFor(() => {
      expect(store.getState().ui.mode).toBe(UIMode.MEASUREMENT);
    });
  });

  it("keeps mm active after the 3d launch flag has been consumed", async () => {
    const store = createTestStore();
    hashStateMock.hashParams = { m: "1", mm: "1" };

    renderHook(() => useGeoportalMeasurementModeHash(), {
      wrapper: createWrapper(store),
    });

    await waitFor(() => {
      expect(store.getState().ui.mode).toBe(UIMode.MEASUREMENT);
    });
  });

  it("activates measurement mode when mm arrives through history navigation", async () => {
    const store = createTestStore();
    hashStateMock.hashParams = build3dHashParams();

    renderHook(() => useGeoportalMeasurementModeHash(), {
      wrapper: createWrapper(store),
    });

    expect(store.getState().ui.mode).toBe(UIMode.DEFAULT);

    emitPopState(build3dHashParams({ mm: "1" }));

    await waitFor(() => {
      expect(store.getState().ui.mode).toBe(UIMode.MEASUREMENT);
    });
  });

  it("deactivates measurement mode when history navigation removes mm", async () => {
    const store = createTestStore();
    hashStateMock.hashParams = build3dHashParams({ mm: "1" });

    renderHook(() => useGeoportalMeasurementModeHash(), {
      wrapper: createWrapper(store),
    });

    await waitFor(() => {
      expect(store.getState().ui.mode).toBe(UIMode.MEASUREMENT);
    });

    act(() => {
      store.dispatch(setUIMode(UIMode.MEASUREMENT));
    });
    emitPopState(build3dHashParams());

    await waitFor(() => {
      expect(store.getState().ui.mode).toBe(UIMode.DEFAULT);
    });
  });
});
