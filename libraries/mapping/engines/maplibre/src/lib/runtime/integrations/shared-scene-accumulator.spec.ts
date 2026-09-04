import type { WebGLRenderTarget, WebGLRenderer } from "three";
import { describe, expect, it, vi } from "vitest";

import {
  buildSharedSceneAccumulator,
  fitRenderTargetSizeToPixelBudget,
} from "./shared-scene-accumulator";

const buildRenderer = (broken = false) => {
  let target: WebGLRenderTarget | null = null;
  const renderer = {
    getRenderTarget: vi.fn(() => target),
    setRenderTarget: vi.fn((next: WebGLRenderTarget | null) => {
      target = next;
    }),
    setClearColor: vi.fn(),
    clear: vi.fn(),
    render: vi.fn(),
    readRenderTargetPixels: vi.fn(
      (
        _target: WebGLRenderTarget,
        _x: number,
        _y: number,
        _width: number,
        _height: number,
        pixels: Uint8Array | Float32Array
      ) => {
        if (pixels instanceof Uint8Array) pixels[3] = 255;
        else if (!broken) pixels[0] = 1;
      }
    ),
  };
  return renderer as unknown as WebGLRenderer;
};

describe("buildSharedSceneAccumulator", () => {
  it("preserves aspect ratio while fitting a pixel budget", () => {
    const size = fitRenderTargetSizeToPixelBudget(1_170, 2_532, 1_000_000);

    expect(size.width * size.height).toBeLessThanOrEqual(1_000_000);
    expect(size.width / size.height).toBeCloseTo(1_170 / 2_532, 2);
    expect(fitRenderTargetSizeToPixelBudget(800, 600, 1_000_000)).toEqual({
      width: 800,
      height: 600,
    });
  });

  it("accumulates the configured rounds and resets on state changes", () => {
    const renderer = buildRenderer();
    const accumulator = buildSharedSceneAccumulator(2);
    const renderScene = vi.fn();

    accumulator.ensureState("first");
    expect(accumulator.jitterFor(0).x).toBeGreaterThanOrEqual(-0.5);
    accumulator.renderRound(renderer, 8, 4, renderScene);
    expect(accumulator.composite(renderer)).toBe(false);
    accumulator.renderRound(renderer, 8, 4, renderScene);
    expect(accumulator.composite(renderer)).toBe(true);

    expect(renderScene).toHaveBeenCalledTimes(2);
    expect(
      vi.mocked(renderer.readRenderTargetPixels).mock.calls[1]?.[5]
    ).toBeInstanceOf(Uint16Array);
    expect(accumulator.converged).toBe(true);
    expect(accumulator.hasSettledFrame).toBe(true);
    expect(accumulator.nextRound).toBe(2);
    accumulator.ensureState("second");
    expect(accumulator.nextRound).toBe(0);
    expect(accumulator.hasSettledFrame).toBe(true);
    expect(accumulator.composite(renderer, true)).toBe(true);
    expect(accumulator.composite(renderer)).toBe(false);
    accumulator.dispose();
  });

  it("marks an unusable blend pipeline as broken", () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const accumulator = buildSharedSceneAccumulator(1);

    accumulator.renderRound(buildRenderer(true), 4, 4, () => undefined);

    expect(accumulator.broken).toBe(true);
    expect(error).toHaveBeenCalledOnce();
    accumulator.dispose();
    error.mockRestore();
  });

  it("falls back when render target setup throws", () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const renderer = buildRenderer();
    vi.mocked(renderer.setRenderTarget).mockImplementationOnce(() => {
      throw new Error("allocation failed");
    });
    const accumulator = buildSharedSceneAccumulator(1);

    expect(() =>
      accumulator.renderRound(renderer, 4_096, 4_096, () => undefined)
    ).not.toThrow();
    expect(accumulator.broken).toBe(true);
    expect(error).toHaveBeenCalledOnce();
    accumulator.dispose();
    error.mockRestore();
  });
});
