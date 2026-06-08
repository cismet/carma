import type { PropsWithChildren, ReactNode } from "react";

import { configureStore } from "@reduxjs/toolkit";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Layer } from "@carma-mapping/layers";

const useMapFrameworkSwitcherContextMock = vi.hoisted(() => vi.fn());
const useFeatureFlagsMock = vi.hoisted(() => vi.fn());
const useRuntimeAnnotationInfoBoxSlotsMock = vi.hoisted(() => vi.fn());
const cismapRuntimeAnnotationInfoBoxMock = vi.hoisted(() => vi.fn());
const resolveVisualOptionsMock = vi.hoisted(() => vi.fn());
const defaultAnnotationInfoBoxToolIdsMock = vi.hoisted(() => [
  "select",
  "point",
  "distance",
  "polyline",
  "area",
  "planar",
  "vertical",
  "label",
]);

vi.mock("@carma-mapping/components", () => ({
  useMapFrameworkSwitcherContext: () => useMapFrameworkSwitcherContextMock(),
}));

vi.mock("@carma-providers/feature-flag", () => ({
  useFeatureFlags: () => useFeatureFlagsMock(),
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
    CismapRuntimeAnnotationInfoBox: (props: {
      secondaryInfoBoxElements?: ReactNode[];
    }) => {
      const { secondaryInfoBoxElements = [] } = props;
      cismapRuntimeAnnotationInfoBoxMock(props);
      return React.createElement(
        "div",
        { "data-testid": "cismap-runtime-annotation-info-box" },
        secondaryInfoBoxElements
      );
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
    ANNOTATION_INFO_BOX_HELP_LAYOUTS: {
      COMPACT: "compact",
      STANDARD: "standard",
    },
    DEFAULT_ANNOTATION_INFO_BOX_TOOL_IDS: defaultAnnotationInfoBoxToolIdsMock,
    AnnotationInfoBoxContainer: () =>
      React.createElement("div", {
        "data-testid": "generic-annotation-info-box",
      }),
  };
});

vi.mock("../../helper/annotation-info-box-visual-options", () => ({
  resolveGeoportalAnnotationInfoBoxVisualOptions: resolveVisualOptionsMock,
}));

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

const buildCesiumAnnotationLayer = (): Layer => ({
  id: CESIUM_ANNOTATION_LAYER_ID,
  title: "Messung",
  type: "object",
  icon: "measurement",
  visible: true,
  pinned: "last",
  interactionButtons: {
    id: "cesium-annotation-tools",
    icon: "measurement",
  },
});

const enableCesiumAnnotationInfoBox = (store: TestStore) => {
  store.dispatch(setUIMode(UIMode.MEASUREMENT));
  store.dispatch(appendLayer(buildCesiumAnnotationLayer()));
};

describe("AnnotationInfoBox", () => {
  beforeEach(() => {
    cismapRuntimeAnnotationInfoBoxMock.mockClear();
    useFeatureFlagsMock.mockReset();
    useMapFrameworkSwitcherContextMock.mockReset();
    useRuntimeAnnotationInfoBoxSlotsMock.mockReset();
    resolveVisualOptionsMock.mockReset();
    useFeatureFlagsMock.mockReturnValue({
      featureFlagCesiumAnnotationAllTools: false,
    });
    useMapFrameworkSwitcherContextMock.mockReturnValue({
      isCesium: true,
    });
  });

  it("passes visible annotation state into the portals annotation info box renderer", () => {
    const infoBoxState = {
      kind: "annotation",
      annotation: {
        toolType: "planar",
      },
      instructionContent: "Werkzeughinweis",
      instructionToolId: "planar",
      slots: {
        headingTitle: "Messung",
      },
      visualOptions: {},
    };
    const secondaryInfoBoxElements = [<span key="secondary">Secondary</span>];
    useRuntimeAnnotationInfoBoxSlotsMock.mockReturnValue(infoBoxState);
    const store = createTestStore();
    enableCesiumAnnotationInfoBox(store);

    render(
      <AnnotationInfoBox secondaryInfoBoxElements={secondaryInfoBoxElements} />,
      {
        wrapper: createWrapper(store),
      }
    );

    expect(
      screen.getByTestId("cismap-runtime-annotation-info-box")
    ).toBeTruthy();
    expect(cismapRuntimeAnnotationInfoBoxMock).toHaveBeenCalledWith(
      expect.objectContaining({
        infoBoxState,
        isCesium: true,
        annotationToolIds: ["select", "point", "distance"],
        layoutProps: expect.objectContaining({
          controlOrder: expect.any(Number),
          pixelWidth: expect.any(Number),
        }),
        secondaryInfoBoxElements,
      })
    );
  });

  it("requests compact German fallback help in Cesium", () => {
    useRuntimeAnnotationInfoBoxSlotsMock.mockReturnValue({
      kind: "fallback",
      plugin: {
        id: "select",
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
        fallbackHelpLayout: "compact",
        helpLocale: "de-DE",
      })
    );
    expect(
      screen.getByTestId("cismap-runtime-annotation-info-box")
    ).toBeTruthy();
  });

  it("does not request compact fallback help layout outside Cesium", () => {
    useMapFrameworkSwitcherContextMock.mockReturnValue({
      isCesium: false,
    });
    useRuntimeAnnotationInfoBoxSlotsMock.mockReturnValue({
      kind: "fallback",
      plugin: {
        id: "select",
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
    expect(cismapRuntimeAnnotationInfoBoxMock).not.toHaveBeenCalled();
  });

  it("uses the alltools flag for the active Cismap annotation tool ids", () => {
    useFeatureFlagsMock.mockReturnValue({
      featureFlagCesiumAnnotationAllTools: true,
    });
    useRuntimeAnnotationInfoBoxSlotsMock.mockReturnValue({
      kind: "annotation",
      annotation: {
        toolType: "point",
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

    expect(useRuntimeAnnotationInfoBoxSlotsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        visualOptions: resolveVisualOptionsMock,
      })
    );
    expect(cismapRuntimeAnnotationInfoBoxMock).toHaveBeenCalledWith(
      expect.objectContaining({
        annotationToolIds: defaultAnnotationInfoBoxToolIdsMock,
      })
    );
  });

  it("does not render without visible annotation state", () => {
    useRuntimeAnnotationInfoBoxSlotsMock.mockReturnValue(null);
    const store = createTestStore();
    enableCesiumAnnotationInfoBox(store);

    render(<AnnotationInfoBox />, {
      wrapper: createWrapper(store),
    });

    expect(cismapRuntimeAnnotationInfoBoxMock).not.toHaveBeenCalled();
  });
});
