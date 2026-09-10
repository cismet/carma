import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MapLoadingProgress } from "./MapLoadingProgress";

const state = vi.hoisted(() => ({
  map: {} as object | null,
  progress: { active: true, percent: 50 },
}));
vi.mock("@carma-mapping/contexts", () => ({
  useLibreContext: () => ({ map: state.map }),
}));
vi.mock("@carma-mapping/engines/maplibre", () => ({
  useMapLoadingProgress: () => state.progress,
}));
// Exercise the actual shared indicator through the package's public entry point.
vi.mock("@carma-appframeworks/portals", () =>
  vi.importActual("@carma-appframeworks/portals")
);

beforeEach(() => {
  state.map = {};
  state.progress = { active: true, percent: 50 };
});
afterEach(cleanup);

describe("map-frame loading indicator", () => {
  it("renders the actual two-pixel, full-width, pointer-transparent overlay", () => {
    render(<MapLoadingProgress navbarVisible />);
    const bar = screen.getByRole("progressbar");
    expect(bar.style.height).toBe("2px");
    expect(bar.style.insetInline).toBe("0");
    expect(bar.style.pointerEvents).toBe("none");
    expect(bar.style.position).toBe("fixed");
    expect(bar.style.color).toBe("rgba(255, 255, 255, 0.75)");
    expect(bar.style.top).toBe(
      "calc(4rem + var(--system-message-banner-height, 0px))"
    );
    expect(bar.getAttribute("aria-valuenow")).toBe("50");
    expect((bar.firstElementChild as HTMLElement).style.width).toBe("50%");
  });
  it("fades out completed work and immediately reappears for a later shadow-only update", () => {
    const view = render(<MapLoadingProgress navbarVisible />);
    const bar = screen.getByRole("progressbar");
    state.progress = { active: false, percent: 100 };
    view.rerender(<MapLoadingProgress navbarVisible />);
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(bar.isConnected).toBe(true);
    expect(bar.style.opacity).toBe("0");
    expect(bar.style.transition).toBe("opacity 300ms ease-out");
    expect((bar.firstElementChild as HTMLElement).style.width).toBe("100%");
    state.progress = { active: true, percent: 25 };
    view.rerender(<MapLoadingProgress navbarVisible />);
    expect(screen.getByRole("progressbar")).toBe(bar);
    expect(bar.style.opacity).toBe("1");
    expect(bar.style.transition).toBe("none");
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
      "25"
    );
  });
  it("starts at zero before map creation and follows navbar-free layouts", () => {
    state.map = null;
    render(<MapLoadingProgress navbarVisible={false} />);
    const bar = screen.getByRole("progressbar");
    expect(bar.style.top).toBe("0px");
    expect(bar.getAttribute("aria-valuenow")).toBe("0");
  });
});
