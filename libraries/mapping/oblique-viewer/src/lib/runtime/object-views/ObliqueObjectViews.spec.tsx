import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Map } from "maplibre-gl";
import type { Meters } from "@carma-units";
import type { ObliqueViewerExtensionProps } from "../oblique-viewer-extensions";

const query = vi.hoisted(() => ({
  hook: vi.fn(),
  reset: vi.fn(),
  coverage: vi.fn(),
  defineSphere: vi.fn(),
  previewSphere: vi.fn(),
}));
vi.mock("../hooks/useObjectCoverage", () => ({
  useObjectCoverage: query.hook,
}));
vi.mock("../oblique-actions", () => ({
  useObliqueViewerActions: () => ({ footprintOutlineColor: "#374151" }),
}));
vi.mock("./ObliqueObjectResultWindow", () => ({
  ObliqueObjectResultWindow: ({ children }: any) => (
    <div role="dialog" aria-label="Objektansichten">
      {children}
    </div>
  ),
}));
vi.mock("../ObliqueOverlay", () => ({
  ObliqueOverlay: ({ children }: any) => children,
}));
vi.mock("../ObliqueObjectCoverage", () => ({
  ObliqueObjectCoverage: (props: any) => {
    query.coverage(props);
    return (
      <button onClick={() => props.onOpen("photo")}>Kontaktansicht</button>
    );
  },
}));
import ObliqueObjectViews from "./ObliqueObjectViews";
const props = (): ObliqueViewerExtensionProps => ({
  map: {} as Map,
  data: null,
  resetToken: "series",
  heightOffset: 0 as Meters,
  suspended: false,
  surfacePicker: null,
  readViewAnchor: vi.fn(),
  onControllerChange: vi.fn(),
  onReset: vi.fn(),
  onCancel: vi.fn(),
  onOpen: vi.fn(),
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});
describe("optional object query runtime", () => {
  it("forwards live display-only drafts and the shared outline color without resetting or replacing the committed sphere", () => {
    const selected = {
      center: { longitude: 7.2, latitude: 51.27, heightMeters: 0 },
      radiusMeters: 5,
    };
    query.hook.mockReturnValue({
      sphere: selected,
      groups: new globalThis.Map(),
      loading: false,
      error: null,
      reset: query.reset,
      defineSphere: query.defineSphere,
      previewSphere: query.previewSphere,
    });
    const callbacks = props();
    render(<ObliqueObjectViews {...callbacks} />);
    const received = query.coverage.mock.lastCall![0];
    expect(received.sphere).toBe(selected);
    expect(received.outlineColor).toBe("#374151");
    const draft = { ...selected, radiusMeters: 8 };
    act(() => received.onRegionDraft(draft));
    expect(query.previewSphere).toHaveBeenLastCalledWith(draft);
    act(() => received.onRegionDraft(null));
    expect(query.previewSphere).toHaveBeenLastCalledWith(null);
    expect(query.defineSphere).not.toHaveBeenCalled();
    expect(query.reset).not.toHaveBeenCalled();
    expect(callbacks.onReset).not.toHaveBeenCalled();
    expect(callbacks.onCancel).not.toHaveBeenCalled();
  });

  it.each(["mesh", "terrain", "auto"] as const)(
    "forwards the %s surface choice and shared picker to contact-view measurements",
    (surfaceMode) => {
      query.hook.mockReturnValue({
        center: {},
        sphere: {},
        groups: new globalThis.Map(),
        loading: false,
        error: null,
        reset: query.reset,
      });
      const callbacks = props();
      const surfacePicker = {
        intersectSurface: vi.fn(() => null),
      } as unknown as ObliqueViewerExtensionProps["surfacePicker"];
      const view = render(
        <ObliqueObjectViews
          {...callbacks}
          surfaceMode={surfaceMode}
          surfacePicker={surfacePicker}
        />
      );
      expect(query.coverage).toHaveBeenLastCalledWith(
        expect.objectContaining({ surfaceMode, surfacePicker })
      );
      query.hook.mock.lastCall![0].readViewAnchor({ x: 100, y: 80 });
      expect(callbacks.readViewAnchor).toHaveBeenCalledWith({ x: 100, y: 80 });
      const nextSurface = surfaceMode === "mesh" ? "terrain" : "mesh";
      view.rerender(
        <ObliqueObjectViews
          {...callbacks}
          surfaceMode={nextSurface}
          surfacePicker={surfacePicker}
        />
      );
      expect(query.coverage).toHaveBeenLastCalledWith(
        expect.objectContaining({ surfaceMode: nextSurface, surfacePicker })
      );
    }
  );

  it("registers its reset controller and releases it when unmounted", () => {
    query.hook.mockReturnValue({
      center: null,
      sphere: null,
      error: null,
      reset: query.reset,
    });
    const callbacks = props();
    const view = render(<ObliqueObjectViews {...callbacks} />);
    expect(query.hook).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        resetToken: "series",
        outlineColor: "#374151",
      })
    );
    expect(callbacks.onControllerChange).toHaveBeenLastCalledWith({
      reset: query.reset,
    });
    expect(screen.getByRole("status").textContent).toMatch(/Objektmittelpunkt/);
    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
    expect(callbacks.onCancel).toHaveBeenCalledOnce();
    view.unmount();
    expect(callbacks.onControllerChange).toHaveBeenLastCalledWith(null);
  });
  it("delegates reset and full-view image flight to the parent viewer", () => {
    const focus = vi.spyOn(window, "focus").mockImplementation(() => {});
    query.hook.mockReturnValue({
      center: {},
      sphere: null,
      error: null,
      reset: query.reset,
    });
    const callbacks = props();
    const view = render(<ObliqueObjectViews {...callbacks} />);
    expect(screen.getByRole("status").textContent).toMatch(/Kugelradius/);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Neu wählen" }));
    expect(callbacks.onReset).toHaveBeenCalledOnce();
    query.hook.mockReturnValue({
      center: {},
      sphere: {},
      groups: new globalThis.Map(),
      loading: false,
      error: null,
      reset: query.reset,
    });
    view.rerender(<ObliqueObjectViews {...callbacks} />);
    expect(
      screen.getByRole("dialog", { name: "Objektansichten" })
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Kontaktansicht" }));
    expect(focus).toHaveBeenCalledOnce();
    expect(callbacks.onOpen).toHaveBeenCalledWith("photo");
  });
  it("redefines the region through the mounted result window without invoking the map reset", () => {
    const first = {
      center: { longitude: 7, latitude: 51, heightMeters: 100 },
      radiusMeters: 5,
    };
    const state = {
      center: first.center,
      sphere: first,
      groups: new globalThis.Map(),
      loading: false,
      error: null,
      reset: query.reset,
      defineSphere: query.defineSphere,
    };
    query.hook.mockReturnValue(state);
    const callbacks = props();
    const view = render(<ObliqueObjectViews {...callbacks} />);
    const dialog = screen.getByRole("dialog", { name: "Objektansichten" });
    const next = {
      center: { longitude: 7.001, latitude: 51.001, heightMeters: 105 },
      radiusMeters: 8,
    };
    act(() => query.coverage.mock.lastCall![0].onRegionChange(next));
    expect(query.defineSphere).toHaveBeenCalledOnce();
    expect(query.defineSphere).toHaveBeenLastCalledWith(next);
    expect(callbacks.onReset).not.toHaveBeenCalled();
    expect(callbacks.onCancel).not.toHaveBeenCalled();
    query.hook.mockReturnValue({
      ...state,
      center: next.center,
      sphere: next,
      loading: true,
    });
    view.rerender(<ObliqueObjectViews {...callbacks} />);
    expect(screen.getByRole("dialog", { name: "Objektansichten" })).toBe(
      dialog
    );
    expect(callbacks.onControllerChange).toHaveBeenCalledTimes(1);
    expect(query.coverage.mock.lastCall![0]).toMatchObject({
      sphere: next,
      loading: true,
    });
    view.unmount();
    expect(callbacks.onControllerChange).toHaveBeenLastCalledWith(null);
  });
});
