// @vitest-environment jsdom
import type { CSSProperties, ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ANNOTATION_INFO_BOX_ACTION_IDS } from "@carma-mapping/annotations/ui";

const responsiveInfoBoxMock = vi.hoisted(() =>
  vi.fn(
    ({
      alwaysVisibleDiv,
      collapsibleDiv,
      header,
      secondaryInfoBoxElements = [],
    }) => (
      <div data-test-id="mock-responsive-info-box">
        <div data-test-id="mock-header">{header}</div>
        <div data-test-id="mock-secondary">
          {secondaryInfoBoxElements.map((element: ReactNode, index: number) => (
            <div key={index}>{element}</div>
          ))}
        </div>
        <div data-test-id="mock-always-visible">{alwaysVisibleDiv}</div>
        <div data-test-id="mock-collapsible">{collapsibleDiv}</div>
      </div>
    )
  )
);

vi.mock("./ResponsiveInfoBox", () => ({
  ResponsiveInfoBox: responsiveInfoBoxMock,
}));

vi.mock("@carma-mapping/map-controls-layout", () => ({
  Control: ({
    children,
    order,
    position,
  }: {
    children: ReactNode;
    order?: number;
    position?: string;
  }) => (
    <div data-test-id="mock-control" data-order={order} data-position={position}>
      {children}
    </div>
  ),
}));

vi.mock("react-cismap/commons/Icon", () => ({
  default: ({
    name,
    className,
    style,
    "data-test-id": dataTestId,
    "aria-label": ariaLabel,
  }: {
    name: string;
    className?: string;
    style?: CSSProperties;
    "data-test-id"?: string;
    "aria-label"?: string;
  }) => (
    <svg
      data-cismap-icon-name={name}
      className={className}
      style={style}
      data-test-id={dataTestId}
      aria-label={ariaLabel}
    />
  ),
}));

import {
  CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS,
  CismapAnnotationInfoBox,
  CismapAnnotationInstructionInfoBox,
} from "./CismapAnnotationInfoBox";

