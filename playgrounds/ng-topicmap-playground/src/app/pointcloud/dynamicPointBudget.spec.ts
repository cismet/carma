import { describe, expect, it } from "vitest";

import {
  adaptPointBudget,
  allocatePointBudget,
  derivePointMemoryBudget,
  deriveSceneMemoryAllocation,
  deriveSceneRequestAllocation,
  estimatePointChunkMemoryBytes,
  POINT_MEMORY_BUDGET_SOURCES,
} from "./dynamicPointBudget";

describe("dynamic point budget", () => {
  it("prioritizes visible clouds and retains coarse off-screen coverage", () => {
    const allocations = allocatePointBudget(1_000_000, [
      { loadedPoints: 2_000_000, visible: true },
      { loadedPoints: 2_000_000, visible: false },
    ]);

    expect(allocations[0]).toBeGreaterThan(900_000);
    expect(allocations[1]).toBeGreaterThan(0);
    expect(allocations[0] + allocations[1]).toBe(1_000_000);
  });

  it("reuses budget left by a smaller cloud", () => {
    expect(
      allocatePointBudget(1_000_000, [
        { loadedPoints: 100_000, visible: true },
        { loadedPoints: 2_000_000, visible: true },
      ])
    ).toEqual([100_000, 900_000]);
  });

  it("tracks the requested frame rate without exceeding the safety cap", () => {
    expect(adaptPointBudget(1_000_000, 12_000_000, 52, 30)).toBe(700_000);
    expect(adaptPointBudget(1_000_000, 12_000_000, 20, 30)).toBe(1_200_000);
    expect(adaptPointBudget(12_000_000, 12_000_000, 20, 30)).toBe(12_000_000);
  });

  it("uses the target frame rate instead of fixed frame-time thresholds", () => {
    expect(adaptPointBudget(1_000_000, 12_000_000, 20, 60)).toBe(850_000);
    expect(adaptPointBudget(1_000_000, 12_000_000, 20, 30)).toBe(1_200_000);
  });

  it("derives capacity from browser memory instead of a fixed point cap", () => {
    const budget = derivePointMemoryBudget({
      jsHeapSizeLimitBytes: 4 * 1024 ** 3,
      deviceMemoryGiB: 8,
    });

    expect(budget.source).toBe(POINT_MEMORY_BUDGET_SOURCES.JS_HEAP_LIMIT);
    expect(budget.bytes).toBe(Math.floor(4 * 1024 ** 3 * 0.3));
    expect(budget.pointCapacity).toBeGreaterThan(10_000_000);
  });

  it("reserves equal scene-memory slices for points and active meshes", () => {
    const mebibyte = 1024 ** 2;

    expect(deriveSceneMemoryAllocation(1024 * mebibyte, 5, 1)).toEqual({
      pointBytes: 512 * mebibyte,
      pointCapacity: Math.floor((512 * mebibyte) / 80),
      meshBytes: 512 * mebibyte,
      meshBytesPerLayer: 512 * mebibyte,
    });
    expect(deriveSceneMemoryAllocation(1024 * mebibyte, 2, 3)).toEqual({
      pointBytes: 256 * mebibyte,
      pointCapacity: Math.floor((256 * mebibyte) / 80),
      meshBytes: 768 * mebibyte,
      meshBytesPerLayer: 256 * mebibyte,
    });
  });

  it("reclaims the full scene allowance when only one asset type is active", () => {
    const budget = 600 * 1024 ** 2;

    expect(deriveSceneMemoryAllocation(budget, 1, 0).pointBytes).toBe(budget);
    expect(deriveSceneMemoryAllocation(budget, 0, 2).meshBytesPerLayer).toBe(
      budget / 2
    );
    expect(deriveSceneMemoryAllocation(budget, 0, 0)).toEqual({
      pointBytes: 0,
      pointCapacity: 0,
      meshBytes: 0,
      meshBytesPerLayer: 0,
    });
  });

  it("bounds scene-wide point and mesh request concurrency", () => {
    expect(
      deriveSceneRequestAllocation(12, {
        pointJobsByCloud: [10, 10, 10, 10],
        meshJobsByLayer: [20],
      })
    ).toEqual({
      pointJobs: 0,
      pointJobsByCloud: [0, 0, 0, 0],
      meshJobs: 12,
      meshJobsByLayer: [12],
    });
    expect(
      deriveSceneRequestAllocation(12, {
        pointJobsByCloud: [],
        meshJobsByLayer: [10, 10, 10],
      })
    ).toEqual({
      pointJobs: 0,
      pointJobsByCloud: [],
      meshJobs: 12,
      meshJobsByLayer: [4, 4, 4],
    });
    expect(
      deriveSceneRequestAllocation(12, {
        pointJobsByCloud: [10, 10],
        meshJobsByLayer: [],
      })
    ).toEqual({
      pointJobs: 12,
      pointJobsByCloud: [6, 6],
      meshJobs: 0,
      meshJobsByLayer: [],
    });
    const fullScene = deriveSceneRequestAllocation(12, {
      pointJobsByCloud: [10, 10, 10, 10, 10],
      meshJobsByLayer: [10, 10, 10],
    });
    expect(fullScene.pointJobs).toBe(0);
    expect(fullScene.pointJobsByCloud.every((jobs) => jobs === 0)).toBe(true);
    expect(fullScene.meshJobsByLayer.every((jobs) => jobs >= 1)).toBe(true);
    expect(fullScene.pointJobs + fullScene.meshJobs).toBe(12);
  });

  it("gives all request slots to mesh while mesh demand exists", () => {
    expect(
      deriveSceneRequestAllocation(12, {
        pointJobsByCloud: [1],
        meshJobsByLayer: [100],
      })
    ).toMatchObject({ pointJobs: 0, meshJobs: 12 });
    expect(
      deriveSceneRequestAllocation(12, {
        pointJobsByCloud: [100],
        meshJobsByLayer: [2],
      })
    ).toMatchObject({ pointJobs: 0, meshJobs: 2 });
    expect(
      deriveSceneRequestAllocation(12, {
        pointJobsByCloud: [0],
        meshJobsByLayer: [100],
      })
    ).toMatchObject({ pointJobs: 0, meshJobs: 12 });
    expect(
      deriveSceneRequestAllocation(12, {
        pointJobsByCloud: [100],
        meshJobsByLayer: [0, 0],
      })
    ).toEqual({
      pointJobs: 12,
      pointJobsByCloud: [12],
      meshJobs: 0,
      meshJobsByLayer: [0, 0],
    });
  });

  it("estimates resident source, renderer, and GPU point buffers", () => {
    const pointCount = 10;
    const bytes = estimatePointChunkMemoryBytes({
      positions: new Float32Array(pointCount * 3),
      colors: new Uint8Array(pointCount * 3),
      fieldValues: {
        classification: new Float32Array(pointCount),
        pointindex: new Float32Array(pointCount),
      },
      pointCount,
    });

    // Source: 12 + 3 + 4 + 4 B/point; renderer CPU: 16 B/point;
    // mirrored GPU attributes: 35 B/point.
    expect(bytes).toBe(pointCount * (23 + 16 + 35));
  });
});
