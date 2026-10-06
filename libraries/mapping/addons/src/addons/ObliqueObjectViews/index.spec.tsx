import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ next: false, setState: vi.fn() }));
vi.mock("@carma-providers/feature-flag", () => ({
  useFeatureFlags: () => ({ featureFlagObliqueNextUi: state.next }),
}));
vi.mock("@carma-mapping/oblique-viewer", () => ({
  OBLIQUE_OBJECT_VIEWS_EXTENSION: {
    mode: "objectCoverage",
    label: "Objektansichtenabfrage",
    Component: () => null,
  },
}));
vi.mock("../../lib/AddonStateContext", () => ({
  useAddonState: () => [undefined, state.setState],
}));
import { ObliqueObjectViews } from ".";

afterEach(() => {
  cleanup();
  state.next = false;
  state.setState.mockClear();
});
describe("object-view addon registration", () => {
  it("stays unavailable when mounted manually outside the next UI", () => {
    render(<ObliqueObjectViews />);
    expect(state.setState).toHaveBeenLastCalledWith({ extension: null });
  });
  it("registers its mode in the next UI and removes it when the flag is turned off", () => {
    state.next = true;
    const view = render(<ObliqueObjectViews />);
    expect(state.setState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        extension: expect.objectContaining({ mode: "objectCoverage" }),
      })
    );
    state.next = false;
    view.rerender(<ObliqueObjectViews />);
    expect(state.setState).toHaveBeenLastCalledWith({ extension: null });
  });
  it("removes its registration on unmount", () => {
    state.next = true;
    const view = render(<ObliqueObjectViews />);
    view.unmount();
    expect(state.setState).toHaveBeenLastCalledWith({ extension: null });
  });
});
