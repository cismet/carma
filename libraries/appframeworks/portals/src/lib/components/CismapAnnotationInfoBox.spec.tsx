// @vitest-environment jsdom
import type { CSSProperties, ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ANNOTATION_INFO_BOX_ACTION_IDS,
  annotationInfoBoxVisualDefaults,
  buildAnnotationInfoBoxSlots,
} from "@carma-mapping/annotations/ui";

const responsiveInfoBoxMock = vi.hoisted(() =>
  vi.fn(
    ({
      alwaysVisibleDiv,
      collapsibleDiv,
      header,
      headerBackgroundColor,
      headerStyle,
      infoBoxDataAttributes,
      secondaryInfoBoxElements = [],
    }) => (
      <div data-test-id="mock-responsive-info-box" {...infoBoxDataAttributes}>
        <div
          data-test-id="mock-header"
          style={{ backgroundColor: headerBackgroundColor, ...headerStyle }}
        >
          {header}
        </div>
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
  CISMAP_ANNOTATION_INFO_BOX_GENERIC_VISUAL_OPTIONS,
  CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS,
  CismapAnnotationInfoBox,
  CismapAnnotationInstructionInfoBox,
} from "./CismapAnnotationInfoBox";

describe("CismapAnnotationInfoBox", () => {
  beforeEach(() => {
    responsiveInfoBoxMock.mockClear();
  });

  it("maps annotation slots to the legacy ResponsiveInfoBox shell", () => {
    const { unmount } = render(
      <CismapAnnotationInfoBox
        controlOrder={12}
        pixelWidth={420}
        secondaryInfoBoxElements={[<span key="secondary">Secondary box</span>]}
        visualOptions={{
          headerStyle: {
            backgroundImage: "linear-gradient(red, blue)",
          },
        }}
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
        collapsibleStyle: expect.objectContaining({
          backgroundColor: "#f5f5f5",
          border: "1px solid #e3e3e3",
          borderRadius: "4px",
          boxShadow: "rgba(0, 0, 0, 0.05) 0px 1px 1px inset",
          minHeight: "20px",
          padding: "0px 0px 0px 0.5625rem",
        }),
        controlOrder: 12,
        fixedRow: true,
        isCollapsible: false,
        pixelwidth: 420,
        secondaryInfoBoxElements: expect.arrayContaining([expect.anything()]),
      })
    );
    const responsiveInfoBoxProps = responsiveInfoBoxMock.mock.calls[0]?.[0];
    expect(responsiveInfoBoxProps.headerBackgroundColor).toBeUndefined();
    expect(responsiveInfoBoxProps.headerStyle).toBeUndefined();
    const headerElement = responsiveInfoBoxProps.header as {
      props: {
        children: ReactNode;
        className?: string;
        style?: CSSProperties;
      };
    };

    expect(headerElement.props.children).toBe("Messungen");
    expect(headerElement.props.className).toBe("w-full");
    expect(headerElement.props.style).toEqual({
      backgroundColor: "#eeeeee",
      backgroundImage: "linear-gradient(red, blue)",
    });
    expect(screen.getByText("Messungen")).toBeTruthy();
    expect(screen.getByText("Subtitle content")).toBeTruthy();
    expect(screen.getByText("Detail content")).toBeTruthy();
    expect(screen.getByText("Footer content")).toBeTruthy();
  });

  it("can render instruction content above selected annotation info without passing pointer queries through", () => {
    render(
      <CismapAnnotationInfoBox
        controlOrder={12}
        instructionContent={<span>Instruction content</span>}
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
    const instructionSlot = document.querySelector(
      '[data-test-id="annotation-instruction-slot"]'
    );

    expect(instructionSlot).toBeTruthy();
    expect(
      instructionSlot?.getAttribute("data-carma-pointer-query-preserve")
    ).toBe("true");
    expect(instructionSlot?.getAttribute("class")).toContain("bg-white");
    expect(instructionSlot?.getAttribute("class")).toContain("rounded");
    expect(instructionSlot?.getAttribute("class")).toContain("px-3");
    expect(instructionSlot?.getAttribute("class")).toContain("py-2");
    expect(instructionSlot?.getAttribute("class")).toContain("w-full");
    expect((instructionSlot as HTMLElement).style.marginBottom).toBe("12px");
    expect((instructionSlot as HTMLElement).style.maxWidth).toBe("420px");
    expect((instructionSlot as HTMLElement).style.minWidth).toBe("420px");
    expect((instructionSlot as HTMLElement).style.width).toBe("420px");
    expect(screen.getByText("Instruction content")).toBeTruthy();
  });

  it("allows overriding the legacy Cismap shell header title and colors", () => {
    render(
      <CismapAnnotationInfoBox
        headerBackgroundColor="#3b82f6"
        headerTextColor="white"
        headerTitle="Informationen"
        slots={{
          content: <span>Detail content</span>,
          headingColor: "#eeeeee",
          headingTitle: "Distance",
        }}
      />
    );

    const responsiveInfoBoxProps = responsiveInfoBoxMock.mock.calls[0]?.[0];
    expect(responsiveInfoBoxProps.headerBackgroundColor).toBeUndefined();
    expect(responsiveInfoBoxProps.headerStyle).toBeUndefined();
    const headerElement = responsiveInfoBoxProps.header as {
      props: {
        children: ReactNode;
        style?: CSSProperties;
      };
    };

    expect(headerElement.props.children).toBe("Informationen");
    expect(headerElement.props.style).toEqual({
      backgroundColor: "#3b82f6",
      color: "white",
    });
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
        infoBoxDataAttributes: {
          "data-carma-pointer-query-preserve": "true",
        },
        pixelwidth: 350,
      })
    );
    expect(
      document
        .querySelector('[data-test-id="mock-responsive-info-box"]')
        ?.getAttribute("data-carma-pointer-query-preserve")
    ).toBe("true");
    expect(responsiveInfoBoxMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        collapsibleStyle: expect.objectContaining({
          backgroundColor: "#f5f5f5",
          border: "1px solid #e3e3e3",
          borderRadius: "4px",
          boxShadow: "rgba(0, 0, 0, 0.05) 0px 1px 1px inset",
          minHeight: "20px",
          padding: "0px 0px 0px 0.5625rem",
        }),
      })
    );
    const instructionContainer = document.querySelector(
      '[data-test-id="empty-annotation-info"]'
    );

    expect(instructionContainer).toBeTruthy();
    expect(instructionContainer?.getAttribute("class")).toContain(
      "font-normal"
    );
    expect(instructionContainer?.getAttribute("class")).toContain("mt-0");
    expect(instructionContainer?.getAttribute("class")).not.toContain("mt-2");
    expect(instructionContainer?.getAttribute("class")).toContain("w-[94%]");
    expect(instructionContainer?.getAttribute("class")).toContain("pl-2");
    expect(instructionContainer?.getAttribute("class")).toContain("pr-0");
    expect(instructionContainer?.getAttribute("class")).toContain("pt-1");
    expect(instructionContainer?.getAttribute("class")).not.toContain("pb-2");
    expect(instructionContainer?.getAttribute("class")).not.toContain("p-2");
    expect(instructionContainer?.getAttribute("class")).not.toContain("w-full");
    expect(screen.getByText("Instruction content")).toBeTruthy();
  });

  it("can render a patterned title section for development-only instruction content", () => {
    render(
      <CismapAnnotationInstructionInfoBox
        content={<span>Instruction content</span>}
        headerTitle="Messungen"
        visualOptions={{
          headerStyle: {
            backgroundImage: "linear-gradient(red, blue)",
          },
          headingColor: "rgba(255, 255, 255, 0.88)",
        }}
      />
    );

    const responsiveInfoBoxProps = responsiveInfoBoxMock.mock.calls[0]?.[0];
    expect(responsiveInfoBoxProps.headerBackgroundColor).toBeUndefined();
    expect(responsiveInfoBoxProps.headerStyle).toBeUndefined();
    const headerElement = responsiveInfoBoxProps.header as {
      props: {
        children: ReactNode;
        style?: CSSProperties;
      };
    };

    expect(headerElement.props.children).toBe("Messungen");
    expect(headerElement.props.style).toEqual({
      backgroundColor: "rgba(255, 255, 255, 0.88)",
      backgroundImage: "linear-gradient(red, blue)",
    });
  });

  it("keeps the Cismap title input visually aligned with 2D measurement headings while hiding non-2D measurement actions", () => {
    expect(
      CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS.titleTextClassName
    ).toContain("font-bold");
    expect(
      CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS.titleTextClassName
    ).toContain("leading-normal");
    expect(
      CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS.titleInputClassName
    ).toContain("font-bold");
    expect(
      CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS.titleInputClassName
    ).toContain("leading-normal");
    expect(
      CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS.titleInputClassName
    ).toContain("border-0");
    expect(
      CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS.titleInputClassName
    ).not.toContain("border border-transparent");
    expect(
      CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS.titleInputClassName
    ).toContain("focus:outline-none");
    expect(
      CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS.shortLabelInputClassName
    ).toContain("tabular-nums");
    expect(
      CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS.shortLabelInputClassName
    ).toContain("bg-white/85");
    expect(
      CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS.shortLabelInputClassName
    ).toContain("font-semibold");
    expect(CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS.bodyPanelStyle).toEqual(
      expect.objectContaining({
        backgroundColor: "#f5f5f5",
        border: "1px solid #e3e3e3",
        borderRadius: "4px",
        boxShadow: "rgba(0, 0, 0, 0.05) 0px 1px 1px inset",
        minHeight: "20px",
        padding: "0px 0px 0px 0.5625rem",
      })
    );
    expect(
      CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS.bodyContainerClassName
    ).toContain("pb-2");
    expect(
      CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS.bodyContainerClassName
    ).not.toContain("pb-0");
    expect(CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS.hiddenActionIds).toEqual([
      ANNOTATION_INFO_BOX_ACTION_IDS.EXPORT,
      ANNOTATION_INFO_BOX_ACTION_IDS.VISIBILITY,
      ANNOTATION_INFO_BOX_ACTION_IDS.REFERENCE,
      ANNOTATION_INFO_BOX_ACTION_IDS.LOCK,
    ]);
    expect(
      CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS.navigationInstructionContainerClassName
    ).not.toContain("mt-1");
    expect(
      CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS.navigationAvailabilityContainerClassName
    ).toContain("mt-1");
    expect(
      CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS.navigationAvailabilityContainerClassName
    ).toContain("pt-1");
    expect(
      CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS.navigationAvailabilityContainerClassName
    ).toContain("w-[96%]");
    expect(
      CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS.navigationSummaryContainerClassName
    ).toContain("mt-1");
    expect(
      CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS.navigationSummaryContainerClassName
    ).toContain("mb-2");
    expect(
      CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS.navigationSummaryContainerClassName
    ).toContain("w-[96%]");
    expect(
      CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS.navigationSummaryContainerClassName
    ).toContain("justify-between");
    expect(
      CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS.navigationSummaryContainerClassName
    ).toContain("items-center");
    expect(
      CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS.navigationSummaryContainerClassName
    ).toContain("text-[12px]");
    expect(
      CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS.navigationControlLabels
    ).toEqual({
      previous: "<<",
      next: ">>",
    });
    expect(CISMAP_ANNOTATION_INFO_BOX_GENERIC_VISUAL_OPTIONS).toEqual(
      expect.objectContaining({
        bodyPanelStyle: annotationInfoBoxVisualDefaults.bodyPanelStyle,
        defaultPixelWidth: annotationInfoBoxVisualDefaults.defaultPixelWidth,
        titleInputClassName:
          annotationInfoBoxVisualDefaults.titleInputClassName,
      })
    );
    expect(
      CISMAP_ANNOTATION_INFO_BOX_GENERIC_VISUAL_OPTIONS.hiddenActionIds
    ).toEqual(CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS.hiddenActionIds);
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

  it("keeps visible Cismap annotation action icons on the shared 16px trigger", () => {
    const slots = buildAnnotationInfoBoxSlots({
      headingTitle: "Messung",
      titleInput: {
        value: "",
        placeholder: "Messung",
        onCommit: vi.fn(),
      },
      actions: {
        hidden: false,
        locked: false,
        onFlyTo: vi.fn(),
        onExport: vi.fn(),
        onToggleVisibility: vi.fn(),
        onToggleLock: vi.fn(),
        onDelete: vi.fn(),
        onSetReference: vi.fn(),
        dataTestIdPrefix: "cismap-annotation",
      },
      visualOptions: CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS,
    });

    render(<>{slots.subtitle}</>);

    const flyToIcon = document.querySelector(
      '[data-test-id="cismap-annotation-flyto-btn"]'
    ) as SVGElement | null;
    const deleteIcon = document.querySelector(
      '[data-test-id="cismap-annotation-delete-btn"]'
    ) as SVGElement | null;

    expect(flyToIcon?.parentElement?.className).toContain("text-[16px]");
    expect(deleteIcon?.parentElement?.className).toContain("text-[16px]");
    expect(flyToIcon?.style.fontSize).toBe("");
    expect(deleteIcon?.style.fontSize).toBe("");
    expect(flyToIcon?.getAttribute("class")).not.toContain("fa-2x");
    expect(deleteIcon?.getAttribute("class")).not.toContain("fa-2x");
  });
});
