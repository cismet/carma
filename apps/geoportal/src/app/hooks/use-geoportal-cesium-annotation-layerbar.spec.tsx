import { useEffect, type PropsWithChildren } from "react";

import { act, renderHook, waitFor } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ANNOTATION_SELECT_TOOL_ID } from "@carma-mapping/annotations/core";
import { ADHOC_LAYER_SOURCES } from "@carma-appframeworks/portals";

const useMapFrameworkSwitcherContextMock = vi.hoisted(() => vi.fn());
const useAnnotationsDispatchMock = vi.hoisted(() => vi.fn());
const useAnnotationsRuntimeMock = vi.hoisted(() => vi.fn());
const updateAnnotationEntryByIdMock = vi.hoisted(() =>
  vi.fn((payload) => ({
    type: "annotations/updateAnnotationEntryById",
    payload,
  }))
);

vi.mock("@carma-mapping/components", () => ({
  useMapFrameworkSwitcherContext: () => useMapFrameworkSwitcherContextMock(),
}));

vi.mock("@carma-mapping/annotations/runtime", () => ({
  selectAuthoringAnnotationEntries: ({
    annotationEntries,
  }: {
    annotationEntries: Array<{ externalCollection?: unknown }>;
  }) =>
    annotationEntries.filter(
      (annotationEntry) => !annotationEntry.externalCollection
    ),
  updateAnnotationEntryById: updateAnnotationEntryByIdMock,
  useAnnotationsDispatch: () => useAnnotationsDispatchMock(),
  useAnnotationsRuntime: () => useAnnotationsRuntimeMock(),
}));

import mappingReducer, {
  changeVisibility,
  removeLayer,
} from "../store/slices/mapping";
import uiReducer, { setUIMode, UIMode } from "../store/slices/ui";
import {
  CESIUM_ANNOTATION_INTERACTION_ID,
  CESIUM_ANNOTATION_LAYER_ID,
} from "../components/annotations/cesium-annotations.constants";
import { CESIUM_ANNOTATION_CONFIG } from "../config/app.config";
import { useGeoportalCesiumAnnotationLayerbar } from "./use-geoportal-cesium-annotation-layerbar";

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
    interactionButtons: {
      id: "cesium-annotation-tools",
    },
  } as const);

const buildSavedAnnotationLayer = () =>
  ({
    id: "saved-annotations-1",
    title: "Saved annotations",
    type: "object",
    props: {
      style: {
        source: ADHOC_LAYER_SOURCES.ANNOTATIONS,
      },
    },
    visible: true,
  } as const);

