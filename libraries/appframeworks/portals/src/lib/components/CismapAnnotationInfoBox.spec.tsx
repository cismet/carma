// @vitest-environment jsdom
import type { CSSProperties } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ANNOTATION_INFO_BOX_ACTION_IDS } from "@carma-mapping/annotations/ui";

const responsiveInfoBoxMock = vi.hoisted(() =>
  vi.fn(({ alwaysVisibleDiv, collapsibleDiv, header }) => (
    <div data-test-id="mock-responsive-info-box">
      <div data-test-id="mock-header">{header}</div>
      <div data-test-id="mock-always-visible">{alwaysVisibleDiv}</div>
      <div data-test-id="mock-collapsible">{collapsibleDiv}</div>
    </div>
  ))
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
  CISMAP_MEASUREMENT_INFO_BOX_VISUAL_OPTIONS,
  CismapAnnotationInfoBox,
  CismapAnnotationInstructionInfoBox,
} from "./CismapAnnotationInfoBox";

describe("CismapAnnotationInfoBox", () => {
  beforeEach(() => {
    responsiveInfoBoxMock.mockClear();
  });

  it("maps annotation slots to the legacy ResponsiveInfoBox shell", () => {
    render(
      <CismapAnnotationInfoBox
        pixelWidth={420}
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
        fixedRow: true,
        isCollapsible: false,
        pixelwidth: 420,
      })
    );
    expect(screen.getByText("Messungen")).toBeTruthy();
    expect(screen.getByText("Subtitle content")).toBeTruthy();
    expect(screen.getByText("Detail content")).toBeTruthy();
    expect(screen.getByText("Footer content")).toBeTruthy();
  });

  it("renders instruction content in the compact Cismap shell", () => {
    render(
      <CismapAnnotationInstructionInfoBox
        content={<span>Instruction content</span>}
      />
    );

    expect(responsiveInfoBoxMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        collapsibleDiv: expect.anything(),
        fixedRow: false,
        header: "",
        isCollapsible: false,
        pixelwidth: 350,
      })
    );
    const instructionContainer = document.querySelector(
      '[data-test-id="empty-measurement-info"]'
    );

    expect(instructionContainer).toBeTruthy();
    expect(instructionContainer?.getAttribute("class")).toContain(
      "font-normal"
    );
    expect(screen.getByText("Instruction content")).toBeTruthy();
  });

  it("keeps the Cismap title input visually aligned with 2D measurement headings while hiding non-2D measurement actions", () => {
    expect(
      CISMAP_MEASUREMENT_INFO_BOX_VISUAL_OPTIONS.titleTextClassName
    ).toContain("font-bold");
    expect(
      CISMAP_MEASUREMENT_INFO_BOX_VISUAL_OPTIONS.titleInputClassName
    ).toContain("font-bold");
    expect(
      CISMAP_MEASUREMENT_INFO_BOX_VISUAL_OPTIONS.titleInputClassName
    ).toContain("border-0");
    expect(
      CISMAP_MEASUREMENT_INFO_BOX_VISUAL_OPTIONS.titleInputClassName
    ).not.toContain("border border-transparent");
    expect(
      CISMAP_MEASUREMENT_INFO_BOX_VISUAL_OPTIONS.titleInputClassName
    ).toContain("focus:outline-none");
    expect(CISMAP_MEASUREMENT_INFO_BOX_VISUAL_OPTIONS.hiddenActionIds).toEqual([
      ANNOTATION_INFO_BOX_ACTION_IDS.EXPORT,
      ANNOTATION_INFO_BOX_ACTION_IDS.VISIBILITY,
      ANNOTATION_INFO_BOX_ACTION_IDS.REFERENCE,
      ANNOTATION_INFO_BOX_ACTION_IDS.LOCK,
    ]);
    expect(
      CISMAP_MEASUREMENT_INFO_BOX_VISUAL_OPTIONS.navigationControlLabels
    ).toEqual({
      previous: "<<",
      next: ">>",
    });
  });

  it("uses the same Cismap search-location icon for the fly-to action as the layerbar", () => {
    const icon = CISMAP_MEASUREMENT_INFO_BOX_VISUAL_OPTIONS.renderActionIcon?.({
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
