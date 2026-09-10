import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getSharedThreeSceneRuntimes,
  subscribeSharedThreeSceneContent,
} from "@carma-mapping/engines/maplibre";
import { createInitialShadowSimulationState } from "../core/create-shadow-simulation-state";
import { getSolarPosition } from "../core/solar-position";
import { buildShadowSimulationScene } from "./shadow-scene";
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
vi.mock("../core/solar-position", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../core/solar-position")>()),
  getSolarPosition: vi.fn(),
}));

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

describe("shadow animation", () => {
  const dateState = {
    year: 2026,
    dayOfYear: 250,
    minutes: 600,
    timeZone: "Europe/Berlin",
  };
  const location = { latitude: 51.27, longitude: 7.2 };
  const setup = async () => {
    vi.useFakeTimers({
      toFake: [
        "setTimeout",
        "clearTimeout",
        "setInterval",
        "clearInterval",
        "requestAnimationFrame",
        "cancelAnimationFrame",
        "performance",
        "Date",
      ],
    });
    const scene = new Proxy({} as Record<string, ReturnType<typeof vi.fn>>, {
      get: (target, key: string) => (target[key] ??= vi.fn()),
    });
    vi.mocked(buildShadowSimulationScene).mockReturnValue(scene as never);
    vi.mocked(getSolarPosition).mockImplementation(
      (date) => ({ minutes: date.minutes, instant: new Date(date.minutes) }) as never
    );
    const setDateState = vi.fn();
    const libreMap = { isStyleLoaded: () => true, on: vi.fn(), off: vi.fn() };
    const view = (state: Partial<ReturnType<typeof createInitialShadowSimulationState>>, date = dateState) => (
      <ShadowSimulationRuntime
        libreMap={libreMap as never}
        state={{
          ...createInitialShadowSimulationState(undefined),
          enabled: true,
          animationSpeed: 4,
          ...state,
        }}
        dateState={date}
        location={location}
        setDateState={setDateState}
      />
    );
    const rendered = render(view({ isAnimating: true }));
    // The scene is allocated one frame plus one task after the style is ready.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(40);
    });
    expect(buildShadowSimulationScene).toHaveBeenCalledOnce();
    const shownMinutes = () =>
      scene.updateSolarPosition.mock.calls.map(
        ([position]: [{ minutes: number }]) => position.minutes
      );
    return { ...rendered, scene, setDateState, view, shownMinutes };
  };
  afterEach(() => vi.useRealTimers());

  it("drives the sun on every tick but publishes the shared date at most four times a second", async () => {
    const { scene, setDateState, shownMinutes } = await setup();
    scene.updateSolarPosition.mockClear();
    setDateState.mockClear();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    const shown = shownMinutes();
    expect(shown.length).toBeGreaterThanOrEqual(25);
    expect(shown.at(-1)).toBeGreaterThan(600 + 20 * 4);
    expect(setDateState.mock.calls.length).toBeLessThanOrEqual(5);
    expect(setDateState.mock.calls.length).toBeGreaterThanOrEqual(3);
    // Every publish is a date the scene already shows.
    for (const [published] of setDateState.mock.calls) {
      expect(shown).toContain(published.minutes);
    }
  });

  it("never moves the sun backwards when the shared date catches up or the animation stops", async () => {
    const { setDateState, view, rerender, shownMinutes } = await setup();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    // The shared date arrives a little after each publish, as the host would deliver it.
    const published = setDateState.mock.lastCall![0];
    rerender(view({ isAnimating: true }, published));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    setDateState.mockClear();
    const lastShownWhileAnimating = shownMinutes().at(-1);
    rerender(view({ isAnimating: false }, published));
    // Stopping publishes the final animated date exactly once.
    expect(setDateState).toHaveBeenCalledOnce();
    expect(setDateState.mock.lastCall![0].minutes).toBe(lastShownWhileAnimating);
    rerender(view({ isAnimating: false }, setDateState.mock.lastCall![0]));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    const shown = shownMinutes();
    for (let i = 1; i < shown.length; i += 1) {
      expect(shown[i]).toBeGreaterThanOrEqual(shown[i - 1]);
    }
    expect(shown.at(-1)).toBe(lastShownWhileAnimating);
  });
});
