// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  buildShadowTileLayout,
  type ShadowTileLayoutOptions,
} from "./shadow-tile-layout";

const baseOptions = (): ShadowTileLayoutOptions => ({
  receiverBounds: {
    left: 0.2,
    right: 19.7,
    bottom: -5.8,
    top: 6.1,
    near: 100,
    far: 500,
  },
  casterPaddingMeters: 1,
  casterReliefMeters: 20,
  casterReachMeters: 80,
  targetMetersPerTexel: 1,
  maxShadowMapDimension: 8,
  maxTileCount: 12,
});

describe("buildShadowTileLayout", () => {
  it("builds texel-snapped, overlapping rectangular tiles", () => {
    const layout = buildShadowTileLayout(baseOptions());

    expect(layout.statistics).toMatchObject({
      columnCount: 4,
      rowCount: 3,
      tileCount: 12,
      casterGuardTexels: 1,
      effectiveMetersPerTexel: 1,
      budgetLimited: false,
    });
    expect(layout.snappedReceiverBounds).toMatchObject({
      left: 0,
      right: 20,
      bottom: -6,
      top: 7,
    });
    expect(layout.tiles.map(({ id }) => id)).toEqual([
      "r0-c0",
      "r0-c1",
      "r0-c2",
      "r0-c3",
      "r1-c0",
      "r1-c1",
      "r1-c2",
      "r1-c3",
      "r2-c0",
      "r2-c1",
      "r2-c2",
      "r2-c3",
    ]);
    for (const tile of layout.tiles) {
      expect(tile.widthPixels).toBe(8);
      expect(tile.heightPixels).toBe(8);
      expect(tile.right - tile.left).toBe(8);
      expect(tile.top - tile.bottom).toBe(8);
      expect(tile.left).toBe(tile.receiverBounds.left - 1);
    }
    expect(layout.tiles[0].receiverBounds.right).toBe(
      layout.tiles[1].receiverBounds.left
    );
    expect(layout.tiles[0].right).toBeGreaterThan(layout.tiles[1].left);
    expect(layout.debugPolygons).toHaveLength(2 + layout.tiles.length * 2);
  });

  it("keeps the layout stable while bounds remain in the same texels", () => {
    const options = baseOptions();
    const first = buildShadowTileLayout(options);
    const shifted = buildShadowTileLayout({
      ...options,
      receiverBounds: {
        ...options.receiverBounds,
        left: 0.35,
        right: 19.85,
        bottom: -5.65,
        top: 6.25,
      },
    });

    expect(shifted.snappedReceiverBounds).toEqual(first.snappedReceiverBounds);
    expect(shifted.tiles).toEqual(first.tiles);
  });

  it("degrades resolution deterministically to respect the tile budget", () => {
    const options: ShadowTileLayoutOptions = {
      ...baseOptions(),
      receiverBounds: {
        left: -50,
        right: 50,
        bottom: -50,
        top: 50,
        near: 100,
        far: 500,
      },
      casterPaddingMeters: 0,
      targetMetersPerTexel: 1,
      maxShadowMapDimension: 10,
      maxTileCount: 4,
    };
    const first = buildShadowTileLayout(options);
    const second = buildShadowTileLayout(options);

    expect(first).toEqual(second);
    expect(first.statistics.tileCount).toBeLessThanOrEqual(4);
    expect(first.statistics.columnCount).toBe(2);
    expect(first.statistics.rowCount).toBe(2);
    expect(first.statistics.effectiveMetersPerTexel).toBeGreaterThan(5);
    expect(first.statistics.budgetLimited).toBe(true);
    for (const tile of first.tiles) {
      expect(tile.widthPixels).toBe(10);
      expect(tile.heightPixels).toBe(10);
      expect(tile.right - tile.left).toBeCloseTo(
        first.statistics.effectiveMetersPerTexel * 10
      );
      expect(tile.top - tile.bottom).toBeCloseTo(
        first.statistics.effectiveMetersPerTexel * 10
      );
    }
  });

  it("extends partial edge tiles outward while preserving their receiver core", () => {
    const layout = buildShadowTileLayout(baseOptions());
    const bottomRight = layout.tiles.at(-1);

    expect(bottomRight).toBeDefined();
    expect(bottomRight?.receiverBounds.right).toBe(
      layout.snappedReceiverBounds.right
    );
    expect(bottomRight?.receiverBounds.bottom).toBe(
      layout.snappedReceiverBounds.bottom
    );
    expect(bottomRight?.right).toBeGreaterThan(
      (bottomRight?.receiverBounds.right ?? 0) +
        layout.statistics.casterGuardMeters
    );
    expect(bottomRight?.bottom).toBeLessThan(
      (bottomRight?.receiverBounds.bottom ?? 0) -
        layout.statistics.casterGuardMeters
    );
  });

  it("uses rectangular tile budgets for long, narrow receiver regions", () => {
    const layout = buildShadowTileLayout({
      ...baseOptions(),
      receiverBounds: {
        left: 0,
        right: 300,
        bottom: 0,
        top: 30,
        near: 50,
        far: 200,
      },
      casterPaddingMeters: 0,
      targetMetersPerTexel: 1,
      maxShadowMapDimension: 32,
      maxTileCount: 4,
    });

    expect(layout.statistics.columnCount).toBe(4);
    expect(layout.statistics.rowCount).toBe(1);
    expect(layout.statistics.tileCount).toBe(4);
  });

  it("extends depth, not the tile footprint, for a low sun caster reach", () => {
    const options = baseOptions();
    const shortReach = buildShadowTileLayout({
      ...options,
      casterReachMeters: 10,
    });
    const horizonReach = buildShadowTileLayout({
      ...options,
      casterReachMeters: 20_000,
    });

    expect(
      horizonReach.tiles.map(({ left, right, bottom, top }) => ({
        left,
        right,
        bottom,
        top,
      }))
    ).toEqual(
      shortReach.tiles.map(({ left, right, bottom, top }) => ({
        left,
        right,
        bottom,
        top,
      }))
    );
    expect(horizonReach.statistics.nearMeters).toBe(0);
    expect(horizonReach.statistics.farMeters).toBe(520);
    expect(horizonReach.statistics.depthMeters).toBe(520);
    expect(horizonReach.statistics.clippedCasterDepthMeters).toBe(19_920);
  });

  it("rejects guard bands that leave no useful receiver area", () => {
    expect(() =>
      buildShadowTileLayout({
        ...baseOptions(),
        casterPaddingMeters: 4,
      })
    ).toThrow(/fewer than two receiver texels/);
  });
});
