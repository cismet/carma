import type { PropsWithChildren } from "react";

import { act, renderHook, waitFor } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppSearchParamsCustomStateSnapshot } from "@carma-appframeworks/portals";
import { HASH_LAUNCH_MODE } from "@carma-commons/utils";
import { CARMA_MAP_FRAMEWORKS } from "@carma-mapping/components";

import type { GeoportalCustomHashState } from "../helper/geoportal-custom-hash-state";

const hashStateMock = vi.hoisted(() => ({
  updateHashState: vi.fn(),
}));
const useAppSearchParamsMock = vi.hoisted(() => vi.fn());
const useMapFrameworkSwitcherContextMock = vi.hoisted(() => vi.fn());
const useCesiumContextMock = vi.hoisted(() => vi.fn());

vi.mock("@carma-appframeworks/portals", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@carma-appframeworks/portals")>();

  return {
    ...actual,
    useAppSearchParams: () => useAppSearchParamsMock(),
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

vi.mock("@carma-mapping/engines/cesium/legacy", () => ({
  useCesiumContext: () => useCesiumContextMock(),
}));

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

const buildCustomHashState = ({
  launchMode = HASH_LAUNCH_MODE.THREE_D,
  measurementModeRequested,
  source = "initial",
  version = 0,
}: {
  launchMode?: GeoportalCustomHashState["launchMode"];
  measurementModeRequested: boolean;
  source?: AppSearchParamsCustomStateSnapshot<
    GeoportalCustomHashState
  >["source"];
  version?: number;
}): AppSearchParamsCustomStateSnapshot<GeoportalCustomHashState> => ({
  initialMapFramework: CARMA_MAP_FRAMEWORKS.CESIUM,
  launchMode,
  measurementModeRequested,
  source,
  version,
});

const mockCustomHashState = (
  customHashState: AppSearchParamsCustomStateSnapshot<GeoportalCustomHashState>
) => {
  useAppSearchParamsMock.mockReturnValue({ customHashState });
};

describe("useGeoportalMeasurementModeHash", () => {
  beforeEach(() => {
    hashStateMock.updateHashState.mockReset();
    useAppSearchParamsMock.mockReset();
    useMapFrameworkSwitcherContextMock.mockReset();
    useCesiumContextMock.mockReset();
    useMapFrameworkSwitcherContextMock.mockReturnValue({ isCesium: true });
    useCesiumContextMock.mockReturnValue({ initialViewApplied: true });
  });

  it("activates measurement mode from the initial custom hash state", async () => {
    const store = createTestStore();
    const customHashState = buildCustomHashState({
      measurementModeRequested: true,
    });
    mockCustomHashState(customHashState);

    renderHook(() => useGeoportalMeasurementModeHash(), {
      wrapper: createWrapper(store),
    });

    await waitFor(() => {
      expect(store.getState().ui.mode).toBe(UIMode.MEASUREMENT);
    });
    expect(hashStateMock.updateHashState).not.toHaveBeenCalledWith(
      { mm: undefined },
      expect.anything()
    );
  });

  it("waits for the 3d gate before handling the initial measurement request", async () => {
    const store = createTestStore();
    const customHashState = buildCustomHashState({
      measurementModeRequested: true,
    });
    mockCustomHashState(customHashState);
    useCesiumContextMock.mockReturnValue({ initialViewApplied: false });

    const { rerender } = renderHook(() => useGeoportalMeasurementModeHash(), {
      wrapper: createWrapper(store),
    });

    expect(store.getState().ui.mode).toBe(UIMode.DEFAULT);
    expect(hashStateMock.updateHashState).not.toHaveBeenCalled();

    useCesiumContextMock.mockReturnValue({ initialViewApplied: true });
    rerender();

    await waitFor(() => {
      expect(store.getState().ui.mode).toBe(UIMode.MEASUREMENT);
    });
  });

  it("does not activate measurement mode for a 2d launch request", async () => {
    const store = createTestStore();
    const customHashState = buildCustomHashState({
      launchMode: HASH_LAUNCH_MODE.TWO_D,
      measurementModeRequested: true,
    });
    mockCustomHashState(customHashState);

    renderHook(() => useGeoportalMeasurementModeHash(), {
      wrapper: createWrapper(store),
    });

    expect(store.getState().ui.mode).toBe(UIMode.DEFAULT);
  });

  it("does not write measurement hash when hash and ui mode already match", async () => {
    const store = createTestStore();
    mockCustomHashState(
      buildCustomHashState({
        measurementModeRequested: false,
      })
    );

    renderHook(() => useGeoportalMeasurementModeHash(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {});

    expect(hashStateMock.updateHashState).not.toHaveBeenCalled();
  });

  it("writes measurement hash only when ui mode differs from the hash request", async () => {
    const store = createTestStore();
    mockCustomHashState(
      buildCustomHashState({
        measurementModeRequested: false,
      })
    );

    renderHook(() => useGeoportalMeasurementModeHash(), {
      wrapper: createWrapper(store),
    });

    expect(hashStateMock.updateHashState).not.toHaveBeenCalled();

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

  it("keeps the measurement request active after the 3d launch flag has been consumed", async () => {
    const store = createTestStore();
    const customHashState = buildCustomHashState({
      measurementModeRequested: true,
    });
    mockCustomHashState(customHashState);

    renderHook(() => useGeoportalMeasurementModeHash(), {
      wrapper: createWrapper(store),
    });

    await waitFor(() => {
      expect(store.getState().ui.mode).toBe(UIMode.MEASUREMENT);
    });
  });

  it("removes the measurement hash when hash-backed measurement mode is turned off", async () => {
    const store = createTestStore();
    const customHashState = buildCustomHashState({
      measurementModeRequested: true,
      version: 1,
    });
    mockCustomHashState(customHashState);

    renderHook(() => useGeoportalMeasurementModeHash(), {
      wrapper: createWrapper(store),
    });

    await waitFor(() => {
      expect(store.getState().ui.mode).toBe(UIMode.MEASUREMENT);
    });

    hashStateMock.updateHashState.mockClear();

    act(() => {
      store.dispatch(setUIMode(UIMode.DEFAULT));
    });

    await waitFor(() => {
      expect(hashStateMock.updateHashState).toHaveBeenCalledWith(
        { mm: undefined },
        { label: "geoportal:sync-measurement-mode", replace: true }
      );
    });
  });

  it("activates measurement mode when custom hash state changes through history navigation", async () => {
    const store = createTestStore();
    mockCustomHashState(
      buildCustomHashState({
        measurementModeRequested: false,
      })
    );
    const { rerender } = renderHook(() => useGeoportalMeasurementModeHash(), {
      wrapper: createWrapper(store),
    });

    expect(store.getState().ui.mode).toBe(UIMode.DEFAULT);

    act(() => {
      mockCustomHashState(
        buildCustomHashState({
          measurementModeRequested: true,
          source: "popstate",
          version: 1,
        })
      );
      rerender();
    });

    await waitFor(() => {
      expect(store.getState().ui.mode).toBe(UIMode.MEASUREMENT);
    });
  });

  it("deactivates measurement mode when history navigation removes the request", async () => {
    const store = createTestStore();
    mockCustomHashState(
      buildCustomHashState({
        measurementModeRequested: true,
      })
    );
    const { rerender } = renderHook(() => useGeoportalMeasurementModeHash(), {
      wrapper: createWrapper(store),
    });

    await waitFor(() => {
      expect(store.getState().ui.mode).toBe(UIMode.MEASUREMENT);
    });

    act(() => {
      mockCustomHashState(
        buildCustomHashState({
          measurementModeRequested: false,
          source: "popstate",
          version: 1,
        })
      );
      rerender();
    });

    await waitFor(() => {
      expect(store.getState().ui.mode).toBe(UIMode.DEFAULT);
    });
  });
});
