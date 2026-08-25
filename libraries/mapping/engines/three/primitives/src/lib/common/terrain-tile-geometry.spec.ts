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
});
