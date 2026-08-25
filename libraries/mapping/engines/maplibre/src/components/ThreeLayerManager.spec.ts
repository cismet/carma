// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  retainBuildingGroupsInView,
  type CachedBuildingGroup,
} from "./ThreeLayerManager";

const buildGroup = (
  bounds: CachedBuildingGroup["bounds"],
  fragment: number[][],
  height = 10
): CachedBuildingGroup => ({
  fragments: [fragment],
  height,
  zGround: 0,
  isPublic: false,
  roofColor: null,
  wallColor: null,
  sourceFeature: {
    id: "building-1",
    properties: {},
    source: "buildings",
    sourceLayer: "building",
  },
  bounds,
});

describe("retainBuildingGroupsInView", () => {
  it("retains a missing building until its complete footprint leaves the viewport", () => {
    const cache = new Map([
      [
        "building-1",
        buildGroup({ west: -1, south: 0, east: 1, north: 1 }, [
          [-1, 0],
          [1, 0],
          [1, 1],
        ]),
      ],
    ]);

    retainBuildingGroupsInView(
      cache,
      new Map(),
      { west: 0, south: 0, east: 2, north: 2 },
      0
    );
    expect(cache.has("building-1")).toBe(true);

    retainBuildingGroupsInView(
      cache,
      new Map(),
      { west: 2, south: 0, east: 3, north: 2 },
      0
    );
    expect(cache.has("building-1")).toBe(false);
  });

  it("merges newly queried fragments with retained parts of the same building", () => {
    const firstFragment = [
      [0, 0],
      [1, 0],
      [1, 1],
    ];
    const secondFragment = [
      [1, 0],
      [2, 0],
      [2, 1],
    ];
    const cache = new Map([
      [
        "building-1",
        buildGroup({ west: 0, south: 0, east: 1, north: 1 }, firstFragment),
      ],
    ]);
    const queried = new Map([
      [
        "building-1",
        buildGroup(
          { west: 1, south: 0, east: 2, north: 1 },
          secondFragment,
          15
        ),
      ],
    ]);

    retainBuildingGroupsInView(
      cache,
      queried,
      { west: 0, south: 0, east: 2, north: 2 },
      0
    );

    expect(cache.get("building-1")).toMatchObject({
      fragments: [firstFragment, secondFragment],
      height: 15,
      bounds: { west: 0, south: 0, east: 2, north: 1 },
    });
  });

  it("does not retain prefetched buildings outside the padded viewport", () => {
    const cache = new Map<string, CachedBuildingGroup>();
    const queried = new Map([
      [
        "building-1",
        buildGroup({ west: 5, south: 5, east: 6, north: 6 }, [
          [5, 5],
          [6, 5],
          [6, 6],
        ]),
      ],
    ]);

    retainBuildingGroupsInView(
      cache,
      queried,
      { west: 0, south: 0, east: 1, north: 1 },
      0.1
    );

    expect(cache.size).toBe(0);
  });
});
