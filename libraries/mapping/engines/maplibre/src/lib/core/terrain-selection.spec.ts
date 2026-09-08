import { Camera, Matrix4 } from "three";
import { describe, expect, it } from "vitest";

import { buildTerrainSelection } from "./terrain-selection";
import { executeTerrainWorkerTask } from "../runtime/integrations/terrain-worker-task";
import type { TerrainSelectionInput } from "./terrain-selection";
import { terrainTileContains } from "../runtime/integrations/terrain-tile-frontier";

const input = (): TerrainSelectionInput => {
  const camera = new Camera();
  camera.updateMatrixWorld(true);
  const matrix = new Matrix4().toArray();
  const snapshot = {
    projectionMatrix: [...camera.projectionMatrix.elements],
    matrixWorldInverse: [...camera.matrixWorldInverse.elements],
    matrixWorld: [...camera.matrixWorld.elements],
    position: [0, 0, 0] as [number, number, number],
    fov: 60,
  };
  return {
    viewportBounds: { west: 7, south: 51, east: 7.5, north: 51.5 },
    viewport: [2560, 1440],
    renderCamera: snapshot,
    lodCameraPosition: [0, 0, 0],
    rootMatrixWorld: matrix,
    origin: [0, 0, 0],
    meterScale: 1,
    source: {
      bounds: { west: 7, south: 51, east: 7.5, north: 51.5 },
      minzoom: 8,
      maxzoom: 10,
      meshSegments: 512,
    },
    knownHeightRanges: { "8/132/87": [100, 120] },
    unknownHeightRange: [-1000, 10000],
    errorTargetPixels: 2.5,
    shadowLevelOffset: 2,
    minimumLevel: 8,
    maximumLevel: 10,
    maxSelectionTiles: 192,
    initialErrorTargetPixels: 16,
  };
};

describe("terrain selection worker task", () => {
  it("terminates with no coverage outside the source", () => {
    const selection = buildTerrainSelection(input(), {
      getTileGridIdsForBounds: () => [],
      getTileBounds: () => input().viewportBounds,
      getTileGeometricError: () => 1,
      getTileDataAvailable: () => false,
    });
    expect(selection.entries).toEqual([]);
    expect(selection.loadEntries).toEqual([]);
  });
  it("fills unknown-height coverage with a bounded coarse cut before detailed receivers", () => {
    const selectionInput = input();
    const selection = buildTerrainSelection(
      { ...selectionInput, errorTargetPixels: 0.01 },
      {
        getTileGridIdsForBounds: () => [{ level: 8, x: 132, y: 85 }],
        getTileBounds: () => selectionInput.viewportBounds,
        getTileGeometricError: () => 1_000_000,
        getTileDataAvailable: () => true,
      }
    );
    const first = selection.viewportStages[0];
    const final = selection.viewportStages.at(-1)!;
    expect(first.length).toBeGreaterThan(0);
    expect(first.length).toBeLessThanOrEqual(4);
    expect(final.length).toBeGreaterThan(first.length);
    for (const entry of final)
      expect(
        first.some((parent) => terrainTileContains(parent.id, entry.id))
      ).toBe(true);
    for (const stage of selection.viewportStages) {
      for (const entry of stage)
        expect(
          stage.some(
            (other) =>
              other !== entry && terrainTileContains(other.id, entry.id)
          )
        ).toBe(false);
    }
    expect(selection.loadEntries.slice(0, first.length)).toEqual(first);
  });
  it("keeps synchronous and worker-task selection bit-for-bit identical", async () => {
    const selectionInput = input();
    const expected = buildTerrainSelection(selectionInput);
    const actual = await executeTerrainWorkerTask({
      kind: "select",
      input: selectionInput,
    });
    expect(actual).toEqual({ kind: "select", selection: expected });
    expect(expected.viewportStages[0]?.length).toBeGreaterThan(0);
  });
});
