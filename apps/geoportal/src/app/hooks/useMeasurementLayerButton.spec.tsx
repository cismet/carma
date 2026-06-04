import type { PropsWithChildren } from "react";

import { act, renderHook, waitFor } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useMapMeasurementsContextMock = vi.hoisted(() => vi.fn());
const useMapFrameworkSwitcherContextMock = vi.hoisted(() => vi.fn());

vi.mock("@carma-commons/measurements", () => ({
  useMapMeasurementsContext: () => useMapMeasurementsContextMock(),
}));

vi.mock("@carma-mapping/components", () => ({
  useMapFrameworkSwitcherContext: () => useMapFrameworkSwitcherContextMock(),
}));

import mappingReducer, { removeLayer } from "../store/slices/mapping";
import uiReducer, { setUIMode, UIMode } from "../store/slices/ui";
import {
  MEASUREMENT_LAYER_ID,
  useMeasurementLayerButton,
} from "./useMeasurementLayerButton";

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

const findMeasurementLayer = (store: TestStore) =>
  store
    .getState()
    .mapping.layers.find((layer) => layer.id === MEASUREMENT_LAYER_ID);

const buildMeasurementLayer = () =>
  ({
    id: MEASUREMENT_LAYER_ID,
    title: "Messung",
    icon: "measurement",
    visible: true,
    pinned: "last",
    interactionButtons: {
      id: "save-measurements",
    },
  } as const);

describe("useMeasurementLayerButton", () => {
  beforeEach(() => {
    useMapMeasurementsContextMock.mockReset();
    useMapFrameworkSwitcherContextMock.mockReset();
    useMapMeasurementsContextMock.mockReturnValue({
      shapes: [],
    });
    useMapFrameworkSwitcherContextMock.mockReturnValue({
      isLeaflet: true,
    });
  });

  it("removes a stale persisted measurement layer on mount when measurement mode is inactive", async () => {
    const store = createTestStore();
    store.dispatch({
      type: "mapping/appendLayer",
      payload: buildMeasurementLayer(),
    });

    renderHook(() => useMeasurementLayerButton(), {
      wrapper: createWrapper(store),
    });

    await waitFor(() => {
      expect(findMeasurementLayer(store)).toBeUndefined();
    });
  });

  it("appends the measurement layer when Leaflet measurement mode is enabled", async () => {
    const store = createTestStore();

    renderHook(() => useMeasurementLayerButton(), {
      wrapper: createWrapper(store),
    });

    act(() => {
      store.dispatch(setUIMode(UIMode.MEASUREMENT));
    });

    await waitFor(() => {
      expect(findMeasurementLayer(store)).toEqual(
        expect.objectContaining({
          id: MEASUREMENT_LAYER_ID,
          title: "Messung",
          pinned: "last",
          interactionButtons: expect.arrayContaining([
            expect.objectContaining({
              id: "save-measurements",
            }),
          ]),
        })
      );
    });
  });

  it("updates the layer title when the number of measurement shapes changes", async () => {
    const store = createTestStore();

    const { rerender } = renderHook(() => useMeasurementLayerButton(), {
      wrapper: createWrapper(store),
    });

    act(() => {
      store.dispatch(setUIMode(UIMode.MEASUREMENT));
    });

    await waitFor(() => {
      expect(findMeasurementLayer(store)?.title).toBe("Messung");
    });

    useMapMeasurementsContextMock.mockReturnValue({
      shapes: [{ shapeId: "1" }, { shapeId: "2" }],
    });

    rerender();

    await waitFor(() => {
      expect(findMeasurementLayer(store)?.title).toBe("2 Messungen");
    });
  });

  it("falls back to default mode when the temporary measurement layer is removed manually", async () => {
    const store = createTestStore();

    renderHook(() => useMeasurementLayerButton(), {
      wrapper: createWrapper(store),
    });

    act(() => {
      store.dispatch(setUIMode(UIMode.MEASUREMENT));
    });

    await waitFor(() => {
      expect(findMeasurementLayer(store)).toBeDefined();
    });

    act(() => {
      store.dispatch(removeLayer(MEASUREMENT_LAYER_ID));
    });

    await waitFor(() => {
      expect(store.getState().ui.mode).toBe(UIMode.DEFAULT);
    });
  });
});
