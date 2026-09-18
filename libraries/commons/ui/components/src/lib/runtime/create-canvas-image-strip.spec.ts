// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CANVAS_IMAGE_STRIP_INITIAL_VIEW } from "../core/canvas-image-strip-view";
import { createCanvasImageStrip } from "./create-canvas-image-strip";

describe("canvas image strip DOM lifecycle", () => {
  const drawImage = vi.fn();
  const disconnect = vi.fn();
  let frames: Map<number, FrameRequestCallback>;
  let nextFrame: number;
  let viewport: HTMLDivElement;
  let source: HTMLCanvasElement;
  const flushFrame = () => {
    const queued = [...frames.values()];
    frames.clear();
    queued.forEach((callback) => callback(0));
  };
  const pointer = (type: string, values: Record<string, unknown>) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, {
      pointerId: 1,
      button: 0,
      clientX: 300,
      clientY: 150,
      ...values,
    });
    return event;
  };

  beforeEach(() => {
    frames = new Map();
    nextFrame = 0;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
      frames.delete(id);
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage,
      clearRect: vi.fn(),
      setTransform: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect = disconnect;
      }
    );
    viewport = document.createElement("div");
    Object.defineProperties(viewport, {
      clientWidth: { configurable: true, value: 600 },
      clientHeight: { configurable: true, value: 300 },
    });
    document.body.append(viewport);
    source = document.createElement("canvas");
    source.width = 2000;
    source.height = 400;
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("delegates drawing while preserving pan/zoom and allocates no 2D context", () => {
    const onDraw = vi.fn();
    const strip = createCanvasImageStrip(viewport, source, {
      onDraw,
      closedLoop: true,
    });
    flushFrame();
    expect(HTMLCanvasElement.prototype.getContext).not.toHaveBeenCalled();
    expect(onDraw).toHaveBeenCalledOnce();
    expect(onDraw.mock.lastCall![0].slices.length).toBeGreaterThan(0);
    strip.canvas.dispatchEvent(
      new KeyboardEvent("keydown", { key: "+", bubbles: true })
    );
    flushFrame();
    expect(onDraw.mock.lastCall![0].scale).toBeGreaterThan(
      onDraw.mock.calls[0][0].scale
    );
    expect(drawImage).not.toHaveBeenCalled();
    strip.dispose();
  });

  it.each(["horizontal", "vertical"] as const)(
    "synchronizes %s-mirrored arrays without a feedback loop",
    (mirror) => {
      const reflected = (
        view: ReturnType<ReturnType<typeof createCanvasImageStrip>["getView"]>
      ) => ({
        ...view,
        centerX:
          mirror === "horizontal" ? source.width - view.centerX : view.centerX,
        centerY:
          mirror === "vertical" ? source.height - view.centerY : view.centerY,
      });
      let second: ReturnType<typeof createCanvasImageStrip>;
      const first = createCanvasImageStrip(viewport, source, {
        initialRange: () => [0, 500],
        onViewChange: (view) => second?.setView(reflected(view)),
      });
      const otherViewport = viewport.cloneNode() as HTMLDivElement;
      Object.defineProperties(otherViewport, {
        clientWidth: { value: 600 },
        clientHeight: { value: 300 },
      });
      document.body.append(otherViewport);
      second = createCanvasImageStrip(otherViewport, source, {
        initialRange: () => (mirror === "horizontal" ? [1500, 2000] : [0, 500]),
        onViewChange: (view) => first.setView(reflected(view)),
      });
      flushFrame();
      flushFrame();
      expect(first.getView().scale).toBeCloseTo(1.2);
      expect(first.getView().centerX).toBe(250);
      first.setPosition(0.6);
      flushFrame();
      flushFrame();
      flushFrame();
      expect(second.getView().centerX).toBeCloseTo(
        reflected(first.getView()).centerX
      );
      expect(second.getView().centerY).toBeCloseTo(
        reflected(first.getView()).centerY
      );
      expect(second.getView().scale).toBe(first.getView().scale);
      expect(frames.size).toBe(0);
      second.canvas.dispatchEvent(
        new KeyboardEvent("keydown", { key: "+", bubbles: true })
      );
      flushFrame();
      flushFrame();
      flushFrame();
      expect(first.getView().scale).toBe(second.getView().scale);
      expect(frames.size).toBe(0);
      first.dispose();
      second.dispose();
    }
  );

  it("coalesces source repaints without view notifications or additional canvases", () => {
    const onViewChange = vi.fn();
    const strip = createCanvasImageStrip(viewport, source, { onViewChange });
    flushFrame();
    onViewChange.mockClear();
    drawImage.mockClear();
    strip.refresh();
    strip.refresh();
    strip.refresh();
    expect(frames.size).toBe(1);
    flushFrame();
    expect(viewport.querySelectorAll("canvas")).toHaveLength(1);
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(drawImage.mock.calls[0][0]).toBe(source);
    expect(onViewChange).not.toHaveBeenCalled();
    strip.dispose();
  });

  it("preserves zoom and station during same-size source refreshes", () => {
    const strip = createCanvasImageStrip(viewport, source, {
      initialView: CANVAS_IMAGE_STRIP_INITIAL_VIEW.NATIVE,
    });
    strip.setPosition(0.7);
    const previous = strip.getView();
    strip.refresh();
    expect(strip.getView()).toEqual(previous);
    source.width = 4000;
    strip.refresh();
    expect(strip.getView().sourceWidth).toBe(4000);
    expect(strip.getView().scale).toBe(1);
    expect(strip.getView().position).toBe(0.5);
    strip.dispose();
  });

  it("does not create a feedback loop when a station subscriber mirrors the position", () => {
    const strip = createCanvasImageStrip(viewport, source, {
      initialView: CANVAS_IMAGE_STRIP_INITIAL_VIEW.NATIVE,
      onViewChange: (view) => strip.setPosition(view.position),
    });
    strip.setPosition(0.7);
    flushFrame();
    expect(frames.size).toBe(0);
    strip.dispose();
  });

  it("zooms with wheel and supports keyboard pan and fit reset", () => {
    const strip = createCanvasImageStrip(viewport, source);
    const wheel = new WheelEvent("wheel", {
      deltaY: -400,
      clientX: 300,
      clientY: 150,
      cancelable: true,
    });
    strip.canvas.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
    expect(strip.getView().scale).toBeGreaterThan(0.3);
    strip.canvas.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight" })
    );
    expect(strip.getView().position).toBeGreaterThan(0.5);
    strip.canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "0" }));
    expect(strip.getView().scale).toBe(0.3);
    expect(strip.getView().position).toBe(0.5);
    strip.dispose();
  });

  it("routes Alt dragging to elevation while retaining pointer capture across source refresh", () => {
    const onElevationDelta = vi.fn();
    const strip = createCanvasImageStrip(viewport, source, {
      initialView: CANVAS_IMAGE_STRIP_INITIAL_VIEW.NATIVE,
      onElevationDelta,
    });
    strip.canvas.setPointerCapture = vi.fn();
    strip.canvas.hasPointerCapture = vi.fn(() => true);
    strip.canvas.releasePointerCapture = vi.fn();
    strip.canvas.dispatchEvent(pointer("pointerdown", {}));
    strip.canvas.dispatchEvent(
      pointer("pointermove", { clientY: 130, altKey: true })
    );
    strip.refresh();
    strip.canvas.dispatchEvent(
      pointer("pointermove", { clientY: 120, altKey: true })
    );
    expect(onElevationDelta).not.toHaveBeenCalled();
    flushFrame();
    expect(onElevationDelta.mock.calls).toEqual([[30]]);
    expect(strip.getView().centerY).toBe(200);
    strip.canvas.dispatchEvent(
      pointer("pointermove", { clientX: 260, clientY: 120, altKey: false })
    );
    expect(strip.getView().centerX).toBe(1040);
    strip.canvas.dispatchEvent(pointer("pointerup", {}));
    expect(strip.canvas.releasePointerCapture).toHaveBeenCalledWith(1);
    strip.dispose();
  });

  it("redraws the closed seam from the original source only", () => {
    const strip = createCanvasImageStrip(viewport, source, {
      closedLoop: true,
      initialView: CANVAS_IMAGE_STRIP_INITIAL_VIEW.NATIVE,
    });
    strip.setPosition(0);
    flushFrame();
    expect(drawImage).toHaveBeenCalledTimes(2);
    expect(drawImage.mock.calls.every((call) => call[0] === source)).toBe(true);
    strip.dispose();
  });

  it("disconnects resize observation, cancels pending drawing, and ignores input after disposal", () => {
    const onViewChange = vi.fn();
    const strip = createCanvasImageStrip(viewport, source, { onViewChange });
    const canvas = strip.canvas;
    strip.dispose();
    strip.dispose();
    strip.refresh();
    strip.setPosition(1);
    strip.setClosedLoop(true);
    canvas.dispatchEvent(new KeyboardEvent("keydown", { key: "+" }));
    canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: -100 }));
    window.dispatchEvent(new Event("resize"));
    flushFrame();
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(window.cancelAnimationFrame).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
    expect(onViewChange).not.toHaveBeenCalled();
    expect(viewport.children).toHaveLength(0);
  });
});
