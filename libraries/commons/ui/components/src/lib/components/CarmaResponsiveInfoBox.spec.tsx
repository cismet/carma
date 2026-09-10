// @vitest-environment jsdom

import { fireEvent, render } from "@testing-library/react";
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
  it("restores an offscreen fixed panel to its CSS anchor after resizing", () => {
    const { getByRole, unmount } = render(
      <CarmaResponsiveInfoBox
        role="dialog"
        aria-label="Resize regression"
        useControlLayout={false}
        draggable
        initialDragOffset={{ x: -120, y: 16 }}
        style={{ position: "fixed", top: 100, right: 24 }}
        content="Settings"
      />
    );
    const dialog = getByRole("dialog", { name: "Resize regression" });
    const bounds = vi.spyOn(dialog, "getBoundingClientRect").mockReturnValue({
      left: -120,
      top: 116,
      right: 176,
      bottom: 600,
    } as DOMRect);
    expect(dialog.style.transform).toBe("translate(-120px, 16px)");
    fireEvent.resize(window);
    expect(dialog.style.transform).toBe("translate(0px, 0px)");
    bounds.mockRestore();
    unmount();
  });

  it("keeps accessible dialog semantics on the positioned draggable surface", () => {
    const { container, getByRole } = render(
      <CarmaResponsiveInfoBox
        role="dialog"
        aria-label="Darstellung"
        dataTestId="display-dialog"
        useControlLayout={false}
        draggable
        style={{ position: "fixed", top: 100, right: 24 }}
        heading={<button type="button">Schließen</button>}
        content={
          <label>
            Intensität
            <input type="range" />
          </label>
        }
      />
    );
    const dialog = getByRole("dialog", { name: "Darstellung" });
    expect(dialog).toBe(container.firstElementChild);
    expect(dialog.getAttribute("data-test-id")).toBe("display-dialog");
    expect(dialog.style.position).toBe("fixed");
    expect(dialog.style.transform).toBe("translate(0px, 0px)");
    expect(dialog.contains(getByRole("button", { name: "Schließen" }))).toBe(
      true
    );
    expect(dialog.contains(getByRole("slider"))).toBe(true);
  });
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
