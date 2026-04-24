// @vitest-environment jsdom

import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { CarmaResponsiveInfoBox } from "./CarmaResponsiveInfoBox";

vi.mock("@carma-mapping/map-controls-layout", () => ({
  Control: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

vi.mock("./CarmaCard", () => ({
  default: ({
    header,
    content,
    footer,
  }: {
    header?: ReactNode;
    content?: ReactNode;
    footer?: ReactNode;
  }) => (
    <div>
      {header}
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
});
