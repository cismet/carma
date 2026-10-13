import { act, renderHook } from "@testing-library/react";
import { MercatorCoordinate, type Map as MaplibreMap } from "maplibre-gl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QUERY_CURSOR_DEFAULTS } from "../../core/utils/query-cursor";
import { useQueryCursor, useViewModeRequest } from "./useQueryCursor";

vi.hoisted(() => {
  // MapLibre's module registers its worker blob even when the map is mocked.
  URL.createObjectURL ??= () => "blob:oblique-test-worker";
  URL.revokeObjectURL ??= () => {};
});

const cursor = vi.hoisted(() => ({
  create: vi.fn(),
  setSample: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock("../utils/query-cursor-three", () => ({
  createQueryCursorThree: (...args: unknown[]) => {
    cursor.create(...args);
    return {
      setSample: cursor.setSample,
      isVisible: () => false,
      dispose: cursor.dispose,
    };
  },
}));

const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 0;
let now = 1_000;
const flushFrames = () =>
  act(() => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(now));
  });

beforeEach(() => {
  vi.clearAllMocks();
  frames.clear();
  now = 1_000;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    frames.delete(id);
  });
  vi.spyOn(performance, "now").mockImplementation(() => now);
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

const setup = (active = true) => {
  // Real layout: the photo preview overlay is a sibling of the map container.
  const host = document.createElement("div");
  const container = document.createElement("div");
  const canvas = document.createElement("canvas");
  canvas.className = "maplibregl-canvas";
  canvas.getBoundingClientRect = () => ({ left: 10, top: 20 } as DOMRect);
  container.append(canvas);
  const overlay = document.createElement("div");
  const preview = document.createElement("div");
  preview.setAttribute("data-oblique-preview-surface", "true");
  const photo = document.createElement("img");
  const control = document.createElement("button");
  preview.append(photo, control);
  overlay.append(preview);
  host.append(container, overlay);
  document.body.append(host);
  const listeners = new Map<string, () => void>();
  const map = {
    getContainer: () => container,
    getCanvas: () => canvas,
    on: vi.fn((type: string, listener: () => void) =>
      listeners.set(type, listener)
    ),
    off: vi.fn((type: string) => listeners.delete(type)),
  } as unknown as MaplibreMap;
  const anchor = MercatorCoordinate.fromLngLat([7, 51], 100);
  const readViewAnchor = vi.fn(() => anchor);
  const onEscape = vi.fn();
  const view = renderHook(
    (props: { active: boolean }) =>
      useQueryCursor({ map, active: props.active, readViewAnchor, onEscape }),
    { initialProps: { active } }
  );
  const move = (target: Element, clientX = 110, clientY = 220) =>
    act(() => {
      target.dispatchEvent(
        new MouseEvent("pointermove", { bubbles: true, clientX, clientY })
      );
    });
  return {
    host,
    canvas,
    photo,
    control,
    map,
    listeners,
    anchor,
    readViewAnchor,
    onEscape,
    view,
    move,
  };
};

describe("useQueryCursor", () => {
  it("stays inert until the query is requested", () => {
    const { host, view } = setup(false);
    expect(cursor.create).not.toHaveBeenCalled();
    expect(host.hasAttribute("data-oblique-query-cursor")).toBe(false);
    view.rerender({ active: true });
    expect(cursor.create).toHaveBeenCalledTimes(1);
    expect(host.getAttribute("data-oblique-query-cursor")).toBe("true");
    const rule = document.head.querySelector(
      "style[data-oblique-query-cursor]"
    )?.textContent;
    expect(rule).toContain("canvas.maplibregl-canvas");
    expect(rule).toContain("[data-oblique-preview-surface] *");
    expect(rule).toMatch(
      /cursor:url\("data:image\/svg\+xml;[^"]+"\) 27 27, crosshair !important/
    );
  });

  it("samples the surface and its neighbours once per frame over the canvas", () => {
    const { canvas, anchor, readViewAnchor, move } = setup();
    move(canvas, 110, 220);
    move(canvas, 112, 222);
    expect(readViewAnchor).not.toHaveBeenCalled();
    flushFrames();
    const offset = QUERY_CURSOR_DEFAULTS.normalSampleOffset;
    expect(readViewAnchor.mock.calls.map(([point]) => point)).toEqual([
      { x: 102, y: 202 },
      { x: 102 + offset, y: 202 },
      { x: 102 - offset, y: 202 },
      { x: 102, y: 202 - offset },
      { x: 102, y: 202 + offset },
    ]);
    expect(cursor.setSample).toHaveBeenLastCalledWith({
      center: anchor,
      neighbours: { right: anchor, left: anchor, up: anchor, down: anchor },
    });

    // The normal refreshes less often than the position.
    now += 10;
    move(canvas, 120, 230);
    flushFrames();
    expect(cursor.setSample).toHaveBeenLastCalledWith({
      center: anchor,
      neighbours: null,
    });
    now += QUERY_CURSOR_DEFAULTS.normalRefreshInterval;
    move(canvas, 121, 230);
    flushFrames();
    expect(cursor.setSample.mock.lastCall?.[0].neighbours).not.toBeNull();
  });

  it("follows the pointer over the photo and hides over controls or outside", () => {
    const { host, photo, control, readViewAnchor, move } = setup();
    move(photo, 410, 320);
    flushFrames();
    expect(readViewAnchor.mock.calls[0]?.[0]).toEqual({ x: 400, y: 300 });
    expect(cursor.setSample).toHaveBeenLastCalledWith(
      expect.objectContaining({ center: expect.anything() })
    );

    move(control);
    expect(cursor.setSample).toHaveBeenLastCalledWith(null);
    expect(frames.size).toBe(0);

    move(photo);
    act(() => {
      host.dispatchEvent(new MouseEvent("pointerleave"));
    });
    expect(cursor.setSample).toHaveBeenLastCalledWith(null);
    flushFrames();
    expect(cursor.setSample).toHaveBeenLastCalledWith(null);
  });

  it("hides without a surface hit and resamples when the camera moves", () => {
    const { canvas, listeners, readViewAnchor, move } = setup();
    readViewAnchor.mockReturnValueOnce(
      undefined as unknown as MercatorCoordinate
    );
    move(canvas);
    flushFrames();
    expect(cursor.setSample).toHaveBeenLastCalledWith(null);
    readViewAnchor.mockClear();
    act(() => listeners.get("move")?.());
    flushFrames();
    expect(readViewAnchor).toHaveBeenCalled();
  });

  it("drops the ring on Escape and tears everything down when the mode ends", () => {
    const { host, canvas, map, onEscape, view, move } = setup();
    move(canvas);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(cursor.setSample).toHaveBeenLastCalledWith(null);

    view.rerender({ active: false });
    expect(cursor.dispose).toHaveBeenCalledTimes(1);
    expect(map.off).toHaveBeenCalledWith("move", expect.any(Function));
    expect(host.hasAttribute("data-oblique-query-cursor")).toBe(false);
    expect(
      document.head.querySelector("style[data-oblique-query-cursor]")
    ).toBeNull();
    cursor.setSample.mockClear();
    move(canvas);
    flushFrames();
    expect(cursor.setSample).not.toHaveBeenCalled();
  });
});

describe("useViewModeRequest", () => {
  it("holds the requested mode until its switch settles", async () => {
    const { result } = renderHook(() => useViewModeRequest<string>());
    let finishFirst!: () => void;
    let failSecond!: (reason: unknown) => void;
    act(() =>
      result.current.track(
        "objectCoverage",
        new Promise<void>((resolve) => (finishFirst = resolve))
      )
    );
    expect(result.current.pendingMode).toBe("objectCoverage");

    act(() =>
      result.current.track(
        "nadir",
        new Promise<void>((_, reject) => (failSecond = reject))
      )
    );
    await act(async () => finishFirst());
    // A superseded request does not clear the newer one.
    expect(result.current.pendingMode).toBe("nadir");
    await act(async () => failSecond(new Error("aborted")));
    expect(result.current.pendingMode).toBeNull();

    act(() => result.current.track("objectCoverage", new Promise(() => {})));
    act(() => result.current.cancel());
    expect(result.current.pendingMode).toBeNull();
  });
});
