import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Map } from "maplibre-gl";
import type { Meters } from "@carma-units";
import type { ObliqueViewerExtensionProps } from "../oblique-viewer-extensions";

const query = vi.hoisted(() => ({
  hook: vi.fn(),
  reset: vi.fn(),
  coverage: vi.fn(),
}));
vi.mock("../hooks/useObjectCoverage", () => ({
  useObjectCoverage: query.hook,
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
      const surfacePicker = { intersectSurface: vi.fn(() => null) };
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
      expect.objectContaining({ enabled: true, resetToken: "series" })
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
});
