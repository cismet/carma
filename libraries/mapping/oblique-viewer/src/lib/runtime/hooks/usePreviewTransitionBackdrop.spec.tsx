import { act, renderHook } from "@testing-library/react";
import type { Map as MaplibreMap } from "maplibre-gl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePreviewTransitionBackdrop } from "./usePreviewTransitionBackdrop";

const scene = vi.hoisted(() => ({
  setBackdrop: vi.fn(),
  release: vi.fn(),
  acquire: vi.fn(),
}));
vi.mock("@carma-mapping/engines/maplibre", () => ({
  acquireSharedThreeScene: () => {
    scene.acquire();
    return {
      layer: { setMapStyleScreenBackdrop: scene.setBackdrop },
      release: scene.release,
    };
  },
}));
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const setup = (enabled = true) => {
  const map = { triggerRepaint: vi.fn() } as unknown as MaplibreMap;
  return renderHook(
    ({ enabled }) => usePreviewTransitionBackdrop(map, enabled),
    { initialProps: { enabled } }
  );
};

describe("preview transition backdrop lifecycle", () => {
  it("retains 250ms outgoing and ready-target fades when photo draping is disabled", async () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    let frame: FrameRequestCallback | undefined;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frame = callback;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {
      frame = undefined;
    });
    const tick = (time: number) =>
      act(() => {
        now = time;
        const callback = frame;
        frame = undefined;
        callback?.(time);
      });
    const map = { triggerRepaint: vi.fn() } as unknown as MaplibreMap;
    const view = renderHook(() =>
      usePreviewTransitionBackdrop(map, true, false)
    );
    let outgoing!: Promise<boolean>;
    act(() => {
      outgoing = view.result.current.fadeOut("target");
    });
    tick(125);
    expect(view.result.current.overlayOpacity.current).toBe(0.5);
    tick(250);
    await expect(outgoing).resolves.toBe(true);
    expect(view.result.current.overlayOpacity.current).toBe(0);
    expect(scene.acquire).not.toHaveBeenCalled();
    expect(scene.setBackdrop).not.toHaveBeenCalled();
    act(() => {
      void view.result.current.ready("old");
    });
    tick(1000);
    expect(view.result.current.overlayOpacity.current).toBe(0);
    let token: ReturnType<typeof view.result.current.begin>;
    let revealed!: Promise<boolean>;
    act(() => {
      token = view.result.current.begin("target", true);
    });
    act(() => {
      revealed = view.result.current.ready("target");
    });
    act(() => {
      view.result.current.settle(token, true);
    });
    expect(view.result.current.overlayOpacity.current).toBe(0);
    tick(1125);
    expect(view.result.current.overlayOpacity.current).toBe(0.5);
    tick(1250);
    expect(view.result.current.overlayOpacity.current).toBe(1);
    await expect(revealed).resolves.toBe(true);
    view.unmount();
  });

  it("cancels an outgoing fade and rejects stale backdrop admission after the option is disabled", async () => {
    vi.stubGlobal("requestAnimationFrame", () => 1);
    const cancelFrame = vi.fn();
    vi.stubGlobal("cancelAnimationFrame", cancelFrame);
    const map = { triggerRepaint: vi.fn() } as unknown as MaplibreMap;
    const view = renderHook(
      ({ drape }) => usePreviewTransitionBackdrop(map, true, drape),
      { initialProps: { drape: true } }
    );
    const staleBegin = view.result.current.begin;
    act(() => staleBegin("target", true));
    view.rerender({ drape: false });
    expect(view.result.current.active).toBe(false);
    act(() => {
      expect(staleBegin("target", true)).toBeUndefined();
    });
    let pending!: Promise<boolean>;
    act(() => {
      pending = view.result.current.fadeOut("target");
    });
    view.unmount();
    await expect(pending).resolves.toBe(false);
    expect(cancelFrame).toHaveBeenCalled();
    expect(view.result.current.overlayOpacity.current).toBe(1);
  });

  it("keeps the current viewport unchanged until the source photograph is secured", () => {
    const view = setup();
    let token: ReturnType<typeof view.result.current.begin>;
    act(() => {
      token = view.result.current.begin("target", false);
    });
    expect(token).toBeUndefined();
    expect(view.result.current.active).toBe(false);
    expect(scene.setBackdrop).not.toHaveBeenCalled();
    act(() => {
      view.result.current.settle(token, false);
      view.result.current.ready("target");
    });
    expect(scene.setBackdrop).not.toHaveBeenCalled();
    act(() => {
      token = view.result.current.begin("target", true);
    });
    expect(view.result.current.active).toBe(true);
    view.unmount();
  });
  it.each(["ready-first", "settled-first"])(
    "keeps transition decorations disabled until both target composition and flight completion (%s)",
    (order) => {
      const view = setup();
      let token!: ReturnType<typeof view.result.current.begin>;
      act(() => {
        token = view.result.current.begin("target", true);
      });
      expect(view.result.current.active).toBe(true);
      expect(scene.acquire).not.toHaveBeenCalled();
      expect(scene.setBackdrop).not.toHaveBeenCalled();
      act(() => {
        if (order === "ready-first") view.result.current.ready("target");
        else view.result.current.settle(token, true);
      });
      expect(view.result.current.active).toBe(true);
      expect(scene.setBackdrop).not.toHaveBeenCalled();
      act(() => {
        if (order === "ready-first") view.result.current.settle(token, true);
        else view.result.current.ready("target");
      });
      expect(view.result.current.active).toBe(false);
      expect(scene.setBackdrop).not.toHaveBeenCalled();
      view.unmount();
    }
  );

  it("ignores unrelated target readiness and an obsolete flight token", () => {
    const view = setup();
    let old!: ReturnType<typeof view.result.current.begin>;
    let current!: ReturnType<typeof view.result.current.begin>;
    act(() => {
      old = view.result.current.begin("old", true);
      current = view.result.current.begin("new", true);
    });
    scene.setBackdrop.mockClear();
    act(() => {
      view.result.current.ready("old");
      view.result.current.settle(old, false);
      view.result.current.settle(current, true);
    });
    expect(view.result.current.active).toBe(true);
    expect(scene.setBackdrop).not.toHaveBeenCalled();
    act(() => {
      void view.result.current.ready("new");
    });
    expect(view.result.current.active).toBe(false);
    expect(scene.setBackdrop).not.toHaveBeenCalled();
    view.unmount();
  });

  it.each(["failed", "cancelled"])(
    "clears immediately on %s and ignores late callbacks",
    (reason) => {
      const view = setup();
      let token!: ReturnType<typeof view.result.current.begin>;
      act(() => {
        token = view.result.current.begin("target", true);
      });
      act(() => {
        if (reason === "failed") view.result.current.settle(token, false);
        else view.result.current.cancel();
      });
      expect(view.result.current.active).toBe(false);
      expect(scene.setBackdrop).not.toHaveBeenCalled();
      scene.setBackdrop.mockClear();
      act(() => {
        view.result.current.ready("target");
        view.result.current.settle(token, true);
      });
      expect(scene.setBackdrop).not.toHaveBeenCalled();
      expect(view.result.current.active).toBe(false);
      view.unmount();
    }
  );

  it("invalidates the old transition on disable and accepts a new transition after reenabling", () => {
    const view = setup();
    let old!: ReturnType<typeof view.result.current.begin>;
    act(() => {
      old = view.result.current.begin("target", true);
    });
    view.rerender({ enabled: false });
    expect(view.result.current.active).toBe(false);
    expect(scene.setBackdrop).not.toHaveBeenCalled();
    view.rerender({ enabled: true });
    act(() => view.result.current.begin("replacement", true));
    act(() => {
      view.result.current.settle(old, false);
      view.result.current.ready("target");
    });
    expect(view.result.current.active).toBe(true);
    view.unmount();
    expect(scene.acquire).not.toHaveBeenCalled();
    expect(scene.setBackdrop).not.toHaveBeenCalled();
  });

  it("invalidates an active handoff on unmount without installing a scene cover", () => {
    const view = setup();
    act(() => view.result.current.begin("target", true));
    view.unmount();
    expect(scene.acquire).not.toHaveBeenCalled();
    expect(scene.setBackdrop).not.toHaveBeenCalled();
  });

  it("does not acquire a scene while disabled", () => {
    const view = setup(false);
    expect(view.result.current.active).toBe(false);
    expect(scene.acquire).not.toHaveBeenCalled();
    expect(scene.setBackdrop).not.toHaveBeenCalled();
    view.unmount();
    expect(scene.release).not.toHaveBeenCalled();
  });
});

