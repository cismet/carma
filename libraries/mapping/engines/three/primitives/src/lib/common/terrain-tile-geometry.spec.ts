import { describe, expect, it } from "vitest";

import { createProjectedTerrainTileGeometry } from "./terrain-tile-geometry";

const tile = {
  bounds: { west: 0, south: 0, east: 1, north: 1 },
  u: [0, 0, 1, 1],
  v: [0, 1, 0, 1],
  heightMeters: [10, 10, 10, 10],
  indices: [0, 3, 1, 0, 2, 3],
};

describe("createProjectedTerrainTileGeometry", () => {
  it("projects the native TIN with upward-facing normals", () => {
    const geometry = createProjectedTerrainTileGeometry({
      tile,
      projectToWorld: (longitude, latitude, height, target) =>
        target.set(longitude, height, -latitude),
    });

    expect([...(geometry.getIndex()?.array ?? [])]).toEqual([0, 3, 1, 0, 2, 3]);
    expect(geometry.getAttribute("position").count).toBe(4);
    expect(geometry.getAttribute("uv")).toBeUndefined();
    expect(geometry.getAttribute("normal").getY(0)).toBeCloseTo(1);
  });

  it("does not create skirt geometry from Cesium edge metadata", () => {
    const geometry = createProjectedTerrainTileGeometry({
      tile: {
        ...tile,
        westIndices: [0, 1],
        westSkirtHeight: 4,
      },
      projectToWorld: (longitude, latitude, height, target) =>
        target.set(longitude, height, -latitude),
    });

    expect(geometry.getAttribute("position").count).toBe(4);
    expect(geometry.getIndex()?.count).toBe(6);
  });

  it("drops zero-area faces and corrects downward winding", () => {
    const geometry = createProjectedTerrainTileGeometry({
      tile: {
        ...tile,
        // First triangle is clockwise in projected X/Z. The second has the
        // same horizontal vertex three times and must not reach the GPU.
        indices: [0, 1, 3, 0, 0, 0],
      },
      projectToWorld: (longitude, latitude, height, target) =>
        target.set(longitude, height, -latitude),
    });

    expect([...(geometry.getIndex()?.array ?? [])]).toEqual([0, 3, 1]);
    for (const index of [0, 1, 3]) {
      expect(geometry.getAttribute("normal").getY(index)).toBeGreaterThan(0);
    }
  });

  it("rejects out-of-range indices before creating GPU buffers", () => {
    expect(() =>
      createProjectedTerrainTileGeometry({
        tile: { ...tile, indices: [0, 1, 4] },
        projectToWorld: (longitude, latitude, height, target) =>
          target.set(longitude, height, -latitude),
      })
    ).toThrow("outside the vertex array");
  });
});