describe("CismapAnnotationInfoBox", () => {
  beforeEach(() => {
    responsiveInfoBoxMock.mockClear();
    window.localStorage.clear();
  });

  it("maps annotation slots to the legacy ResponsiveInfoBox shell", () => {
    const { unmount } = render(
      <CismapAnnotationInfoBox
        controlOrder={12}
        pixelWidth={420}
        secondaryInfoBoxElements={[<span key="secondary">Secondary box</span>]}
        slots={{
          collapsible: false,
          content: <span>Detail content</span>,
          footer: <span>Footer content</span>,
          headingColor: "#eeeeee",
          headingTitle: "Distance",
          subtitle: <span>Subtitle content</span>,
        }}
      />
    );

    expect(responsiveInfoBoxMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        controlOrder: 12,
        fixedRow: true,
        isCollapsible: false,
        pixelwidth: 420,
        secondaryInfoBoxElements: expect.arrayContaining([expect.anything()]),
      })
    );
    expect(screen.getByText("Messungen")).toBeTruthy();
    expect(screen.getByText("Subtitle content")).toBeTruthy();
    expect(screen.getByText("Detail content")).toBeTruthy();
    expect(screen.getByText("Footer content")).toBeTruthy();
  });

  it("can render closable instruction content above selected annotation info", () => {
    render(
      <CismapAnnotationInfoBox
        controlOrder={12}
        instructionContent={<span>Instruction content</span>}
        instructionSlotClosable
        pixelWidth={420}
        slots={{
          content: <span>Detail content</span>,
          headingTitle: "Distance",
        }}
      />
    );

    expect(responsiveInfoBoxMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        secondaryInfoBoxElements: expect.arrayContaining([expect.anything()]),
      })
    );
    expect(
      document.querySelector('[data-test-id="annotation-instruction-slot"]')
    ).toBeTruthy();
    expect(
      document
        .querySelector('[data-test-id="annotation-instruction-slot"]')
        ?.getAttribute("class")
    ).not.toContain("bg-white/90");
    expect(screen.getByText("Instruction content")).toBeTruthy();

    const closeButton = document.querySelector(
      '[data-test-id="annotation-instruction-slot-close"]'
    );
    expect(closeButton).toBeTruthy();
    fireEvent.click(closeButton!);

    expect(screen.queryByText("Instruction content")).toBeNull();
    expect(
      document.querySelector(
        '[data-test-id="annotation-instruction-slot-open"]'
      )
    ).toBeTruthy();
    expect(
      document
        .querySelector('[data-test-id="annotation-instruction-slot-open"]')
        ?.getAttribute("class")
    ).toContain("rounded-full");
    expect(
      document
        .querySelector('[data-test-id="annotation-instruction-slot-open"]')
        ?.getAttribute("class")
    ).toContain("bg-white");
    expect(document.querySelector(".fa-circle-question")).toBeTruthy();
    expect(
      document
        .querySelector(".fa-circle-question")
        ?.getAttribute("class")
    ).not.toContain("animate");
  });

  it("keeps closable instruction slots collapsed through local storage", () => {
    const { unmount } = render(
      <CismapAnnotationInfoBox
        controlOrder={12}
        instructionContent={<span>Instruction content</span>}
        instructionSlotClosable
        instructionSlotStorageKey="annotation-help:test-tool"
        pixelWidth={420}
        slots={{
          content: <span>Detail content</span>,
          headingTitle: "Distance",
        }}
      />
    );

    const closeButton = document.querySelector(
      '[data-test-id="annotation-instruction-slot-close"]'
    );
    fireEvent.click(closeButton!);

    expect(window.localStorage.getItem("annotation-help:test-tool")).toBe(
      "collapsed"
    );
    unmount();

    render(
      <CismapAnnotationInfoBox
        controlOrder={12}
        instructionContent={<span>Instruction content</span>}
        instructionSlotClosable
        instructionSlotStorageKey="annotation-help:test-tool"
        pixelWidth={420}
        slots={{
          content: <span>Detail content</span>,
          headingTitle: "Distance",
        }}
      />
    );

    expect(
      document.querySelector(
        '[data-test-id="annotation-instruction-slot-open"]'
      )
    ).toBeTruthy();
  });

  it("renders instruction content in the compact Cismap shell", () => {
    render(
      <CismapAnnotationInstructionInfoBox
        content={<span>Instruction content</span>}
        controlOrder={12}
      />
    );

    expect(responsiveInfoBoxMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        collapsibleDiv: expect.anything(),
        controlOrder: 12,
        fixedRow: false,
        header: "",
        isCollapsible: false,
        pixelwidth: 350,
      })
    );
    expect(
      responsiveInfoBoxMock.mock.calls[0]?.[0].collapsibleStyle
    ).toBeUndefined();
    const instructionContainer = document.querySelector(
      '[data-test-id="empty-annotation-info"]'
    );

    expect(instructionContainer).toBeTruthy();
    expect(instructionContainer?.getAttribute("class")).toContain(
      "font-normal"
    );
    expect(instructionContainer?.getAttribute("class")).toContain("w-[90%]");
    expect(screen.getByText("Instruction content")).toBeTruthy();
  });

  it("keeps the legacy instruction shell when shrinkToContent is requested", () => {
    render(
      <CismapAnnotationInstructionInfoBox
        content={<span>Instruction content</span>}
        shrinkToContent
      />
    );

    const responsiveInfoBoxProps = responsiveInfoBoxMock.mock.calls[0]?.[0];

    expect(responsiveInfoBoxProps).toEqual(
      expect.objectContaining({
        pixelwidth: 350,
      })
    );
    expect(responsiveInfoBoxProps).not.toHaveProperty("infoStyle");
    expect(responsiveInfoBoxProps).not.toHaveProperty("collapsibleStyle");
    const instructionContainer = document.querySelector(
      '[data-test-id="empty-annotation-info"]'
    );

    expect(instructionContainer?.getAttribute("class")).toContain("w-[90%]");
    expect(instructionContainer?.getAttribute("class")).toContain("p-2");
  });

  it("keeps the compact instruction content padding when the slot is closable", () => {
    render(
      <CismapAnnotationInstructionInfoBox
        content={<span>Instruction content</span>}
        instructionSlotClosable
        shrinkToContent
      />
    );

    const instructionSlot = document.querySelector(
      '[data-test-id="annotation-instruction-slot"]'
    );
    const instructionContainer = document.querySelector(
      '[data-test-id="empty-annotation-info"]'
    );

    expect(instructionSlot?.contains(instructionContainer)).toBe(true);
    expect(instructionContainer?.getAttribute("class")).toContain("p-2");
    expect(instructionContainer?.getAttribute("class")).toContain("w-[90%]");
  });

  it("renders only the round icon control when compact instruction content is collapsed", () => {
    render(
      <CismapAnnotationInstructionInfoBox
        content={<span>Instruction content</span>}
        instructionSlotClosable
        instructionSlotInitiallyCollapsed
        controlOrder={12}
      />
    );

    const openButton = document.querySelector(
      '[data-test-id="annotation-instruction-slot-open"]'
    );

    expect(responsiveInfoBoxMock).not.toHaveBeenCalled();
    expect(openButton).toBeTruthy();
    expect(openButton?.getAttribute("class")).toContain("rounded-full");
    expect(openButton?.getAttribute("class")).toContain("bg-white");
    expect(document.querySelector(".fa-circle-question")).toBeTruthy();
    expect(document.querySelectorAll('[data-test-id="mock-control"]')).toHaveLength(
      1
    );
    expect(
      document
        .querySelector('[data-test-id="mock-control"]')
        ?.getAttribute("data-order")
    ).toBe("12");
  });

  it("keeps the Cismap title input visually aligned with 2D measurement headings while hiding non-2D measurement actions", () => {
    expect(
      CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS.titleTextClassName
    ).toContain("font-bold");
    expect(
      CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS.titleInputClassName
    ).toContain("font-bold");
    expect(
      CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS.titleInputClassName
    ).toContain("border-0");
    expect(
      CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS.titleInputClassName
    ).not.toContain("border border-transparent");
    expect(
      CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS.titleInputClassName
    ).toContain("focus:outline-none");
    expect(CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS.hiddenActionIds).toEqual([
      ANNOTATION_INFO_BOX_ACTION_IDS.EXPORT,
      ANNOTATION_INFO_BOX_ACTION_IDS.VISIBILITY,
      ANNOTATION_INFO_BOX_ACTION_IDS.REFERENCE,
      ANNOTATION_INFO_BOX_ACTION_IDS.LOCK,
    ]);
    expect(
      CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS.navigationControlLabels
    ).toEqual({
      previous: "<<",
      next: ">>",
    });
  });

  it("uses the same Cismap search-location icon for the fly-to action as the layerbar", () => {
    const icon = CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS.renderActionIcon?.({
      actionId: ANNOTATION_INFO_BOX_ACTION_IDS.FLY_TO,
      ariaLabel: "Zur Messung fliegen",
      className: "icon-class",
      dataTestId: "fly-to-icon",
      disabled: false,
      icon: {} as never,
      style: {
        color: "#808080",
        fontSize: "16px",
      },
    });

    render(<>{icon}</>);

    const renderedIcon = document.querySelector(
      '[data-cismap-icon-name="search-location"]'
    );

    expect(renderedIcon).toBeTruthy();
    expect(renderedIcon?.getAttribute("data-test-id")).toBe("fly-to-icon");
    expect(renderedIcon?.getAttribute("class")).toBe("icon-class");
  });
});
