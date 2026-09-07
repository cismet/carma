import { describe, expect, it } from "vitest";
import { BufferGeometry, Float32BufferAttribute } from "three";
import { refineTerrainBoundaryTriangles } from "./terrain-boundary-refinement";

describe("terrain boundary triangle refinement", () => {
  it("splits a corner on two sides without inverted, missing or overlapping area", () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      "position",
      new Float32BufferAttribute([0, 0, 0, 0, 0, 1, 1, 0, 0], 3)
    );
    geometry.setAttribute(
      "normal",
      new Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3)
    );
    geometry.setIndex([0, 1, 2]);
    refineTerrainBoundaryTriangles(geometry, [
      { a: 0, b: 1, vertices: [{ position: [0, 0, 0.5], normal: [0, 1, 0] }] },
      { a: 0, b: 2, vertices: [{ position: [0.5, 0, 0], normal: [0, 1, 0] }] },
    ]);
    const p = geometry.getAttribute("position");
    const indices = geometry.index!.array;
    let twiceArea = 0;
    for (let i = 0; i < indices.length; i += 3) {
      const [a, b, c] = [indices[i], indices[i + 1], indices[i + 2]];
      expect(Math.max(a, b, c)).toBeLessThan(p.count);
      const area =
        (p.getZ(b) - p.getZ(a)) * (p.getX(c) - p.getX(a)) -
        (p.getX(b) - p.getX(a)) * (p.getZ(c) - p.getZ(a));
      expect(area).toBeGreaterThan(0);
      twiceArea += area;
    }
    expect(twiceArea).toBeCloseTo(1, 6);
    expect(indices.length).toBe(15);
    geometry.dispose();
  });
});
