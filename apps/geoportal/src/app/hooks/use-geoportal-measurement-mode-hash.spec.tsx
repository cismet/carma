import type { PropsWithChildren } from "react";

import { act, renderHook, waitFor } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppSearchParamsCustomStateSnapshot } from "@carma-appframeworks/portals";
import { HASH_LAUNCH_MODE } from "@carma-commons/utils";

import type { GeoportalCustomHashState } from "../helper/geoportal-custom-hash-state";

const hashStateMock = vi.hoisted(() => ({
  updateHashState: vi.fn(),
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
import uiReducer, { UIMode } from "../store/slices/ui";
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
  measurementModeRequested,
  source = "initial",
  version = 0,
}: {
  measurementModeRequested: boolean;
  source?: AppSearchParamsCustomStateSnapshot<
    GeoportalCustomHashState
  >["source"];
  version?: number;
}): AppSearchParamsCustomStateSnapshot<GeoportalCustomHashState> => ({
  launchMode: HASH_LAUNCH_MODE.THREE_D,
  measurementModeRequested,
  source,
  version,
});

describe("useGeoportalMeasurementModeHash", () => {
  beforeEach(() => {
    hashStateMock.updateHashState.mockReset();
  });

  it("activates measurement mode from the initial custom hash state", async () => {
    const store = createTestStore();
    const customHashState = buildCustomHashState({
      measurementModeRequested: true,
    });

    renderHook(
      () => useGeoportalMeasurementModeHash({ customHashState }),
      {
        wrapper: createWrapper(store),
      }
    );

    await waitFor(() => {
      expect(store.getState().ui.mode).toBe(UIMode.MEASUREMENT);
    });
  });

  it("keeps the measurement request active after the 3d launch flag has been consumed", async () => {
    const store = createTestStore();
    const customHashState = buildCustomHashState({
      measurementModeRequested: true,
    });

    renderHook(
      () => useGeoportalMeasurementModeHash({ customHashState }),
      {
        wrapper: createWrapper(store),
      }
    );

    await waitFor(() => {
      expect(store.getState().ui.mode).toBe(UIMode.MEASUREMENT);
    });
  });

  it("activates measurement mode when custom hash state changes through history navigation", async () => {
    const store = createTestStore();
    const { rerender } = renderHook(
      ({ customHashState }) =>
        useGeoportalMeasurementModeHash({ customHashState }),
      {
        initialProps: {
          customHashState: buildCustomHashState({
            measurementModeRequested: false,
          }),
        },
        wrapper: createWrapper(store),
      }
    );

    expect(store.getState().ui.mode).toBe(UIMode.DEFAULT);

    rerender({
      customHashState: buildCustomHashState({
        measurementModeRequested: true,
        source: "popstate",
        version: 1,
      }),
    });

    await waitFor(() => {
      expect(store.getState().ui.mode).toBe(UIMode.MEASUREMENT);
    });
  });

  it("activates measurement mode without requiring the hash writer addon", async () => {
    const store = createTestStore();
    const customHashState = buildCustomHashState({
      measurementModeRequested: true,
    });

    renderHook(
      () =>
        useGeoportalMeasurementModeHash({
          customHashState,
          writeMeasurementModeHash: false,
        }),
      {
        wrapper: createWrapper(store),
      }
    );

    await waitFor(() => {
      expect(store.getState().ui.mode).toBe(UIMode.MEASUREMENT);
    });
    expect(hashStateMock.updateHashState).not.toHaveBeenCalled();
  });

  it("deactivates measurement mode when history navigation removes the request", async () => {
    const store = createTestStore();
    const { rerender } = renderHook(
      ({ customHashState }) =>
        useGeoportalMeasurementModeHash({ customHashState }),
      {
        initialProps: {
          customHashState: buildCustomHashState({
            measurementModeRequested: true,
          }),
        },
        wrapper: createWrapper(store),
      }
    );

    await waitFor(() => {
      expect(store.getState().ui.mode).toBe(UIMode.MEASUREMENT);
    });

    act(() => {
      rerender({
        customHashState: buildCustomHashState({
          measurementModeRequested: false,
          source: "popstate",
          version: 1,
        }),
      });
    });

    await waitFor(() => {
      expect(store.getState().ui.mode).toBe(UIMode.DEFAULT);
    });
  });
});
