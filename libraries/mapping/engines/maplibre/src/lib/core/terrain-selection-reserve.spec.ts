import { Matrix4, OrthographicCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { advanceTerrainTileFrontier } from "../runtime/integrations/terrain-tile-frontier";
import { idleRingAllowedError } from "./mesh-error-policy";
import { terrainTileKey, type TerrainTileId } from "./raster-dem-tile";
import { buildTerrainSelection } from "./terrain-selection";
import { createTerrainSelectionReserve } from "./terrain-selection-reserve";
import type { TerrainSelectionInput } from "./terrain-selection-types";
import { TILES_LOAD_POLICY } from "./tile-load-config";

function fixture() {
  const camera = new OrthographicCamera(-0.3, 0.3, 0.3, -0.3, 0.1, 40);
  camera.position.set(-4, 20, 4);
  camera.up.set(0, 0, -1);
  camera.lookAt(new Vector3(-4, 0, 4));
  camera.updateMatrixWorld(true);
  const sourceBounds = { west: -8, south: -8, east: 8, north: 8 };
  const input: TerrainSelectionInput = {
    viewportBounds: { west: -4.2, south: -4.2, east: -3.8, north: -3.8 },
    viewport: [400, 400],
    renderCamera: {
      projectionMatrix: camera.projectionMatrix.toArray(),
      matrixWorldInverse: camera.matrixWorldInverse.toArray(),
      matrixWorld: camera.matrixWorld.toArray(),
      position: [-4, 20, 4],
      fov: 60,
      isOrthographicCamera: true,
    },
    lodCameraPosition: [-4, 20, 4],
    rootMatrixWorld: new Matrix4().toArray(),
    origin: [0.5, 0.5, 0],
    meterScale: 1 / 360,
    source: { bounds: sourceBounds, minzoom: 1, maxzoom: 4, meshSegments: 16 },
    knownHeightRanges: {},
    unknownHeightRange: [0, 1],
    errorTargetPixels: 1,
    shadowLevelOffset: 2,
    minimumLevel: 1,
    maximumLevel: 4,
    maxSelectionTiles: 64,
    initialErrorTargetPixels: 16,
    baseLevel: 1,
  };
  const adapter = {
    getTileGridIdsForBounds: (_bounds: unknown, level: number) =>
      Array.from({ length: 4 ** level }, (_, index) => ({
        level,
        x: index % 2 ** level,
        y: Math.floor(index / 2 ** level),
      })),
    getTileBounds: ({ level, x, y }: TerrainTileId) => {
      const width = 16 / 2 ** level;
      return {
        west: -8 + x * width,
        east: -8 + (x + 1) * width,
        south: -8 + y * width,
        north: -8 + (y + 1) * width,
      };
    },
    getTileGeometricError: (level: number) => 4 / 2 ** (level - 1),
    getTileDataAvailable: () => true,
  };
  return { input, adapter };
}

describe("terrain reserve selection", () => {
  it("uses the native 3D-tiles ring targets without changing depth or principal point", () => {
    const { input } = fixture();
    const reserve = createTerrainSelectionReserve(input);
    const projection = input.renderCamera.projectionMatrix;
    reserve.views.forEach((view, index) => {
      const multiplier = TILES_LOAD_POLICY.idleRingTanMultipliers[index];
      expect(view.projectionMatrix[0]).toBe(projection[0] / multiplier);
      expect(view.projectionMatrix[5]).toBe(projection[5] / multiplier);
      expect(
        view.projectionMatrix.filter(
          (_, offset) => offset !== 0 && offset !== 5
        )
      ).toEqual(projection.filter((_, offset) => offset !== 0 && offset !== 5));
      expect(view.errorTargetPixels).toBe(
        idleRingAllowedError(
          16,
          index + 1,
          TILES_LOAD_POLICY.idleRingRefinePassLimit,
          1
        )
      );
    });
    expect(
      createTerrainSelectionReserve({ ...input, baseLevel: undefined }).views
    ).toEqual([]);
  });

  it("replaces a resident whole-source base with a complete disjoint refined cut", () => {
    const { input, adapter } = fixture();
    const selection = buildTerrainSelection(input, adapter);
    const initial = adapter
      .getTileGridIdsForBounds(input.source.bounds, 1)
      .map((id) => ({ id, key: `source:${terrainTileKey(id)}` }));
    const requested = selection.entries.map(({ id }) => ({
      id,
      key: `source:${terrainTileKey(id)}`,
    }));
    let staged = initial;
    for (const stage of selection.viewportStages) {
      const ready = stage.map(({ id }) => ({
        id,
        key: `source:${terrainTileKey(id)}`,
      }));
      staged = advanceTerrainTileFrontier(staged, ready, () => true);
      expect(
        ready.every((tile) =>
          staged.some((published) => published.key === tile.key)
        )
      ).toBe(true);
    }
    const frontier = advanceTerrainTileFrontier(initial, requested, () => true);
    expect(frontier.map(({ key }) => key).sort()).toEqual(
      requested.map(({ key }) => key).sort()
    );
    expect(selection.entries.some(({ id }) => id.level > 1)).toBe(true);
  });

  it("does not let the separately resident base consume the entire active selection allowance", () => {
    const { input, adapter } = fixture();
    const selection = buildTerrainSelection(
      { ...input, maxSelectionTiles: 4 },
      adapter
    );
    expect(selection.entries.some(({ id }) => id.level > 1)).toBe(true);
    expect(selection.entries.length).toBeLessThanOrEqual(8);
    const initial = adapter
      .getTileGridIdsForBounds(input.source.bounds, 1)
      .map((id) => ({ id, key: terrainTileKey(id) }));
    const requested = selection.entries.map(({ id }) => ({
      id,
      key: terrainTileKey(id),
    }));
    expect(
      advanceTerrainTileFrontier(initial, requested, () => true).length
    ).toBe(requested.length);
  });
});
