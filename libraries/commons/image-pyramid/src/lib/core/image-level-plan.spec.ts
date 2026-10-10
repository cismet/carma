import type { DevicePixels, Ratio } from "@carma-units";
import {
  imageTileKey,
  imageTileRect,
  levelToNative,
  missingNeighbors,
  planImageLevels,
  targetLevel,
  tileRangeFor,
  type ImageLevel,
  type ImageRect,
  type ImageView,
} from "./image-level-plan";

// Geometry of the published 2026 pyramid RI_31_3112: base L1, levels rounded per axis.
const native = { width: 12736 as DevicePixels, height: 19136 as DevicePixels };
const sizes: [number, number, number][] = [
  [1, 6368, 9568],
  [2, 3184, 4784],
  [3, 1592, 2392],
  [4, 796, 1196],
  [5, 398, 598],
  [6, 199, 299],
  [7, 100, 150],
  [8, 50, 75],
];
const levels: ImageLevel[] = sizes.map(([level, width, height]) => ({
  level,
  width: width as DevicePixels,
  height: height as DevicePixels,
  tileWidth: Math.min(512, width) as DevicePixels,
  tileHeight: Math.min(512, height) as DevicePixels,
  cols: Math.ceil(width / Math.min(512, width)),
  rows: Math.ceil(height / Math.min(512, height)),
}));
const viewport = { width: 1400, height: 830 };
const viewAt = (cx: number, cy: number, density: number): ImageView => ({
  visible: {
    x: (cx - viewport.width / density / 2) as DevicePixels,
    y: (cy - viewport.height / density / 2) as DevicePixels,
    width: (viewport.width / density) as DevicePixels,
    height: (viewport.height / density) as DevicePixels,
  },
  density: density as Ratio,
});

