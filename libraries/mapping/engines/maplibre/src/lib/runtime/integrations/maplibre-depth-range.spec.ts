import { describe, expect, it, vi } from "vitest";

import { readMapLibreLayerDepthRange } from "./maplibre-depth-range";

const createGl = (range: [number, number]) => ({
  DEPTH_RANGE: 0x0b70,
  getParameter: vi.fn(() => new Float32Array(range)),
});

describe("readMapLibreLayerDepthRange", () => {
  it("takes the range MapLibre applied from its state cache", () => {
    const gl = createGl([0, 1]);
    const map = {
      painter: { context: { depthRange: { current: [0.25, 0.5], dirty: false } } },
    };
    expect(readMapLibreLayerDepthRange(map as never, gl)).toEqual([0.25, 0.5]);
    expect(gl.getParameter).not.toHaveBeenCalled();
  });

  it.each([
    null,
    {},
    { painter: { context: {} } },
    { painter: { context: { depthRange: { current: [0.25, 0.5], dirty: true } } } },
    { painter: { context: { depthRange: { current: "broken" } } } },
  ])("asks GL when the cache cannot be trusted", (map) => {
    const gl = createGl([0.125, 0.75]);
    expect(readMapLibreLayerDepthRange(map as never, gl)).toEqual([0.125, 0.75]);
    expect(gl.getParameter).toHaveBeenCalledWith(gl.DEPTH_RANGE);
  });
});
