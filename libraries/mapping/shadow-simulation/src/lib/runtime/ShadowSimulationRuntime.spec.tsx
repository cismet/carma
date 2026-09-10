import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getSharedThreeSceneRuntimes,
  subscribeSharedThreeSceneContent,
} from "@carma-mapping/engines/maplibre";
import { createInitialShadowSimulationState } from "../core/create-shadow-simulation-state";
import { ShadowSimulationRuntime } from "./ShadowSimulationRuntime";

vi.mock("@carma-mapping/engines/maplibre", () => ({
  getSharedThreeSceneRuntimes: vi.fn(() => []),
  subscribeSharedThreeSceneContent: vi.fn(() => vi.fn()),
  MAPLIBRE_EVENT: {
    STYLE_DATA: "styledata",
    STYLE_LOAD: "style.load",
    IDLE: "idle",
  },
}));
vi.mock("./shadow-scene", () => ({ buildShadowSimulationScene: vi.fn() }));
vi.mock("../core/solar-position", () => ({ getSolarPosition: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("tile diagnostics runtime registration", () => {
  it.each([false, undefined])("does not register scene diagnostics when the debug panel is %s", (showProjectionDebugView) => {
    const runtime = { setTileBoundsVisible: vi.fn() };
    vi.mocked(getSharedThreeSceneRuntimes).mockReturnValue([runtime] as never);
    render(
      <ShadowSimulationRuntime
        libreMap={
          { isStyleLoaded: () => false, on: vi.fn(), off: vi.fn() } as never
        }
        state={{
          ...createInitialShadowSimulationState(undefined),
          enabled: true,
          showProjectionDebugView,
          showTileBounds: true,
        }}
        dateState={{
          year: 2026,
          dayOfYear: 250,
          minutes: 720,
          timeZone: "Europe/Berlin",
        }}
        location={{ latitude: 51.27, longitude: 7.2 }}
      />
    );
    expect(subscribeSharedThreeSceneContent).not.toHaveBeenCalled();
    expect(runtime.setTileBoundsVisible).not.toHaveBeenCalled();
  });

  it("applies enabled bounds to arriving runtimes once and unsubscribes on cleanup", () => {
    const first = { setTileBoundsVisible: vi.fn() };
    const next = { setTileBoundsVisible: vi.fn() };
    vi.mocked(getSharedThreeSceneRuntimes).mockReturnValue([first] as never);
    const unsubscribe = vi.fn();
    vi.mocked(subscribeSharedThreeSceneContent).mockReturnValue(unsubscribe);
    const { unmount } = render(
      <ShadowSimulationRuntime
        libreMap={
          { isStyleLoaded: () => false, on: vi.fn(), off: vi.fn() } as never
        }
        state={{
          ...createInitialShadowSimulationState(undefined),
          enabled: true,
          showProjectionDebugView: true,
          showTileBounds: true,
        }}
        dateState={{
          year: 2026,
          dayOfYear: 250,
          minutes: 720,
          timeZone: "Europe/Berlin",
        }}
        location={{ latitude: 51.27, longitude: 7.2 }}
      />
    );
    expect(first.setTileBoundsVisible).toHaveBeenCalledWith(true);
    const notify = vi.mocked(subscribeSharedThreeSceneContent).mock
      .lastCall![1];
    notify();
    expect(first.setTileBoundsVisible).toHaveBeenCalledTimes(1);
    vi.mocked(getSharedThreeSceneRuntimes).mockReturnValue([
      first,
      next,
    ] as never);
    notify();
    expect(next.setTileBoundsVisible).toHaveBeenCalledWith(true);
    expect(first.setTileBoundsVisible).toHaveBeenCalledTimes(1);
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(first.setTileBoundsVisible).toHaveBeenLastCalledWith(false);
    expect(next.setTileBoundsVisible).toHaveBeenLastCalledWith(false);
  });

  it("turns scene diagnostics off on panel close and restores the default on reopening", () => {
    const runtime = { setTileBoundsVisible: vi.fn() };
    vi.mocked(getSharedThreeSceneRuntimes).mockReturnValue([runtime] as never);
    const unsubscribe = vi.fn();
    vi.mocked(subscribeSharedThreeSceneContent).mockReturnValue(unsubscribe);
    const map = { isStyleLoaded: () => false, on: vi.fn(), off: vi.fn() };
    const initial = createInitialShadowSimulationState(undefined);
    const view = (open: boolean, enabled = true, bounds = initial.showTileBounds) => (
      <ShadowSimulationRuntime
        libreMap={map as never}
        state={{ ...initial, enabled, showProjectionDebugView: open, showTileBounds: bounds }}
        dateState={{year: 2026, dayOfYear: 250, minutes: 720, timeZone: "Europe/Berlin"}}
        location={{latitude: 51.27, longitude: 7.2}}
      />
    );
    const { rerender, unmount } = render(view(false));
    rerender(view(true));
    expect(runtime.setTileBoundsVisible).toHaveBeenLastCalledWith(true);
    rerender(view(false));
    expect(runtime.setTileBoundsVisible).toHaveBeenLastCalledWith(false);
    expect(unsubscribe).toHaveBeenCalledOnce();
    rerender(view(true));
    expect(runtime.setTileBoundsVisible).toHaveBeenLastCalledWith(true);
    rerender(view(true, true, false));
    expect(runtime.setTileBoundsVisible).toHaveBeenLastCalledWith(false);
    rerender(view(true));
    rerender(view(true, false));
    expect(runtime.setTileBoundsVisible).toHaveBeenLastCalledWith(false);
    unmount();
  });
});
