import type { PropsWithChildren } from "react";

import { act, renderHook, waitFor } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useMapFrameworkSwitcherContextMock = vi.hoisted(() => vi.fn());
const useAnnotationsDispatchMock = vi.hoisted(() => vi.fn());
const useAnnotationsRuntimeMock = vi.hoisted(() => vi.fn());

vi.mock("@carma-mapping/components", () => ({
  useMapFrameworkSwitcherContext: () => useMapFrameworkSwitcherContextMock(),
}));

vi.mock("@carma-mapping/annotations/runtime", () => ({
  useAnnotationsDispatch: () => useAnnotationsDispatchMock(),
  useAnnotationsRuntime: () => useAnnotationsRuntimeMock(),
}));

import mappingReducer, { removeLayer } from "../store/slices/mapping";
import uiReducer, { setUIMode, UIMode } from "../store/slices/ui";
import { CESIUM_ANNOTATION_LAYER_ID } from "../components/annotations/cesium-annotations.constants";
import { useCesiumAnnotationLayerButton } from "./useCesiumAnnotationLayerButton";

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

const findCesiumAnnotationLayer = (store: TestStore) =>
  store
    .getState()
    .mapping.layers.find((layer) => layer.id === CESIUM_ANNOTATION_LAYER_ID);

const buildCesiumAnnotationLayer = () =>
  ({
    id: CESIUM_ANNOTATION_LAYER_ID,
    title: "Messung",
    type: "object",
    icon: "measurement",
    visible: true,
    pinned: "last",
    interactionButton: {
      id: "cesium-annotation-tools",
    },
  } as const);

describe("useCesiumAnnotationLayerButton", () => {
  beforeEach(() => {
    useMapFrameworkSwitcherContextMock.mockReset();
    useAnnotationsDispatchMock.mockReset();
    useAnnotationsRuntimeMock.mockReset();
    useMapFrameworkSwitcherContextMock.mockReturnValue({
      isCesium: true,
    });
    useAnnotationsRuntimeMock.mockReturnValue({
      annotationEntries: [],
      setSelectedAnnotationId: vi.fn(),
    });
  });

  it("removes a stale persisted cesium annotation layer on mount when measurement mode is inactive", async () => {
    const store = createTestStore();
    store.dispatch({
      type: "mapping/appendLayer",
      payload: buildCesiumAnnotationLayer(),
    });

    renderHook(() => useCesiumAnnotationLayerButton(), {
      wrapper: createWrapper(store),
    });

    await waitFor(() => {
      expect(findCesiumAnnotationLayer(store)).toBeUndefined();
    });
  });

  it("appends the cesium annotation layer when measurement mode is enabled in cesium", async () => {
    const store = createTestStore();

    renderHook(() => useCesiumAnnotationLayerButton(), {
      wrapper: createWrapper(store),
    });

    act(() => {
      store.dispatch(setUIMode(UIMode.MEASUREMENT));
    });

    await waitFor(() => {
      expect(findCesiumAnnotationLayer(store)).toEqual(
        expect.objectContaining({
          id: CESIUM_ANNOTATION_LAYER_ID,
          title: "Messung",
          type: "object",
          pinned: "last",
        })
      );
    });
  });

  it("falls back to default mode when the temporary cesium annotation layer is removed manually", async () => {
    const store = createTestStore();

    renderHook(() => useCesiumAnnotationLayerButton(), {
      wrapper: createWrapper(store),
    });

    act(() => {
      store.dispatch(setUIMode(UIMode.MEASUREMENT));
    });

    await waitFor(() => {
      expect(findCesiumAnnotationLayer(store)).toBeDefined();
    });

    act(() => {
      store.dispatch(removeLayer(CESIUM_ANNOTATION_LAYER_ID));
    });

    await waitFor(() => {
      expect(store.getState().ui.mode).toBe(UIMode.DEFAULT);
    });
  });

  it("does not mutate per-annotation hidden state when measurement mode is closed", async () => {
    const store = createTestStore();
    const setSelectedAnnotationId = vi.fn();
    const annotationsDispatch = vi.fn();

    useAnnotationsRuntimeMock.mockReturnValue({
      annotationEntries: [
        {
          id: "annotation-1",
          hidden: false,
        },
      ],
      setSelectedAnnotationId,
    });
    useAnnotationsDispatchMock.mockReturnValue(annotationsDispatch);

    renderHook(() => useCesiumAnnotationLayerButton(), {
      wrapper: createWrapper(store),
    });

    act(() => {
      store.dispatch(setUIMode(UIMode.MEASUREMENT));
    });

    await waitFor(() => {
      expect(findCesiumAnnotationLayer(store)).toBeDefined();
    });

    act(() => {
      store.dispatch(setUIMode(UIMode.DEFAULT));
    });

    await waitFor(() => {
      expect(findCesiumAnnotationLayer(store)).toBeUndefined();
    });

    expect(annotationsDispatch).not.toHaveBeenCalled();
    expect(setSelectedAnnotationId).toHaveBeenCalledWith(null);
  });
});