describe("direct decorated drape handoff", () => {
  it("keeps the normal fade when OFF-to-ON admission has no prepared source", async () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    let frame: FrameRequestCallback | undefined;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frame = callback;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {
      frame = undefined;
    });
    const map = { triggerRepaint: vi.fn() } as unknown as MaplibreMap;
    const view = renderHook(
      ({ drape }) => usePreviewTransitionBackdrop(map, true, drape),
      { initialProps: { drape: false } }
    );
    const pendingCaller = view.result.current.fadeOut;
    view.rerender({ drape: true });
    let outgoing!: Promise<boolean>;
    act(() => {
      outgoing = pendingCaller("target");
    });
    expect(view.result.current.overlayOpacity.current).toBe(1);
    expect(frame).toBeDefined();
    act(() => {
      now = 125;
      frame?.(now);
    });
    expect(view.result.current.overlayOpacity.current).toBe(0.5);
    act(() => {
      now = 250;
      frame?.(now);
    });
    await expect(outgoing).resolves.toBe(true);
    expect(view.result.current.overlayOpacity.current).toBe(0);
    view.unmount();
  });
  it("switches the secured source and matching composed target synchronously without animation frames", async () => {
    const raf = vi.fn();
    vi.stubGlobal("requestAnimationFrame", raf);
    const view = setup();
    let outgoing!: Promise<boolean>;
    act(() => {
      outgoing = view.result.current.fadeOut("target", true);
    });
    expect(view.result.current.overlayOpacity.current).toBe(0);
    await expect(outgoing).resolves.toBe(true);
    let token: ReturnType<typeof view.result.current.begin>;
    act(() => {
      token = view.result.current.begin("target", true);
    });
    act(() => {
      void view.result.current.ready("old");
    });
    expect(view.result.current.overlayOpacity.current).toBe(0);
    let ready!: Promise<boolean>;
    act(() => {
      ready = view.result.current.ready("target");
    });
    expect(view.result.current.overlayOpacity.current).toBe(1);
    await expect(ready).resolves.toBe(true);
    act(() => view.result.current.settle(token, true));
    expect(view.result.current.active).toBe(false);
    expect(raf).not.toHaveBeenCalled();
    view.unmount();
  });
  it("cancels direct handoff on option change without letting a stale target reveal its replacement", async () => {
    const map = { triggerRepaint: vi.fn() } as unknown as MaplibreMap;
    const view = renderHook(
      ({ drape }) => usePreviewTransitionBackdrop(map, true, drape),
      { initialProps: { drape: true } }
    );
    await act(async () => {
      await view.result.current.fadeOut("old", true);
    });
    view.rerender({ drape: false });
    expect(view.result.current.overlayOpacity.current).toBe(1);
    view.rerender({ drape: true });
    await act(async () => {
      await view.result.current.fadeOut("new", true);
    });
    act(() => {
      void view.result.current.ready("old");
    });
    expect(view.result.current.overlayOpacity.current).toBe(0);
    act(() => view.result.current.cancel());
    expect(view.result.current.overlayOpacity.current).toBe(1);
    expect(view.result.current.active).toBe(false);
    view.unmount();
  });
});
