// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DevicePixels } from "@carma-units";
import { OffscreenCanvasPool } from "./offscreen-canvas-pool";

class Canvas {
  static instances: Canvas[] = [];
  readonly context = { reset: vi.fn() };
  constructor(public width: number, public height: number) {
    Canvas.instances.push(this);
  }
  getContext = vi.fn(() => this.context);
}
const size = (width: number, height = width) => ({
  width: width as DevicePixels,
  height: height as DevicePixels,
});
const pool = (maxRetainedBytes = 1024, maxRetainedCanvases = 2) =>
  new OffscreenCanvasPool({ maxRetainedBytes, maxRetainedCanvases });

beforeEach(() => {
  Canvas.instances.length = 0;
  vi.stubGlobal("OffscreenCanvas", Canvas);
});
afterEach(() => vi.unstubAllGlobals());

describe("crop canvas leases", () => {
  it("reuses a released exact crop and clears its previous pixels and state", () => {
    const surfaces = pool();
    const first = surfaces.acquire(size(8, 12));
    first.release();
    const second = surfaces.acquire(size(8, 12));
    expect(second.canvas).toBe(first.canvas);
    expect(Canvas.instances).toHaveLength(1);
    expect(Canvas.instances[0].context.reset).toHaveBeenCalledOnce();
  });

  it("grows only to the new crop dimensions and never reuses a live surface", () => {
    const surfaces = pool();
    const visible = surfaces.acquire(size(8));
    const pending = surfaces.acquire(size(8));
    expect(pending.canvas).not.toBe(visible.canvas);
    pending.release();
    const larger = surfaces.acquire(size(12, 16));
    expect(larger.canvas).toBe(pending.canvas);
    expect([larger.canvas.width, larger.canvas.height]).toEqual([12, 16]);
    expect([visible.canvas.width, visible.canvas.height]).toEqual([8, 8]);
  });

  it("evicts oldest idle stores within the byte budget, without touching an active crop", () => {
    const surfaces = pool(256, 4);
    const active = surfaces.acquire(size(8));
    const oldest = surfaces.acquire(size(8));
    const newer = surfaces.acquire(size(8));
    oldest.release();
    newer.release();
    expect([oldest.canvas.width, oldest.canvas.height]).toEqual([1, 1]);
    expect(newer.canvas.width).toBe(8);
    surfaces.trim();
    expect(newer.canvas.width).toBe(1);
    expect(active.canvas.width).toBe(8);
    expect(surfaces.stats).toEqual({
      activeCanvases: 1,
      activeBytes: 256,
      retainedCanvases: 0,
      retainedBytes: 0,
    });
  });

  it("does not retain an oversized crop or double-count repeated releases", () => {
    const surfaces = pool(256, 1);
    const small = surfaces.acquire(size(8));
    small.release();
    small.release();
    const same = surfaces.acquire(size(8));
    expect(same.canvas).toBe(small.canvas);
    const large = surfaces.acquire(size(16));
    large.release();
    expect(large.canvas.width).toBe(1);
    same.release();
    expect(same.canvas.width).toBe(8);
  });

  it("rejects nonfinite, fractional or empty dimensions before allocating", () => {
    const surfaces = pool();
    for (const value of [0, -1, 1.5, Infinity, NaN])
      expect(() => surfaces.acquire(size(value))).toThrow(RangeError);
    expect(Canvas.instances).toHaveLength(0);
  });
});
