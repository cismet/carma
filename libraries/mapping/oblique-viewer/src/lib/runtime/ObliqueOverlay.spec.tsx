import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Map as MaplibreMap } from "maplibre-gl";
import { ObliqueOverlay } from "./ObliqueOverlay";

afterEach(cleanup);
describe("oblique overlay control stacking", () => {
  it("lifts the same private host above controls only during object queries and restores preview stacking", () => {
    const wrapper = document.createElement("div"),
      container = document.createElement("div"),
      controls = document.createElement("div");
    controls.style.zIndex = "1000";
    wrapper.append(container, controls);
    const isolated = document.createElement("div");
    isolated.style.isolation = "isolate";
    isolated.append(wrapper);
    document.body.append(isolated);
    const map = { getContainer: () => container } as unknown as MaplibreMap;
    const view = render(
      <ObliqueOverlay map={map}>
        <button>Measure surface</button>
      </ObliqueOverlay>
    );
    const host = wrapper.querySelector<HTMLElement>(".carma-oblique-overlay")!;
    const button = screen.getByRole("button", { name: "Measure surface" });
    expect(host.parentElement).toBe(wrapper);
    expect(host.style.zIndex).toBe("500");
    expect(host.style.pointerEvents).toBe("none");
    expect(host.contains(button)).toBe(true);
    view.rerender(
      <ObliqueOverlay map={map} aboveControls>
        <button>Measure surface</button>
      </ObliqueOverlay>
    );
    expect(isolated.querySelector(".carma-oblique-overlay")).toBe(host);
    expect(host.parentElement).toBe(isolated);
    expect(host.style.zIndex).toBe("2001");
    expect(Number(host.style.zIndex)).toBeGreaterThan(
      Number(controls.style.zIndex)
    );
    expect(screen.getByRole("button", { name: "Measure surface" })).toBe(
      button
    );
    view.rerender(
      <ObliqueOverlay map={map}>
        <button>Measure surface</button>
      </ObliqueOverlay>
    );
    expect(host.style.zIndex).toBe("500");
    expect(host.parentElement).toBe(wrapper);
    expect(controls.style.zIndex).toBe("1000");
    view.unmount();
    expect(wrapper.querySelector(".carma-oblique-overlay")).toBeNull();
    expect(wrapper.contains(container)).toBe(true);
    expect(wrapper.contains(controls)).toBe(true);
    isolated.remove();
  });
});
