import { describe, expect, it, vi } from "vitest";
import type { DevicePixels, Ratio } from "@carma-units";
import type { ImageLevel, ImageRect } from "../core/image-level-plan";
import type { ImageLevelStack } from "./image-level-stack";
import { drawImageLevels } from "./draw-image-levels";

describe("dirty canvas regions", () => {
  const fixture = () => {
    const level: ImageLevel = {
      level: 1,
      width: 500 as DevicePixels,
      height: 100 as DevicePixels,
      tileWidth: 100 as DevicePixels,
      tileHeight: 100 as DevicePixels,
      cols: 5,
      rows: 1,
    };
    const bitmaps = Array.from(
      { length: 5 },
      () => ({ width: 100, height: 100 } as ImageBitmap)
    );
    const tile = vi.fn((_level: number, col: number) => bitmaps[col]);
    const stack = {
      plan: { layers: [1] },
      pyramid: { native: { width: 500, height: 100 }, levels: [level] },
      tile,
      isResident: () => true,
    } as unknown as ImageLevelStack;
    const context = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
    };
    return { stack, context, tile, bitmaps };
  };
  it("redraws the changed cell and filter neighbors while preserving distant cells", () => {
    const { stack, context, tile } = fixture();
    drawImageLevels(
      context as unknown as OffscreenCanvasRenderingContext2D,
      stack,
      { originX: 0, originY: 0, scale: 1 },
      { width: 500, height: 100 },
      { damage: [{ x: 200, y: 0, width: 100, height: 100 } as ImageRect] }
    );
    expect(context.rect).toHaveBeenCalledWith(199, 0, 102, 100);
    expect(context.clip).toHaveBeenCalledOnce();
    expect(tile.mock.calls.map((call) => call[1])).toEqual([1, 2, 3]);
    expect(context.restore).toHaveBeenCalledOnce();
  });
  it("does not clear or draw for a dirty cell outside the output crop", () => {
    const { stack, context } = fixture();
    drawImageLevels(
      context as unknown as OffscreenCanvasRenderingContext2D,
      stack,
      { originX: 0, originY: 0, scale: 1 },
      { width: 100, height: 100 },
      { damage: [{ x: 400, y: 0, width: 100, height: 100 } as ImageRect] }
    );
    expect(context.clearRect).not.toHaveBeenCalled();
    expect(context.drawImage).not.toHaveBeenCalled();
  });
  it("restores the canvas clip after a draw failure", () => {
    const { stack, context } = fixture();
    context.drawImage.mockImplementation(() => {
      throw new Error("draw failed");
    });
    expect(() =>
      drawImageLevels(
        context as unknown as OffscreenCanvasRenderingContext2D,
        stack,
        { originX: 0, originY: 0, scale: 1 },
        { width: 500, height: 100 },
        { damage: [{ x: 200, y: 0, width: 100, height: 100 } as ImageRect] }
      )
    ).toThrow("draw failed");
    expect(context.restore).toHaveBeenCalledOnce();
  });
});

describe("native padded tile output crop", () => {
  it("clips fractional edge pixels using exact layer scale", () => {
    const bitmap = { width: 256, height: 256 } as ImageBitmap;
    const level: ImageLevel = {
      level: 3,
      width: 1776 as DevicePixels,
      height: 1332 as DevicePixels,
      tileWidth: 256 as DevicePixels,
      tileHeight: 256 as DevicePixels,
      cols: 7,
      rows: 6,
      nativeScale: { x: 4 as Ratio, y: 4 as Ratio },
    };
    const stack = {
      plan: { layers: [3] },
      pyramid: { native: { width: 7102, height: 5326 }, levels: [level] },
      tile: (_level: number, col: number, row: number) =>
        col === 6 && row === 5 ? bitmap : undefined,
      isResident: () => true,
    } as unknown as ImageLevelStack;
    const context = { clearRect: vi.fn(), drawImage: vi.fn() };
    drawImageLevels(
      context as unknown as OffscreenCanvasRenderingContext2D,
      stack,
      { originX: 0, originY: 0, scale: 0.25 },
      { width: 1776, height: 1332 }
    );
    expect(context.drawImage).toHaveBeenCalledOnce();
    expect(context.drawImage.mock.calls[0]).toEqual([
      bitmap,
      0,
      0,
      239.5,
      51.5,
      1536,
      1280,
      240,
      52,
    ]);
    expect(bitmap.width).toBe(256);
  });
});
