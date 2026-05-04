import type { PropsWithChildren, ReactNode } from "react";

import { configureStore } from "@reduxjs/toolkit";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useMapFrameworkSwitcherContextMock = vi.hoisted(() => vi.fn());
const useRuntimeAnnotationInfoBoxSlotsMock = vi.hoisted(() => vi.fn());

vi.mock("@carma-mapping/components", () => ({
  useMapFrameworkSwitcherContext: () => useMapFrameworkSwitcherContextMock(),
}));

vi.mock("@carma-appframeworks/portals", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  return {
    CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS: {
      hiddenActionIds: ["reference"],
      showSubtitleMetaText: true,
    },
    SELECTED_LAYER_INDEX: {
      NO_SELECTION: -1,
      BACKGROUND_LAYER: -2,
    },
    CismapAnnotationInfoBox: ({
      secondaryInfoBoxElements = [],
    }: {
      secondaryInfoBoxElements?: ReactNode[];
    }) =>
      React.createElement(
        "div",
        { "data-testid": "cismap-annotation-info-box" },
        secondaryInfoBoxElements
      ),
    CismapAnnotationInstructionInfoBox: () =>
      React.createElement("div", {
        "data-testid": "cismap-annotation-instruction-info-box",
      }),
  };
});

vi.mock("@carma-mapping/annotations/runtime", () => ({
  RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS: {
    ANNOTATION: "annotation",
    FALLBACK: "fallback",
  },
  useRuntimeAnnotationInfoBoxSlots: () =>
    useRuntimeAnnotationInfoBoxSlotsMock(),
}));

vi.mock("@carma-mapping/annotations/ui", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  return {
    ANNOTATION_INFO_BOX_ACTION_IDS: {
      REFERENCE: "reference",
    },
    AnnotationInfoBoxContainer: () =>
      React.createElement("div", {
        "data-testid": "generic-annotation-info-box",
      }),
  };
});

import mappingReducer, { appendLayer } from "../../store/slices/mapping";
import uiReducer, { setUIMode, UIMode } from "../../store/slices/ui";
import { CESIUM_ANNOTATION_LAYER_ID } from "./cesium-annotations.constants";
import AnnotationInfoBox from "./AnnotationInfoBox";

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

const enableCesiumAnnotationInfoBox = (store: TestStore) => {
  store.dispatch(setUIMode(UIMode.MEASUREMENT));
  store.dispatch(appendLayer(buildCesiumAnnotationLayer()));
};

describe("AnnotationInfoBox", () => {
  beforeEach(() => {
    useMapFrameworkSwitcherContextMock.mockReset();
    useRuntimeAnnotationInfoBoxSlotsMock.mockReset();
    useMapFrameworkSwitcherContextMock.mockReturnValue({
      isCesium: true,
    });
  });

  it("renders selected label annotations through the Cismap info box", () => {
    useRuntimeAnnotationInfoBoxSlotsMock.mockReturnValue({
      kind: "annotation",
      annotation: {
        toolType: "label",
      },
      slots: {
        headingTitle: "Beschriftung",
      },
      visualOptions: {},
    });
    const store = createTestStore();
    enableCesiumAnnotationInfoBox(store);

    render(<AnnotationInfoBox />, {
      wrapper: createWrapper(store),
    });

    expect(screen.getByTestId("cismap-annotation-info-box")).toBeTruthy();
    expect(screen.queryByTestId("generic-annotation-info-box")).toBeNull();
  });

  it("renders label tool instructions through the Cismap instruction info box", () => {
    useRuntimeAnnotationInfoBoxSlotsMock.mockReturnValue({
      kind: "fallback",
      plugin: {
        id: "label",
      },
      slots: {
        content: "Beschriftung setzen",
      },
      visualOptions: {},
    });
    const store = createTestStore();
    enableCesiumAnnotationInfoBox(store);

    render(<AnnotationInfoBox />, {
      wrapper: createWrapper(store),
    });

    expect(
      screen.getByTestId("cismap-annotation-instruction-info-box")
    ).toBeTruthy();
    expect(screen.queryByTestId("generic-annotation-info-box")).toBeNull();
  });
});
