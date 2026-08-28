import type { WebGLRenderTarget, WebGLRenderer } from "three";
import { describe, expect, it, vi } from "vitest";

import { buildSharedSceneAccumulator } from "./shared-scene-accumulator";

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
  it("accumulates the configured rounds and resets on state changes", () => {
    const renderer = buildRenderer();
    const accumulator = buildSharedSceneAccumulator(2);
    const renderScene = vi.fn();

    accumulator.ensureState("first");
    expect(accumulator.jitterFor(0).x).toBeGreaterThanOrEqual(-0.5);
    accumulator.renderRound(renderer, 8, 4, renderScene);
    accumulator.renderRound(renderer, 8, 4, renderScene);
    accumulator.composite(renderer);

    expect(renderScene).toHaveBeenCalledTimes(2);
    expect(accumulator.converged).toBe(true);
    expect(accumulator.nextRound).toBe(2);
    accumulator.ensureState("second");
    expect(accumulator.nextRound).toBe(0);
    accumulator.dispose();
  });

  it("marks an unusable blend pipeline as broken", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const accumulator = buildSharedSceneAccumulator(1);

    accumulator.renderRound(buildRenderer(true), 4, 4, () => undefined);

    expect(accumulator.broken).toBe(true);
    expect(error).toHaveBeenCalledOnce();
    accumulator.dispose();
    error.mockRestore();
  });
});