describe("image level plan", () => {
  it("uses exact per-axis scales for rounded coarse levels", () => {
    const l7 = levels.find((level) => level.level === 7)!;
    expect(levelToNative(l7, native)).toEqual({
      x: 127.36,
      y: 127.57333333333334,
    });
    const rect = imageTileRect(l7, native, 0, 0);
    expect(rect.width).toBeCloseTo(native.width, 6);
    expect(rect.height).toBeCloseTo(native.height, 6);
  });

  it.each([256, 512, 1024, 2048])(
    "keeps native cell boundaries fixed across rounded levels for %i-pixel cells",
    (edge) => {
      for (const sensorFactor of [1, 2]) {
        const primary = { width: 5326, height: 7102 };
        const extent = {
          width: (primary.width * sensorFactor) as DevicePixels,
          height: (primary.height * sensorFactor) as DevicePixels,
        };
        const grid: ImageLevel[] = [1, 2, 3, 4].map((number) => {
          const divisor = 2 ** (number - 1),
            spacing = divisor * sensorFactor;
          return {
            level: number,
            width: Math.ceil(primary.width / divisor) as DevicePixels,
            height: Math.ceil(primary.height / divisor) as DevicePixels,
            tileWidth: (edge / divisor) as DevicePixels,
            tileHeight: (edge / divisor) as DevicePixels,
            cols: Math.ceil(primary.width / edge),
            rows: Math.ceil(primary.height / edge),
            nativeScale: { x: spacing as Ratio, y: spacing as Ratio },
          };
        });
        const first = grid[0];
        for (const level of grid) {
          expect(levelToNative(level, extent)).toEqual({
            x: 2 ** (level.level - 1) * sensorFactor,
            y: 2 ** (level.level - 1) * sensorFactor,
          });
          for (let row = 0; row < level.rows; row++)
            for (let col = 0; col < level.cols; col++) {
              const rect = imageTileRect(level, extent, col, row);
              expect(rect).toEqual(imageTileRect(first, extent, col, row));
              expect(rect.x + rect.width).toBeLessThanOrEqual(extent.width);
              expect(rect.y + rect.height).toBeLessThanOrEqual(extent.height);
            }
          const last = imageTileRect(
            level,
            extent,
            level.cols - 1,
            level.rows - 1
          );
          expect(last.x + last.width).toBe(extent.width);
          expect(last.y + last.height).toBe(extent.height);
        }
        const roi: ImageRect = {
          x: (edge * sensorFactor) as DevicePixels,
          y: (edge * sensorFactor) as DevicePixels,
          width: 1 as DevicePixels,
          height: 1 as DevicePixels,
        };
        for (const level of grid)
          expect(tileRangeFor(level, extent, roi)).toEqual({
            level: level.level,
            col0: 1,
            col1: 2,
            row0: 1,
            row1: 2,
          });
        if (edge === 1024)
          expect(imageTileRect(grid[2], extent, 0, 6).y).toBe(
            6144 * sensorFactor
          );
      }
    }
  );

  it("targets the coarsest level that is not upscaled", () => {
    // Density 0.3 physical px per native px: L1 is shown at 0.6, L2 would be 1.2.
    expect(targetLevel(levels, native, 0.3).level).toBe(1);
    expect(targetLevel(levels, native, 0.24).level).toBe(2);
    // Past 1:1 of the finest stored level it stays on that level.
    expect(targetLevel(levels, native, 2).level).toBe(1);
  });

  it("draws floor, bridges, underlay and target bottom to top", () => {
    const plan = planImageLevels(levels, native, viewAt(6000, 9000, 0.1));
    expect(plan.target).toBe(3);
    expect(plan.underlay).toBe(4);
    expect(plan.floor).toBe(5);
    expect(plan.layers).toEqual([5, 4, 3]);
    expect(plan.wants[0].role).toBe("floor");
  });

  it("requests every visible bridge coarse to fine before an L1 target without extending the ROI", () => {
    const available = levels.filter((level) => level.level <= 4);
    const view = viewAt(6000, 9000, 0.5);
    const plan = planImageLevels(available, native, view, {
      minLevelEdge: 0 as DevicePixels,
      ringTiles: 0,
      zoomOutFactor: 1,
      prefetchFiner: false,
    });
    expect(plan.layers).toEqual([4, 3, 2, 1]);
    expect([...new Set(plan.wants.map((want) => want.level))]).toEqual([
      4, 3, 2, 1,
    ]);
    for (const number of [3, 2, 1]) {
      const level = available.find((level) => level.level === number)!;
      const range = tileRangeFor(level, native, view.visible)!;
      const expected: string[] = [];
      for (let row = range.row0; row < range.row1; row++)
        for (let col = range.col0; col < range.col1; col++)
          expected.push(imageTileKey(number, col, row));
      const wants = plan.wants.filter((want) => want.level === number);
      expect(wants.map((want) => want.key).sort()).toEqual(expected.sort());
      expect(wants.every((want) => want.decode)).toBe(true);
      expect(
        wants.every(
          (want) => want.role === (number === 1 ? "target" : "underlay")
        )
      ).toBe(true);
    }
  });

  it("skips levels shorter than one tile and pins the coarsest used level", () => {
    // Fit view: L4 is the target, so L5 is both underlay and floor.
    const fit = planImageLevels(levels, native, viewAt(6368, 9568, 0.0434));
    expect([fit.target, fit.underlay, fit.floor]).toEqual([4, 5, 5]);
    expect(fit.layers).toEqual([5, 4]);
    expect(fit.wants.some((want) => want.level > 5)).toBe(false);
    expect(
      fit.wants.filter((want) => want.level === 5).map((want) => want.role)
    ).toEqual(["floor", "floor"]);
    // A thumbnail would target L6; the floor is shown downscaled instead.
    const thumbnail = planImageLevels(levels, native, viewAt(6368, 9568, 0.01));
    expect([thumbnail.target, thumbnail.underlay]).toEqual([5, null]);
    expect(thumbnail.layers).toEqual([5]);
  });

  it("keeps the visible target tiles of a thumbnail whose target is the floor", () => {
    const thumbnail = planImageLevels(levels, native, viewAt(6368, 9568, 0.01));
    expect(thumbnail.target).toBe(thumbnail.floor);
    // The floor pass planned them first, so no want carries a target role.
    expect(
      thumbnail.wants
        .filter((want) => want.level === thumbnail.target)
        .map((want) => want.role)
    ).toEqual(["floor", "floor"]);
    expect(thumbnail.visibleTarget).toEqual({
      level: 5,
      col0: 0,
      col1: 1,
      row0: 0,
      row1: 2,
    });
  });

  it("spans exactly the target wants with the visible target range", () => {
    const plan = planImageLevels(levels, native, viewAt(6000, 9000, 0.3), {
      foveaRadius: 0.3,
    });
    const range = plan.visibleTarget!;
    const keys: string[] = [];
    for (let row = range.row0; row < range.row1; row++)
      for (let col = range.col0; col < range.col1; col++)
        keys.push(imageTileKey(range.level, col, row));
    expect(range.level).toBe(plan.target);
    expect(keys.sort()).toEqual(
      plan.wants
        .filter(
          (want) => want.role === "target" || want.role === "target-periphery"
        )
        .map((want) => want.key)
        .sort()
    );
  });

  it("uses every level with a zero minimum edge", () => {
    const plan = planImageLevels(levels, native, viewAt(6368, 9568, 0.01), {
      minLevelEdge: 0 as DevicePixels,
    });
    expect([plan.target, plan.underlay, plan.floor]).toEqual([6, 7, 8]);
    expect(plan.layers).toEqual([8, 7, 6]);
  });

  it("orders underlay before target and target center-out before rings", () => {
    const plan = planImageLevels(levels, native, viewAt(6000, 9000, 0.3));
    const roles = plan.wants.map((want) => want.role);
    expect(roles.indexOf("underlay")).toBeLessThan(roles.indexOf("target"));
    expect(roles.lastIndexOf("target")).toBeLessThan(
      roles.indexOf("target-ring")
    );
    const target = plan.wants.filter((want) => want.role === "target");
    const distance = (want: (typeof target)[number]) => {
      const rect = imageTileRect(levels[0], native, want.col, want.row);
      return Math.hypot(
        rect.x + rect.width / 2 - 6000,
        rect.y + rect.height / 2 - 9000
      );
    };
    expect(distance(target[0])).toBeLessThanOrEqual(
      distance(target[target.length - 1])
    );
  });

  it("moves peripheral target tiles behind rings when foveated", () => {
    const plan = planImageLevels(levels, native, viewAt(6000, 9000, 0.3), {
      foveaRadius: 0.3,
    });
    const roles = plan.wants.map((want) => want.role);
    expect(roles).toContain("target-periphery");
    expect(roles.indexOf("target-periphery")).toBeGreaterThan(
      roles.lastIndexOf("target-ring")
    );
  });

  it("keeps decoded wants within the budget, sacrificing the lowest priorities", () => {
    const budget = 24 * 1024 * 1024;
    const plan = planImageLevels(levels, native, viewAt(6000, 9000, 0.4), {
      decodedByteBudget: budget,
      zoomIntent: "in",
    });
    const decoded = plan.wants.filter(
      (want) => want.decode && want.role !== "floor"
    );
    expect(
      decoded.reduce((sum, want) => sum + want.bytes, 0)
    ).toBeLessThanOrEqual(budget);
    expect(
      plan.wants.some((want) => want.role === "target" && !want.decode)
    ).toBe(false);
    expect(plan.wants.some((want) => !want.decode)).toBe(true);
  });

  it("ignores image edges when looking for missing neighbors", () => {
    const l3 = levels.find((level) => level.level === 3)!;
    expect(missingNeighbors(l3, 0, 0, () => false)).toBe(2 | 8);
    expect(missingNeighbors(l3, l3.cols - 1, l3.rows - 1, () => false)).toBe(
      1 | 4
    );
    expect(missingNeighbors(l3, 1, 1, () => true)).toBe(0);
  });

  // Outcome: after the planned work is resident, one zoom step of up to 2x in
  // either direction at any anchor renders from the new target or, at worst,
  // its parent; never from a level two steps coarser.
  it.each([0.08, 0.13, 0.21, 0.3, 0.45, 0.7])(
    "covers any single zoom step from density %s with target or underlay",
    (density) => {
      const start = viewAt(6000, 9000, density);
      for (const [fx, fy] of [
        [0.5, 0.5],
        [0.05, 0.05],
        [0.95, 0.1],
        [0.2, 0.9],
      ]) {
        // The wheel anchors at the hovered pointer, which the viewer reports as focus.
        const anchor = {
          x: start.visible.x + start.visible.width * fx,
          y: start.visible.y + start.visible.height * fy,
        };
        const before = planImageLevels(levels, native, {
          ...start,
          focus: { x: anchor.x as DevicePixels, y: anchor.y as DevicePixels },
        });
        const resident = new Set(
          before.wants.filter((want) => want.decode).map((want) => want.key)
        );
        for (const factor of [0.5, 0.71, 0.9, 1.1, 1.41, 2]) {
          const next = factor * density;
          const visible: ImageRect = {
            x: (anchor.x -
              (anchor.x - start.visible.x) / factor) as DevicePixels,
            y: (anchor.y -
              (anchor.y - start.visible.y) / factor) as DevicePixels,
            width: (start.visible.width / factor) as DevicePixels,
            height: (start.visible.height / factor) as DevicePixels,
          };
          const after = planImageLevels(levels, native, {
            visible,
            density: next as Ratio,
          });
          const clipped: ImageRect = {
            x: Math.max(0, visible.x) as DevicePixels,
            y: Math.max(0, visible.y) as DevicePixels,
            width: (Math.min(native.width, visible.x + visible.width) -
              Math.max(0, visible.x)) as DevicePixels,
            height: (Math.min(native.height, visible.y + visible.height) -
              Math.max(0, visible.y)) as DevicePixels,
          };
          const target = levels.find((level) => level.level === after.target)!;
          const range = tileRangeFor(target, native, clipped);
          for (let row = range.row0; row < range.row1; row++)
            for (let col = range.col0; col < range.col1; col++) {
              if (resident.has(imageTileKey(target.level, col, row))) continue;
              expect(after.underlay).not.toBeNull();
              const underlay = levels.find(
                (level) => level.level === after.underlay
              )!;
              const tile = imageTileRect(target, native, col, row);
              const cover = tileRangeFor(underlay, native, {
                x: Math.max(tile.x, clipped.x) as DevicePixels,
                y: Math.max(tile.y, clipped.y) as DevicePixels,
                width: (Math.min(
                  tile.x + tile.width,
                  clipped.x + clipped.width
                ) - Math.max(tile.x, clipped.x)) as DevicePixels,
                height: (Math.min(
                  tile.y + tile.height,
                  clipped.y + clipped.height
                ) - Math.max(tile.y, clipped.y)) as DevicePixels,
              });
              for (let r = cover.row0; r < cover.row1; r++)
                for (let c = cover.col0; c < cover.col1; c++)
                  expect({
                    factor,
                    fx,
                    fy,
                    tile: imageTileKey(underlay.level, c, r),
                    resident: resident.has(imageTileKey(underlay.level, c, r)),
                  }).toEqual({
                    factor,
                    fx,
                    fy,
                    tile: imageTileKey(underlay.level, c, r),
                    resident: true,
                  });
            }
        }
      }
    }
  );
});
