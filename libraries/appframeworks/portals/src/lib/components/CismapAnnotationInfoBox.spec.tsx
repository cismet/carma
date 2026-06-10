// @vitest-environment jsdom
import type { CSSProperties, ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ANNOTATION_INFO_BOX_ACTION_IDS } from "@carma-mapping/annotations/ui";

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
        controlOrder: 12,
        fixedRow: true,
        isCollapsible: false,
        pixelwidth: 420,
        secondaryInfoBoxElements: expect.arrayContaining([expect.anything()]),
      })
    );
    expect(screen.getByText("Messungen")).toBeTruthy();
    expect(responsiveInfoBoxMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        header: "Messungen",
        headerBackgroundColor: "#eeeeee",
        headerStyle: {
          backgroundImage: "linear-gradient(red, blue)",
        },
      })
    );
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
    expect(instructionContainer?.getAttribute("class")).toContain("mt-2");
    expect(instructionContainer?.getAttribute("class")).toContain("w-[90%]");
    expect(instructionContainer?.getAttribute("class")).toContain("p-2");
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

    expect(responsiveInfoBoxMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        header: "Messungen",
        headerBackgroundColor: "rgba(255, 255, 255, 0.88)",
        headerStyle: {
          backgroundImage: "linear-gradient(red, blue)",
        },
      })
    );
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
    ).not.toContain("pt-3");
    expect(
      CISMAP_ANNOTATION_INFO_BOX_VISUAL_OPTIONS.navigationSummaryContainerClassName
    ).not.toContain("mt-1");
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
