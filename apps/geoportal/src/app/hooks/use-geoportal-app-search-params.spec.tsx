import type { PropsWithChildren } from "react";

import { act, renderHook, waitFor } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hashStateMock = vi.hoisted(() => ({
  updateHashState: vi.fn(),
}));
const useAppSearchParamsMock = vi.hoisted(() => vi.fn());
const useMapFrameworkSwitcherContextMock = vi.hoisted(() => vi.fn());

vi.mock("@carma-appframeworks/portals", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@carma-appframeworks/portals")>();

  return {
    ...actual,
    useAppSearchParams: (options: unknown) => useAppSearchParamsMock(options),
  };
});

vi.mock("@carma-mapping/components", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@carma-mapping/components")>();

  return {
    ...actual,
    useMapFrameworkSwitcherContext: () => useMapFrameworkSwitcherContextMock(),
  };
});

vi.mock("@carma-providers/hash-state", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@carma-providers/hash-state")>();

  return {
    ...actual,
    useHashState: () => ({
      updateHashState: hashStateMock.updateHashState,
    }),
  };
});

import { geoportalAppSearchParamsOptions } from "../config/app-search-params";
import uiReducer, {
  initialUIState,
  setUIMode,
  UIMode,
} from "../store/slices/ui";
import { useGeoportalAppSearchParams } from "./use-geoportal-app-search-params";

type TestStore = ReturnType<typeof createTestStore>;

const createTestStore = (mode = UIMode.DEFAULT) =>
  configureStore({
    reducer: {
      ui: uiReducer,
    },
    preloadedState: {
      ui: {
        ...initialUIState,
        mode,
      },
    },
  });

const createWrapper =
  (store: TestStore) =>
  ({ children }: PropsWithChildren) =>
    <Provider store={store}>{children}</Provider>;

const renderGeoportalAppSearchParamsHook = (store: TestStore) =>
  renderHook(() => useGeoportalAppSearchParams(), {
    wrapper: createWrapper(store),
  });

describe("useGeoportalAppSearchParams", () => {
  beforeEach(() => {
    hashStateMock.updateHashState.mockReset();
    useAppSearchParamsMock.mockReset();
    useMapFrameworkSwitcherContextMock.mockReset();
    useAppSearchParamsMock.mockReturnValue({ customHashState: null });
    useMapFrameworkSwitcherContextMock.mockReturnValue({ isCesium: true });
  });

  it("registers the central geoportal app search params options", async () => {
    const store = createTestStore();

    renderGeoportalAppSearchParamsHook(store);

    expect(useAppSearchParamsMock).toHaveBeenCalledWith(
      geoportalAppSearchParamsOptions
    );
  });

  it("writes the current measurement mode into the hash in cesium", async () => {
    const store = createTestStore(UIMode.MEASUREMENT);

    renderGeoportalAppSearchParamsHook(store);

    await waitFor(() => {
      expect(hashStateMock.updateHashState).toHaveBeenCalledWith(
        { mm: "1" },
        { label: "geoportal:sync-measurement-mode", replace: true }
      );
    });
  });

  it("clears the measurement hash when measurement mode is off in cesium", async () => {
    const store = createTestStore(UIMode.DEFAULT);

    renderGeoportalAppSearchParamsHook(store);

    await waitFor(() => {
      expect(hashStateMock.updateHashState).toHaveBeenCalledWith(
        { mm: undefined },
        { label: "geoportal:sync-measurement-mode", replace: true }
      );
    });
  });

  it("writes measurement hash changes from ui mode changes", async () => {
    const store = createTestStore(UIMode.DEFAULT);

    renderGeoportalAppSearchParamsHook(store);
    hashStateMock.updateHashState.mockClear();

    act(() => {
      store.dispatch(setUIMode(UIMode.MEASUREMENT));
    });

    await waitFor(() => {
      expect(hashStateMock.updateHashState).toHaveBeenCalledWith(
        { mm: "1" },
        { label: "geoportal:sync-measurement-mode", replace: true }
      );
    });
  });

  it("does not write the measurement hash outside cesium", async () => {
    const store = createTestStore(UIMode.MEASUREMENT);
    useMapFrameworkSwitcherContextMock.mockReturnValue({ isCesium: false });

    renderGeoportalAppSearchParamsHook(store);
    await act(async () => {});

    expect(hashStateMock.updateHashState).not.toHaveBeenCalled();
  });
});
