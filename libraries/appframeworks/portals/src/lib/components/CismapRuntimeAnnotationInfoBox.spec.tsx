// @vitest-environment jsdom
import type { ReactNode } from "react";

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ANNOTATION_SELECT_TOOL_ID,
  ANNOTATION_TYPES,
  type AnnotationToolId,
} from "@carma-mapping/annotations/core";
import type { RuntimeAnnotationInfoBoxSlotsState } from "@carma-mapping/annotations/runtime";

const runtimeAnnotationInfoBoxSlotStateKindsMock = vi.hoisted(() => ({
  ANNOTATION: "annotation",
  FALLBACK: "fallback",
}));
const annotationInfoBoxContainerMock = vi.hoisted(() => vi.fn());
const cismapAnnotationInfoBoxMock = vi.hoisted(() => vi.fn());
const cismapAnnotationInstructionInfoBoxMock = vi.hoisted(() => vi.fn());
const annotationToolIds = [
  ANNOTATION_SELECT_TOOL_ID,
  ANNOTATION_TYPES.POINT,
  ANNOTATION_TYPES.DISTANCE,
  ANNOTATION_TYPES.POLYLINE,
  ANNOTATION_TYPES.AREA_GROUND,
  ANNOTATION_TYPES.AREA_PLANAR,
  ANNOTATION_TYPES.AREA_VERTICAL,
  ANNOTATION_TYPES.LABEL,
] as const satisfies readonly AnnotationToolId[];

vi.mock("@carma-mapping/annotations/runtime", () => ({
  RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS:
    runtimeAnnotationInfoBoxSlotStateKindsMock,
}));

vi.mock("@carma-mapping/annotations/ui", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  return {
    AnnotationInfoBoxContainer: (props: object) => {
      annotationInfoBoxContainerMock(props);
      return React.createElement("div", {
        "data-testid": "generic-annotation-info-box",
      });
    },
  };
});

vi.mock("./CismapAnnotationInfoBox", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  return {
    CismapAnnotationInfoBox: (props: {
      instructionContent?: ReactNode;
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
      content?: ReactNode;
      headerTitle?: ReactNode;
      pixelWidth?: number;
      visualOptions?: object;
      secondaryInfoBoxElements?: ReactNode[];
    }) => {
      const { secondaryInfoBoxElements = [] } = props;
      cismapAnnotationInstructionInfoBoxMock(props);
      return React.createElement(
        "div",
        { "data-testid": "cismap-annotation-instruction-info-box" },
        props.content,
        secondaryInfoBoxElements
      );
    },
  };
});

import { CismapRuntimeAnnotationInfoBox } from "./CismapRuntimeAnnotationInfoBox";

const createAnnotationState = (
  toolType: string
): RuntimeAnnotationInfoBoxSlotsState =>
  ({
    kind: runtimeAnnotationInfoBoxSlotStateKindsMock.ANNOTATION,
    annotation: {
      toolType,
    },
    instructionContent: "Werkzeughinweis",
    instructionToolId: toolType,
    slots: {
      content: <span>Detail content</span>,
      headingTitle: "Messung",
    },
    visualOptions: {
      headingColor: "#ffffff",
    },
  } as unknown as RuntimeAnnotationInfoBoxSlotsState);

const createFallbackState = (
  visualOptions: object = {}
): RuntimeAnnotationInfoBoxSlotsState =>
  ({
    kind: runtimeAnnotationInfoBoxSlotStateKindsMock.FALLBACK,
    plugin: {
      id: ANNOTATION_SELECT_TOOL_ID,
    },
    slots: {
      content: <span>Fallback content</span>,
    },
    visualOptions,
  } as unknown as RuntimeAnnotationInfoBoxSlotsState);

