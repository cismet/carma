import { describe, expect, it, vi } from "vitest";
import type { DevicePixels } from "@carma-units";
import { composeImageViewport } from "./compose-image-viewport";

const px = (value: number) => value as DevicePixels;
const window = {
  source: { x: px(13), y: px(21), width: px(1000), height: px(700) },
  target: { width: px(667), height: px(467) },
};
const nativeSize = { width: px(2000), height: px(1400) };
const context = () => ({
  clearRect: vi.fn(), imageSmoothingEnabled: false, imageSmoothingQuality: "high",
}) as unknown as OffscreenCanvasRenderingContext2D;

describe("native image viewport composition", () => {
  it("paints the whole fractional crop once at native linear quality", async () => {
    const target = context();
    const paint = vi.fn();
    await composeImageViewport(target, window, nativeSize,
      { width: 1000, height: 700 }, paint, { signal: new AbortController().signal });
    expect(paint).toHaveBeenCalledTimes(1);
    expect(paint).toHaveBeenCalledWith(
      [6.5, 10.5, 506.5, 360.5], { x: 0, y: 0, width: 667, height: 467 },
    );
    expect(target.imageSmoothingEnabled).toBe(true);
    expect(target.imageSmoothingQuality).toBe("low");
    expect(target.clearRect).toHaveBeenCalledTimes(1);
    expect(target.clearRect).toHaveBeenCalledWith(0, 0, 667, 467);
  });

  it("shares exact page coordinates at bounded TIFF staging edges", async () => {
    const paint = vi.fn();
    await composeImageViewport(context(), window, nativeSize,
      { width: 1000, height: 700 }, paint,
      { signal: new AbortController().signal, tileEdge: 512 });
    expect(paint).toHaveBeenCalledTimes(2);
    const [firstBounds, firstTarget] = paint.mock.calls[0];
    const [secondBounds, secondTarget] = paint.mock.calls[1];
    expect(firstTarget).toEqual({ x: 0, y: 0, width: 512, height: 467 });
    expect(secondTarget).toEqual({ x: 512, y: 0, width: 155, height: 467 });
    expect(firstBounds[2]).toBeCloseTo(secondBounds[0], 12);
    expect(secondBounds[2]).toBeCloseTo(506.5, 12);
    expect(firstBounds[1]).toBe(secondBounds[1]);
    expect(firstBounds[3]).toBe(secondBounds[3]);
  });

  it("does not draw after cancellation while yielding to a foreground task", async () => {
    const controller = new AbortController();
    const paint = vi.fn();
    const job = composeImageViewport(context(), window, nativeSize,
      { width: 1000, height: 700 }, paint,
      { signal: controller.signal, shouldYield: () => true });
    controller.abort();
    await expect(job).rejects.toMatchObject({ name: "AbortError" });
    expect(paint).not.toHaveBeenCalled();
  });

  it("stops before staging another tile when the image changes", async () => {
    const controller = new AbortController();
    const paint = vi.fn(() => controller.abort());
    await expect(composeImageViewport(context(), window, nativeSize,
      { width: 1000, height: 700 }, paint,
      { signal: controller.signal, tileEdge: 512 })).rejects.toMatchObject({ name: "AbortError" });
    expect(paint).toHaveBeenCalledTimes(1);
  });
});
