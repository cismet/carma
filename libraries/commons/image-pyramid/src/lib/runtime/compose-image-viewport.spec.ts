import { describe, expect, it, vi } from "vitest";
import type { DevicePixels, Ratio } from "@carma-units";
import { composeImageViewport } from "./compose-image-viewport";

const px = (value: number) => value as DevicePixels;
const window = {
  source: { x: px(13), y: px(21), width: px(1000), height: px(700) },
  target: { width: px(667), height: px(467) },
};
const nativeSize = { width: px(2000), height: px(1400) };
const context = () =>
  ({
    clearRect: vi.fn(),
    imageSmoothingEnabled: false,
    imageSmoothingQuality: "high",
  } as unknown as OffscreenCanvasRenderingContext2D);

describe("native image viewport composition", () => {
  it("paints the whole fractional crop once at native linear quality", async () => {
    const target = context();
    const paint = vi.fn();
    await composeImageViewport(
      target,
      window,
      nativeSize,
      { width: 1000, height: 700 },
      paint,
      { signal: new AbortController().signal }
    );
    expect(paint).toHaveBeenCalledTimes(1);
    expect(paint).toHaveBeenCalledWith([6.5, 10.5, 506.5, 360.5], {
      x: 0,
      y: 0,
      width: 667,
      height: 467,
    });
    expect(target.imageSmoothingEnabled).toBe(true);
    expect(target.imageSmoothingQuality).toBe("low");
    expect(target.clearRect).toHaveBeenCalledTimes(1);
    expect(target.clearRect).toHaveBeenCalledWith(0, 0, 667, 467);
  });

  it("shares exact page coordinates at bounded staging edges", async () => {
    const paint = vi.fn();
    await composeImageViewport(
      context(),
      window,
      nativeSize,
      { width: 1000, height: 700 },
      paint,
      { signal: new AbortController().signal, tileEdge: 512 }
    );
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
    const job = composeImageViewport(
      context(),
      window,
      nativeSize,
      { width: 1000, height: 700 },
      paint,
      { signal: controller.signal, shouldYield: () => true }
    );
    controller.abort();
    await expect(job).rejects.toMatchObject({ name: "AbortError" });
    expect(paint).not.toHaveBeenCalled();
  });

  it("stops before staging another tile when the image changes", async () => {
    const controller = new AbortController();
    const paint = vi.fn(() => controller.abort());
    await expect(
      composeImageViewport(
        context(),
        window,
        nativeSize,
        { width: 1000, height: 700 },
        paint,
        { signal: controller.signal, tileEdge: 512 }
      )
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(paint).toHaveBeenCalledTimes(1);
  });
});

describe("calibrated scale with rounded native pyramid extents", () => {
  const native = { width: px(10652), height: px(14204) };
  const signal = () => new AbortController().signal;
  const scale = (value: number) => ({
    x: value as Ratio,
    y: value as Ratio,
  });

  it.each([
    {
      level: 1,
      width: 5326,
      height: 7102,
      factor: 0.5,
      expected: [2048, 6144, 3072, 6912],
    },
    {
      level: 3,
      width: 1332,
      height: 1776,
      factor: 0.125,
      expected: [512, 1536, 768, 1728],
    },
  ])(
    "keeps exact L$level pixel edges for odd 2024 dimensions",
    async ({ width, height, factor, expected }) => {
      const paint = vi.fn();
      await composeImageViewport(
        context(),
        {
          source: {
            x: px(4096),
            y: px(12288),
            width: px(2048),
            height: px(1536),
          },
          target: { width: px(512), height: px(384) },
        },
        native,
        { width, height },
        paint,
        { signal: signal(), sourceScale: scale(factor) }
      );
      expect(paint).toHaveBeenCalledWith(expected, {
        x: 0,
        y: 0,
        width: 512,
        height: 384,
      });
      const [bounds, destination] = paint.mock.calls[0];
      // The same physical landmark must occupy exactly the same destination pixel at every level.
      expect(
        ((4800 * factor - bounds[0]) * destination.width) /
          (bounds[2] - bounds[0])
      ).toBe(176);
      expect(
        ((12400 * factor - bounds[1]) * destination.height) /
          (bounds[3] - bounds[1])
      ).toBe(28);
    }
  );

  it("clips the padded final sample without stretching it over the destination", async () => {
    const paint = vi.fn(),
      target = context();
    await composeImageViewport(
      target,
      {
        source: { x: px(10648), y: px(14200), width: px(16), height: px(16) },
        target: { width: px(64), height: px(64) },
      },
      native,
      { width: 1332, height: 1776 },
      paint,
      { signal: signal(), sourceScale: scale(0.125) }
    );
    expect(paint).toHaveBeenCalledWith([1331, 1775, 1331.5, 1775.5], {
      x: 0,
      y: 0,
      width: 16,
      height: 16,
    });
    expect(target.clearRect).toHaveBeenCalledWith(0, 0, 64, 64);
  });

  it("preserves the physical offset when the viewport starts outside the photo", async () => {
    const paint = vi.fn();
    await composeImageViewport(
      context(),
      {
        source: { x: px(-4), y: px(-8), width: px(16), height: px(16) },
        target: { width: px(64), height: px(64) },
      },
      native,
      { width: 1332, height: 1776 },
      paint,
      { signal: signal(), sourceScale: scale(0.125) }
    );
    expect(paint).toHaveBeenCalledWith([0, 0, 1.5, 1], {
      x: 16,
      y: 32,
      width: 48,
      height: 32,
    });
  });

  it.each([0, -1, Infinity, NaN])(
    "rejects an invalid exact pixel scale %s before painting",
    async (invalid) => {
      const paint = vi.fn();
      await expect(
        composeImageViewport(
          context(),
          window,
          nativeSize,
          { width: 1000, height: 700 },
          paint,
          { signal: signal(), sourceScale: scale(invalid) }
        )
      ).rejects.toThrow("finite and positive");
      expect(paint).not.toHaveBeenCalled();
    }
  );
});
