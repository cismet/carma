import type { PropsWithChildren, ReactNode } from "react";

import { configureStore } from "@reduxjs/toolkit";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ANNOTATION_SELECT_TOOL_ID,
  ANNOTATION_TYPES,
} from "@carma-mapping/annotations/core";

const useMapFrameworkSwitcherContextMock = vi.hoisted(() => vi.fn());
const useRuntimeAnnotationInfoBoxSlotsMock = vi.hoisted(() => vi.fn());
const cismapAnnotationInfoBoxMock = vi.hoisted(() => vi.fn());
const cismapAnnotationInstructionInfoBoxMock = vi.hoisted(() => vi.fn());

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
    CismapAnnotationInfoBox: (props: {
      instructionContent?: ReactNode;
      instructionSlotClosable?: boolean;
      instructionSlotStorageKey?: string;
      secondaryInfoBoxElements?: ReactNode[];
    }) => {
      const { secondaryInfoBoxElements = [] } = props;
      cismapAnnotationInfoBoxMock(props);
      return React.createElement(
        "div",
        { "data-testid": "cismap-annotation-info-box" },
        props.instructionContent,
        secondaryInfoBoxElements
      );
    },
    CismapAnnotationInstructionInfoBox: (props: {
      instructionSlotClosable?: boolean;
      instructionSlotStorageKey?: string;
    }) => {
      cismapAnnotationInstructionInfoBoxMock(props);
      return React.createElement("div", {
        "data-testid": "cismap-annotation-instruction-info-box",
      });
    },
  };
});

vi.mock("@carma-mapping/annotations/runtime", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@carma-mapping/annotations/runtime")
  >();

  return {
    ...actual,
    RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS: {
      ANNOTATION: "annotation",
      FALLBACK: "fallback",
    },
    useRuntimeAnnotationInfoBoxSlots: (options: unknown) =>
      useRuntimeAnnotationInfoBoxSlotsMock(options),
  };
});

vi.mock("@carma-mapping/annotations/ui", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  return {
    ANNOTATION_INFO_BOX_ACTION_IDS: {
      REFERENCE: "reference",
    },
    ANNOTATION_INFO_BOX_HELP_LAYOUTS: {
      COMPACT: "compact",
      STANDARD: "standard",
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

const cismapAnnotationToolTypes = [
  ANNOTATION_TYPES.POINT,
  ANNOTATION_TYPES.DISTANCE,
  ANNOTATION_TYPES.LABEL,
  ANNOTATION_TYPES.POLYLINE,
  ANNOTATION_TYPES.AREA_GROUND,
  ANNOTATION_TYPES.AREA_PLANAR,
  ANNOTATION_TYPES.AREA_VERTICAL,
] as const;

const instructionToolIds = [
  ANNOTATION_SELECT_TOOL_ID,
  ...cismapAnnotationToolTypes,
  "experimental-roof-tool",
];

describe("AnnotationInfoBox", () => {
  beforeEach(() => {
    cismapAnnotationInfoBoxMock.mockClear();
    cismapAnnotationInstructionInfoBoxMock.mockClear();
    useMapFrameworkSwitcherContextMock.mockReset();
    useRuntimeAnnotationInfoBoxSlotsMock.mockReset();
    useMapFrameworkSwitcherContextMock.mockReturnValue({
      isCesium: true,
    });
  });

  it.each(cismapAnnotationToolTypes)(
    "renders selected %s annotations through the Cismap info box",
    (toolType) => {
      useRuntimeAnnotationInfoBoxSlotsMock.mockReturnValue({
        kind: "annotation",
        annotation: {
          toolType,
        },
        slots: {
          headingTitle: "Messung",
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
    }
  );

  it("passes selected Cesium annotation instructions into the Cismap instruction slot", () => {
    useRuntimeAnnotationInfoBoxSlotsMock.mockReturnValue({
      kind: "annotation",
      annotation: {
        toolType: ANNOTATION_TYPES.AREA_PLANAR,
      },
      instructionContent: "Werkzeughinweis",
      instructionToolId: ANNOTATION_TYPES.AREA_PLANAR,
      slots: {
        headingTitle: "Messung",
      },
      visualOptions: {},
    });
    const store = createTestStore();
    enableCesiumAnnotationInfoBox(store);

    render(<AnnotationInfoBox />, {
      wrapper: createWrapper(store),
    });

    expect(cismapAnnotationInfoBoxMock).toHaveBeenCalledWith(
      expect.objectContaining({
        instructionContent: "Werkzeughinweis",
        instructionSlotClosable: true,
        instructionSlotStorageKey: `geoportal:annotation-help-collapsed:${ANNOTATION_TYPES.AREA_PLANAR}`,
      })
    );
    expect(screen.getByText("Werkzeughinweis")).toBeTruthy();
  });

  it.each(instructionToolIds)(
    "renders %s tool instructions through the Cismap instruction info box",
    (toolId) => {
      useRuntimeAnnotationInfoBoxSlotsMock.mockReturnValue({
        kind: "fallback",
        plugin: {
          id: toolId,
        },
        slots: {
          content: "Werkzeughinweis",
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
      expect(useRuntimeAnnotationInfoBoxSlotsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          fallbackHelpLayout: "compact",
          helpLocale: "de-DE",
        })
      );
      expect(cismapAnnotationInstructionInfoBoxMock).toHaveBeenCalledWith(
        expect.objectContaining({
          instructionSlotClosable: true,
          instructionSlotStorageKey: `geoportal:annotation-help-collapsed:${toolId}`,
        })
      );
      expect(screen.queryByTestId("generic-annotation-info-box")).toBeNull();
    }
  );

  it("does not request compact fallback help layout outside Cesium", () => {
    useMapFrameworkSwitcherContextMock.mockReturnValue({
      isCesium: false,
    });
    useRuntimeAnnotationInfoBoxSlotsMock.mockReturnValue({
      kind: "fallback",
      plugin: {
        id: ANNOTATION_SELECT_TOOL_ID,
      },
      slots: {
        content: "Werkzeughinweis",
      },
      visualOptions: {},
    });
    const store = createTestStore();
    enableCesiumAnnotationInfoBox(store);

    render(<AnnotationInfoBox />, {
      wrapper: createWrapper(store),
    });

    expect(useRuntimeAnnotationInfoBoxSlotsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackHelpLayout: undefined,
        helpLocale: "de-DE",
      })
    );
    expect(
      screen.queryByTestId("cismap-annotation-instruction-info-box")
    ).toBeNull();
  });
});