describe("CismapRuntimeAnnotationInfoBox", () => {
  beforeEach(() => {
    annotationInfoBoxContainerMock.mockClear();
    cismapAnnotationInfoBoxMock.mockClear();
    cismapAnnotationInstructionInfoBoxMock.mockClear();
  });

  it("renders fallback tutorials through the Cismap instruction info box", () => {
    const secondaryInfoBoxElements = [<span key="secondary">Secondary</span>];
    const fallbackState = createFallbackState();

    render(
      <CismapRuntimeAnnotationInfoBox
        infoBoxState={fallbackState}
        isCesium={true}
        annotationToolIds={annotationToolIds}
        layoutProps={{
          controlOrder: 12,
          pixelWidth: 420,
        }}
        secondaryInfoBoxElements={secondaryInfoBoxElements}
      />
    );

    expect(
      screen.getByTestId("cismap-annotation-instruction-info-box")
    ).toBeTruthy();
    expect(cismapAnnotationInstructionInfoBoxMock).toHaveBeenCalledWith(
      expect.objectContaining({
        content: fallbackState.slots.content,
        controlOrder: 12,
        pixelWidth: 420,
        secondaryInfoBoxElements,
        visualOptions: fallbackState.visualOptions,
      })
    );
    expect(cismapAnnotationInfoBoxMock).not.toHaveBeenCalled();
    expect(annotationInfoBoxContainerMock).not.toHaveBeenCalled();
  });

  it("keeps development-only fallback tutorials on the Cismap shell with a title stripe", () => {
    const fallbackState = createFallbackState({
      headerStyle: {
        backgroundImage: "linear-gradient(red, blue)",
      },
    });

    render(
      <CismapRuntimeAnnotationInfoBox
        infoBoxState={fallbackState}
        isCesium={true}
        annotationToolIds={annotationToolIds}
      />
    );

    expect(cismapAnnotationInstructionInfoBoxMock).toHaveBeenCalledWith(
      expect.objectContaining({
        headerTitle: "Messungen",
        visualOptions: fallbackState.visualOptions,
      })
    );
  });

  it("renders supported annotation tools through the Cismap info box", () => {
    const annotationState = createAnnotationState(ANNOTATION_TYPES.AREA_PLANAR);

    render(
      <CismapRuntimeAnnotationInfoBox
        infoBoxState={annotationState}
        isCesium={true}
        annotationToolIds={annotationToolIds}
        layoutProps={{
          controlOrder: 12,
          pixelWidth: 420,
        }}
      />
    );

    expect(screen.getByTestId("cismap-annotation-info-box")).toBeTruthy();
    expect(cismapAnnotationInfoBoxMock).toHaveBeenCalledWith(
      expect.objectContaining({
        controlOrder: 12,
        instructionContent: "Werkzeughinweis",
        pixelWidth: 420,
        slots: annotationState.slots,
        visualOptions: annotationState.visualOptions,
      })
    );
    expect(annotationInfoBoxContainerMock).not.toHaveBeenCalled();
  });

  it("passes custom header titles through to supported annotation tools", () => {
    const annotationState = createAnnotationState(ANNOTATION_TYPES.DISTANCE);

    render(
      <CismapRuntimeAnnotationInfoBox
        infoBoxState={annotationState}
        isCesium={true}
        annotationToolIds={annotationToolIds}
        headerBackgroundColor="#3b82f6"
        headerTextColor="white"
        headerTitle="Informationen"
      />
    );

    expect(cismapAnnotationInfoBoxMock).toHaveBeenCalledWith(
      expect.objectContaining({
        headerBackgroundColor: "#3b82f6",
        headerTextColor: "white",
        headerTitle: "Informationen",
      })
    );
  });

  it("hides selected annotation instructions outside Cesium", () => {
    const annotationState = createAnnotationState(ANNOTATION_TYPES.AREA_PLANAR);

    render(
      <CismapRuntimeAnnotationInfoBox
        infoBoxState={annotationState}
        isCesium={false}
        annotationToolIds={annotationToolIds}
      />
    );

    expect(cismapAnnotationInfoBoxMock).toHaveBeenCalledWith(
      expect.objectContaining({
        instructionContent: undefined,
      })
    );
  });

  it("falls back to the generic annotation info box for unsupported tools", () => {
    const annotationState = createAnnotationState("experimental-roof-tool");

    render(
      <CismapRuntimeAnnotationInfoBox
        infoBoxState={annotationState}
        isCesium={true}
        annotationToolIds={annotationToolIds}
        layoutProps={{
          controlOrder: 12,
          pixelWidth: 420,
        }}
      />
    );

    expect(screen.getByTestId("generic-annotation-info-box")).toBeTruthy();
    expect(annotationInfoBoxContainerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        controlOrder: 12,
        pixelWidth: 420,
        slots: annotationState.slots,
        visualOptions: annotationState.visualOptions,
      })
    );
    expect(cismapAnnotationInfoBoxMock).not.toHaveBeenCalled();
  });

  it("uses the app-provided Cismap tool ids as the active renderer set", () => {
    const annotationState = createAnnotationState(ANNOTATION_TYPES.AREA_PLANAR);

    render(
      <CismapRuntimeAnnotationInfoBox
        infoBoxState={annotationState}
        isCesium={true}
        annotationToolIds={[ANNOTATION_TYPES.POINT]}
      />
    );

    expect(screen.getByTestId("generic-annotation-info-box")).toBeTruthy();
    expect(annotationInfoBoxContainerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        slots: annotationState.slots,
      })
    );
    expect(cismapAnnotationInfoBoxMock).not.toHaveBeenCalled();
  });
});
