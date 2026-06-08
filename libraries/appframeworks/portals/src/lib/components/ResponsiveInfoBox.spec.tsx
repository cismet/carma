// @vitest-environment jsdom
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@carma-mapping/map-controls-layout", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@carma-mapping/map-controls-layout")>();

  return {
    ...actual,
    Control: ({ children }: { children: ReactNode }) => (
      <div data-test-id="mock-control">{children}</div>
    ),
  };
});

import { ResponsiveInfoBox } from "./ResponsiveInfoBox";

describe("ResponsiveInfoBox", () => {
  it("applies the default header inset when rendering a styled header shell", () => {
    render(
      <ResponsiveInfoBox
        defaultContextValues={{ setInfoBoxPixelWidth: vi.fn() }}
        fixedRow={true}
        header="Messungen"
        headerBackgroundColor="#eeeeee"
        panelClick={() => undefined}
        pixelwidth={420}
        alwaysVisibleDiv={<span>Always visible</span>}
      />
    );

    const header = screen.getByText("Messungen");

    expect(header.style.backgroundColor).toBe("rgb(238, 238, 238)");
    expect(header.style.boxSizing).toBe("border-box");
    expect(header.style.paddingLeft).toBe("calc(0.8125rem)");
    expect(header.style.width).toBe("100%");
  });
});
