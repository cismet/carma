import { describe, expect, it } from "vitest";

import {
  compensateMeshNormalsForScale,
  quantizeMeshPositions,
} from "./quantize-mesh-positions";

describe("mesh position encoding", () => {
  it("bounds reconstruction error and reports actual integer storage, including 12-bit Uint16", () => {
    const positions = new Float32Array([
      -10, 0, -8, 10, 4, 8, 0.123, 1.678, 3.456,
    ]);
    const results = [8, 12, 16].map((bits) =>
      quantizeMeshPositions(positions, bits as 8 | 12 | 16)
    );
    for (const result of results)
      expect(result.maximumError).toBeLessThanOrEqual(
        result.errorBound + 1e-12
      );
    expect(results[0].values.byteLength).toBe(positions.length);
    expect(results[1].values.byteLength).toBe(positions.length * 2);
    expect(results[2].values.byteLength).toBe(results[1].values.byteLength);
    expect(results[1].values.every((value) => value <= 4095)).toBe(true);
  });
  it("keeps a flat axis invertible without adding position error", () => {
    const result = quantizeMeshPositions([0, 7, 0, 2, 7, 2], 16);
    expect(result.decodeScale[1]).toBe(1);
    expect(result.values[1]).toBe(0);
    expect(result.values[4]).toBe(0);
    expect(result.maximumError).toBe(0);
  });
  it("compensates nonuniform decode scale before the normal matrix is applied", () => {
    const normal = [0.3, 0.8, -0.5];
    const scale = [1000, 3, 600] as const;
    const encoded = compensateMeshNormalsForScale(normal, scale);
    const decoded = Array.from(encoded, (value, axis) => value / scale[axis]);
    const length = Math.hypot(...decoded),
      originalLength = Math.hypot(...normal);
    decoded.forEach((value, axis) =>
      expect(value / length).toBeCloseTo(normal[axis] / originalLength, 7)
    );
  });
});
