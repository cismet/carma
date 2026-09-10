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
  it.each([
    {
      label: "aligned known height",
      caster: [10, 20] as const,
      included: true,
    },
    {
      label: "known height above the corridor",
      caster: [60, 70] as const,
      included: false,
    },
    {
      label: "unknown height stays conservative",
      caster: undefined,
      included: true,
    },
  ])(
    "selects native-LOD bounds without downloading a raster: $label",
    ({ caster, included }) => {
      const base = input();
      const receiver = { west: 0, east: 1, south: 0, north: 1 };
      const ids = [
        { level: 1, x: 0, y: 0 },
        { level: 1, x: 0, y: 1 },
        { level: 1, x: 1, y: 1 },
      ];
      const selection = buildTerrainSelection(
        {
          ...base,
          viewportBounds: receiver,
          source: {
            ...base.source,
            bounds: { west: 0, east: 5, south: -2, north: 1 },
            minzoom: 1,
            maxzoom: 1,
          },
          origin: [0.5, 0.5, 0],
          meterScale: 1 / 360,
          minimumLevel: 1,
          maximumLevel: 1,
          knownHeightRanges: {
            "1/0/0": [10, 20],
            ...(caster ? { "1/0/1": caster } : {}),
            "1/1/1": [10, 20],
          },
          shadow: {
            camera: {
              ...base.renderCamera,
              projectionMatrix: new Matrix4()
                .makeScale(0.1, 0.01, 0.1)
                .toArray(),
              isOrthographicCamera: true,
            },
            shadowMapSize: [1024, 1024],
            bounds: { west: 0, east: 5, south: -2, north: 1 },
          },
        },
        {
          getTileGridIdsForBounds: () => ids,
          getTileBounds: (id) =>
            id.y === 0
              ? receiver
              : { west: id.x * 4, east: id.x * 4 + 1, south: -2, north: -1 },
          getTileGeometricError: () => 0,
          getTileDataAvailable: () => true,
        }
      );
      expect(selection.entries.map((entry) => entry.id)).toEqual(
        included ? [ids[0], ids[1]] : [ids[0]]
      );
      expect(selection.loadEntries.some((entry) => entry.id.x === 1)).toBe(
        false
      );
    }
  );
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
