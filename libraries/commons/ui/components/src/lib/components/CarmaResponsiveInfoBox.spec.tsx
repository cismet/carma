// @vitest-environment jsdom

import { render } from "@testing-library/react";
import type { CSSProperties, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { CarmaResponsiveInfoBox } from "./CarmaResponsiveInfoBox";

vi.mock("@carma-mapping/map-controls-layout", () => ({
  Control: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

vi.mock("./CarmaCard", () => ({
  default: ({
    header,
    headerStyle,
    content,
    footer,
    style,
  }: {
    header?: ReactNode;
    headerStyle?: CSSProperties;
    content?: ReactNode;
    footer?: ReactNode;
    style?: CSSProperties;
  }) => (
    <div data-test-id="carma-card" style={style}>
      <div data-test-id="carma-card-header" style={headerStyle}>
        {header}
      </div>
      {content}
      {footer}
    </div>
  ),
}));

describe("CarmaResponsiveInfoBox", () => {
  it("keeps the shared Geoportal-style minimum width when fit-content sizing is enabled", () => {
    const { container } = render(
      <CarmaResponsiveInfoBox
        width={350}
        fitContentWidth={true}
        useControlLayout={false}
        heading={<span>Titel</span>}
        content={<span>Inhalt</span>}
      />
    );

    const infoBox = container.querySelector(
      '[data-test-id="info-box"]'
    ) as HTMLDivElement | null;

    expect(infoBox?.style.minWidth).toBe("24rem");
    expect(infoBox?.style.maxWidth).toBe("350px");
  });

  it("can keep the expanded left edge as collapsed anchor", () => {
    const { container } = render(
      <CarmaResponsiveInfoBox
        width={350}
        useControlLayout={false}
        defaultCollapsed={true}
        collapsedHorizontalAnchor="expanded-left"
        heading={<span>Titel</span>}
        content={<span>Inhalt</span>}
      />
    );

    const infoBox = container.querySelector(
      '[data-test-id="info-box"]'
    ) as HTMLDivElement | null;

    expect(infoBox?.style.width).toBe("350px");
    expect(infoBox?.style.pointerEvents).toBe("none");
  });

  it("keeps collapsed right-anchored controls on the control edge", () => {
    const { container } = render(
      <CarmaResponsiveInfoBox
        width={350}
        useControlLayout={true}
        controlPosition="bottomright"
        defaultCollapsed={true}
        heading={<span>Titel</span>}
        content={<span>Inhalt</span>}
      />
    );

    const card = container.querySelector(
      '[data-test-id="carma-card"]'
    ) as HTMLDivElement | null;

    expect(card?.style.marginLeft).toBe("auto");
  });

  it("passes heading styles to the card header", () => {
    const { container } = render(
      <CarmaResponsiveInfoBox
        width={350}
        useControlLayout={false}
        heading={<span>Titel</span>}
        headingStyle={{
          borderTop: "1px solid rgb(1, 2, 3)",
        }}
        content={<span>Inhalt</span>}
      />
    );

    const header = container.querySelector(
      '[data-test-id="carma-card-header"]'
    ) as HTMLDivElement | null;

    expect(header?.style.borderTopWidth).toBe("1px");
    expect(header?.style.borderTopStyle).toBe("solid");
  });
});
