// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ShadowProjectionDebugPortal } from "./ShadowProjectionDebugView";

describe("ShadowProjectionDebugPortal", () => {
  it("owns a dedicated portal host and removes it on unmount", () => {
    const view = render(
      <ShadowProjectionDebugPortal>
        <div>debug content</div>
      </ShadowProjectionDebugPortal>
    );

    const host = document.querySelector(
      "[data-carma-shadow-projection-debug-host]"
    );
    expect(host).not.toBeNull();
    expect(host?.textContent).toBe("debug content");

    view.unmount();

    expect(
      document.querySelector("[data-carma-shadow-projection-debug-host]")
    ).toBeNull();
  });
});