describe("useGeoportalCesiumAnnotationLayerbar", () => {
  const setActiveToolType = vi.fn();
  const setSelectedAnnotationId = vi.fn();

  beforeEach(() => {
    useMapFrameworkSwitcherContextMock.mockReset();
    useAnnotationsDispatchMock.mockReset();
    setActiveToolType.mockReset();
    setSelectedAnnotationId.mockReset();
    useAnnotationsRuntimeMock.mockReset();
    updateAnnotationEntryByIdMock.mockClear();
    useMapFrameworkSwitcherContextMock.mockReturnValue({
      isCesium: true,
    });
    useAnnotationsDispatchMock.mockReturnValue(vi.fn());
    useAnnotationsRuntimeMock.mockReturnValue({
      activeToolType: CESIUM_ANNOTATION_CONFIG.tools.defaultToolId,
      annotationEntries: [],
      registry: {
        getPlugin: (toolId: string) =>
          toolId === CESIUM_ANNOTATION_CONFIG.tools.defaultToolId
            ? { id: toolId }
            : undefined,
      },
      setActiveToolType,
      setSelectedAnnotationId,
      selectedAnnotationIds: [],
    });
  });

  it("removes a stale persisted cesium annotation layer on mount when measurement mode is inactive", async () => {
    const store = createTestStore();
    store.dispatch({
      type: "mapping/appendLayer",
      payload: buildCesiumAnnotationLayer(),
    });

    renderHook(() => useGeoportalCesiumAnnotationLayerbar(), {
      wrapper: createWrapper(store),
    });

    await waitFor(() => {
      expect(findCesiumAnnotationLayer(store)).toBeUndefined();
    });
  });

  it("appends the cesium annotation layer when measurement mode is enabled in cesium", async () => {
    const store = createTestStore();

    renderHook(() => useGeoportalCesiumAnnotationLayerbar(), {
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
    expect(setActiveToolType).not.toHaveBeenCalled();
    expect(store.getState().mapping.activeInteractionLayerID).toBe(
      CESIUM_ANNOTATION_LAYER_ID
    );
    expect(store.getState().mapping.activeInteractionButtonID).toBe(
      CESIUM_ANNOTATION_INTERACTION_ID
    );
  });

  it("keeps hash-activated measurement mode when mount cleanup removes a stale cesium annotation layer", async () => {
    const store = createTestStore();
    store.dispatch({
      type: "mapping/appendLayer",
      payload: buildCesiumAnnotationLayer(),
    });

    renderHook(
      () => {
        useGeoportalCesiumAnnotationLayerbar();

        useEffect(() => {
          store.dispatch(setUIMode(UIMode.MEASUREMENT));
        }, [store]);
      },
      {
        wrapper: createWrapper(store),
      }
    );

    await waitFor(() => {
      expect(store.getState().ui.mode).toBe(UIMode.MEASUREMENT);
      expect(findCesiumAnnotationLayer(store)).toBeDefined();
    });
  });

  it("falls back to default mode when the temporary cesium annotation layer is removed manually", async () => {
    const store = createTestStore();

    renderHook(() => useGeoportalCesiumAnnotationLayerbar(), {
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
      activeToolType: CESIUM_ANNOTATION_CONFIG.tools.defaultToolId,
      annotationEntries: [
        {
          id: "annotation-1",
          hidden: false,
        },
      ],
      registry: {
        getPlugin: (toolId: string) =>
          toolId === CESIUM_ANNOTATION_CONFIG.tools.defaultToolId
            ? { id: toolId }
            : undefined,
      },
      setActiveToolType,
      setSelectedAnnotationId,
      selectedAnnotationIds: [],
    });
    useAnnotationsDispatchMock.mockReturnValue(annotationsDispatch);

    renderHook(() => useGeoportalCesiumAnnotationLayerbar(), {
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

  it("returns from unavailable empty selection to the configured default tool", async () => {
    const store = createTestStore();

    useAnnotationsRuntimeMock.mockReturnValue({
      activeToolType: ANNOTATION_SELECT_TOOL_ID,
      annotationEntries: [],
      registry: {
        getPlugin: (toolId: string) =>
          toolId === CESIUM_ANNOTATION_CONFIG.tools.defaultToolId
            ? { id: toolId }
            : undefined,
      },
      setActiveToolType,
      setSelectedAnnotationId,
      selectedAnnotationIds: [],
    });

    act(() => {
      store.dispatch(setUIMode(UIMode.MEASUREMENT));
    });

    renderHook(() => useGeoportalCesiumAnnotationLayerbar(), {
      wrapper: createWrapper(store),
    });

    await waitFor(() => {
      expect(setActiveToolType).toHaveBeenCalledWith(
        CESIUM_ANNOTATION_CONFIG.tools.defaultToolId
      );
    });
  });

  it("mirrors the cesium annotation layer visibility to authoring annotations", async () => {
    const store = createTestStore();
    const annotationsDispatch = vi.fn();

    useAnnotationsDispatchMock.mockReturnValue(annotationsDispatch);
    useAnnotationsRuntimeMock.mockReturnValue({
      activeToolType: CESIUM_ANNOTATION_CONFIG.tools.defaultToolId,
      annotationEntries: [
        {
          id: "annotation-1",
          hidden: false,
        },
      ],
      registry: {
        getPlugin: (toolId: string) =>
          toolId === CESIUM_ANNOTATION_CONFIG.tools.defaultToolId
            ? { id: toolId }
            : undefined,
      },
      setActiveToolType,
      setSelectedAnnotationId,
      selectedAnnotationIds: ["annotation-1"],
    });

    renderHook(() => useGeoportalCesiumAnnotationLayerbar(), {
      wrapper: createWrapper(store),
    });

    act(() => {
      store.dispatch(setUIMode(UIMode.MEASUREMENT));
    });

    await waitFor(() => {
      expect(findCesiumAnnotationLayer(store)).toBeDefined();
    });

    act(() => {
      store.dispatch(
        changeVisibility({
          id: CESIUM_ANNOTATION_LAYER_ID,
          visible: false,
        })
      );
    });

    await waitFor(() => {
      expect(updateAnnotationEntryByIdMock).toHaveBeenCalledWith({
        annotationId: "annotation-1",
        hidden: true,
      });
      expect(annotationsDispatch).toHaveBeenCalledWith({
        type: "annotations/updateAnnotationEntryById",
        payload: {
          annotationId: "annotation-1",
          hidden: true,
        },
      });
      expect(setSelectedAnnotationId).toHaveBeenCalledWith(null);
    });
  });

  it("mirrors saved annotation layer visibility to its external collection", async () => {
    const store = createTestStore();
    const annotationsDispatch = vi.fn();

    store.dispatch({
      type: "mapping/appendLayer",
      payload: buildSavedAnnotationLayer(),
    });

    useAnnotationsDispatchMock.mockReturnValue(annotationsDispatch);
    useAnnotationsRuntimeMock.mockReturnValue({
      activeToolType: CESIUM_ANNOTATION_CONFIG.tools.defaultToolId,
      annotationEntries: [
        {
          id: "external-1",
          hidden: false,
          externalCollection: {
            type: "saved-measurement",
            id: "saved-annotations-1",
          },
        },
        {
          id: "external-2",
          hidden: false,
          externalCollection: {
            type: "saved-measurement",
            id: "other-collection",
          },
        },
      ],
      registry: {
        getPlugin: (toolId: string) =>
          toolId === CESIUM_ANNOTATION_CONFIG.tools.defaultToolId
            ? { id: toolId }
            : undefined,
      },
      setActiveToolType,
      setSelectedAnnotationId,
      selectedAnnotationIds: ["external-1"],
    });

    renderHook(() => useGeoportalCesiumAnnotationLayerbar(), {
      wrapper: createWrapper(store),
    });

    act(() => {
      store.dispatch(
        changeVisibility({
          id: "saved-annotations-1",
          visible: false,
        })
      );
    });

    await waitFor(() => {
      expect(updateAnnotationEntryByIdMock).toHaveBeenCalledWith({
        annotationId: "external-1",
        hidden: true,
      });
      expect(updateAnnotationEntryByIdMock).not.toHaveBeenCalledWith({
        annotationId: "external-2",
        hidden: true,
      });
      expect(annotationsDispatch).toHaveBeenCalledWith({
        type: "annotations/updateAnnotationEntryById",
        payload: {
          annotationId: "external-1",
          hidden: true,
        },
      });
      expect(setSelectedAnnotationId).toHaveBeenCalledWith(null);
    });
  });
});
