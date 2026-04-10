// @vitest-environment jsdom

import { render } from "@testing-library/react";
import type { ReactNode } from "react";

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

    expect(infoBox?.style.width).toBe("fit-content");
    expect(infoBox?.style.minWidth).toBe("220px");
    expect(infoBox?.style.maxWidth).toBe("350px");
  });
});
