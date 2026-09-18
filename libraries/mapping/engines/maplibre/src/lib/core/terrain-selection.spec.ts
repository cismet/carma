import { Camera, Matrix4, OrthographicCamera, PerspectiveCamera } from "three";
import { describe, expect, it } from "vitest";

import { buildTerrainSelection } from "./terrain-selection";
import { executeTerrainWorkerTask } from "../runtime/integrations/terrain-worker-task";
import type { TerrainSelectionInput } from "./terrain-selection";
import {
  advanceTerrainTileFrontier,
  terrainTileContains,
} from "../runtime/integrations/terrain-tile-frontier";
import { terrainTileKey, type TerrainTileId } from "./raster-dem-tile";
import {
  snapshotTileCameraViews,
  TILE_CAMERA_ROLE,
  TILE_CAMERA_PRIORITY,
} from "./tile-camera-demand";

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

const cornerViewport = () => {
  const camera = new Camera();
  camera.position.set(0.25, 0, -0.25);
  camera.projectionMatrix.makeScale(10, 1, 10);
  camera.updateMatrixWorld(true);
  const base = input();
  const selectionInput: TerrainSelectionInput = {
    ...base,
    viewportBounds: { west: 0.15, east: 0.35, south: 0.15, north: 0.35 },
    renderCamera: {
      ...base.renderCamera,
      projectionMatrix: camera.projectionMatrix.toArray(),
      matrixWorldInverse: camera.matrixWorldInverse.toArray(),
      matrixWorld: camera.matrixWorld.toArray(),
      position: [0.25, 0, -0.25],
    },
    lodCameraPosition: [0.25, 0, -0.25],
    origin: [0.5, 0.5, 0],
    meterScale: 1 / 360,
    minimumLevel: 1,
    maximumLevel: 3,
    source: {
      ...base.source,
      minzoom: 1,
      maxzoom: 3,
      bounds: { west: 0, east: 4, south: 0, north: 4 },
    },
    knownHeightRanges: {},
    unknownHeightRange: [0, 1],
  };
  const adapter = {
    getTileGridIdsForBounds: () => [{ level: 1, x: 0, y: 0 }],
    getTileBounds: ({ level, x, y }: TerrainTileId) => {
      const width = 4 / 2 ** (level - 1);
      return {
        west: x * width,
        east: (x + 1) * width,
        south: y * width,
        north: (y + 1) * width,
      };
    },
    getTileGeometricError: () => 100,
    getTileDataAvailable: () => true,
  };
  return { selectionInput, adapter };
};

describe("terrain selection worker task", () => {
  it.each([false, true])(
    "keeps complete sibling coverage while refining only the corner demand (shadow=%s)",
    (withShadow) => {
      const { selectionInput, adapter } = cornerViewport();
      const selection = buildTerrainSelection(
        {
          ...selectionInput,
          ...(withShadow
            ? {
                shadow: {
                  camera: selectionInput.renderCamera,
                  bounds: selectionInput.source.bounds,
                  shadowMapSize: [256, 256] as const,
                },
              }
            : {}),
        },
        adapter
      );
      expect(
        selection.entries.map(({ id }) => terrainTileKey(id)).sort()
      ).toEqual([
        "2/0/1",
        "2/1/0",
        "2/1/1",
        "3/0/0",
        "3/0/1",
        "3/1/0",
        "3/1/1",
      ]);
      let frontier = [{ key: "source:1/0/0", id: { level: 1, x: 0, y: 0 } }];
      for (const stage of selection.viewportStages) {
        const requested = stage.map(({ id }) => ({
          key: `source:${terrainTileKey(id)}`,
          id,
        }));
        frontier = advanceTerrainTileFrontier(frontier, requested, () => true);
        expect(frontier.map(({ key }) => key).sort()).toEqual(
          requested.map(({ key }) => key).sort()
        );
      }
      expect(frontier.map(({ id }) => terrainTileKey(id)).sort()).toEqual(
        selection.entries.map(({ id }) => terrainTileKey(id)).sort()
      );
    }
  );

  it("charges the full sibling quartet to the selection budget", () => {
    const { selectionInput, adapter } = cornerViewport();
    const limited = buildTerrainSelection(
      { ...selectionInput, maxSelectionTiles: 4 },
      adapter
    );
    expect(limited.entries).toHaveLength(4);
    expect(limited.entries.every(({ id }) => id.level === 2)).toBe(true);
    const insufficient = buildTerrainSelection(
      { ...selectionInput, maxSelectionTiles: 3 },
      adapter
    );
    expect(insufficient.entries.map(({ id }) => terrainTileKey(id))).toEqual([
      "1/0/0",
    ]);
  });

  it("does not remove a parent's area for an unavailable offscreen quadrant", () => {
    const { selectionInput, adapter } = cornerViewport();
    const selection = buildTerrainSelection(selectionInput, {
      ...adapter,
      getTileDataAvailable: (id) =>
        !(id.level === 2 && id.x === 1 && id.y === 1),
    });
    expect(selection.entries.map(({ id }) => terrainTileKey(id))).toEqual([
      "1/0/0",
    ]);
  });

  it("orders raster work around the padded focus while retaining the full viewport and source identities", () => {
    const base: TerrainSelectionInput = {
      ...input(),
      viewportBounds: { west: -1, east: 1, south: 0, north: 1 },
      origin: [0.5, 0.5, 0],
      meterScale: 1 / 360,
      minimumLevel: 3,
      maximumLevel: 3,
      unknownHeightRange: [0, 0],
      knownHeightRanges: {},
    };
    const adapter = {
      getTileGridIdsForBounds: () => [0, 1].map((x) => ({ level: 3, x, y: 0 })),
      getTileBounds: ({ x }: { x: number }) => ({
        west: x - 1,
        east: x,
        south: 0,
        north: 1,
      }),
      getTileGeometricError: () => 0.01,
      getTileDataAvailable: () => true,
    };
    const initial = buildTerrainSelection(base, adapter);
    const left = buildTerrainSelection(
      { ...base, viewportFocusNdc: [-0.5, 0] },
      adapter
    );
    const right = buildTerrainSelection(
      { ...base, viewportFocusNdc: [0.5, 0] },
      adapter
    );
    expect(left.entries.map(({ id }) => id.x)).toEqual([0, 1]);
    expect(right.entries.map(({ id }) => id.x)).toEqual([1, 0]);
    expect(right.signature).not.toBe(left.signature);
    expect(right.viewportElevationSignature).toBe(
      left.viewportElevationSignature
    );
    expect(right.loadEntries).toHaveLength(initial.loadEntries.length);
    expect(
      buildTerrainSelection({ ...base, viewportFocusNdc: [0, 0] }, adapter)
    ).toEqual(initial);
  });

  it("unions disjoint perspective/orthographic cameras once and preserves receiver roles", () => {
    const perspective = new PerspectiveCamera(45, 1, 0.1, 3);
    perspective.position.set(2.5, 0, 1);
    const ortho = new OrthographicCamera(-0.6, 0.6, 0.6, -0.6, 0.1, 3);
    ortho.position.set(4.5, 0, 1);
    const bounds = (x: number) => ({
      west: x,
      east: x + 1,
      south: 0,
      north: 1,
    });
    const [ray, inspection] = snapshotTileCameraViews([
      {
        id: "rays",
        camera: perspective,
        viewport: [400, 400],
        errorTargetPixels: 2,
        role: TILE_CAMERA_ROLE.GEOMETRY,
      },
      {
        id: "inspection",
        camera: ortho,
        viewport: [400, 400],
        errorTargetPixels: 2,
        role: TILE_CAMERA_ROLE.RECEIVER,
      },
    ]);
    const base: TerrainSelectionInput = {
      ...input(),
      viewportBounds: bounds(0),
      origin: [0.5, 0.5, 0],
      meterScale: 1 / 360,
      minimumLevel: 3,
      maximumLevel: 3,
      unknownHeightRange: [0, 10],
      knownHeightRanges: {},
      source: {
        ...input().source,
        bounds: { ...bounds(0), east: 6 },
        minzoom: 3,
        maxzoom: 3,
      },
      cameraViews: [
        { ...ray, bounds: bounds(2) },
        { ...ray, id: "overlap", bounds: bounds(2) },
        { ...inspection, bounds: bounds(4) },
      ],
    };
    const ids = [0, 2, 4].map((x) => ({ level: 3, x, y: 0 }));
    const adapter = {
      getTileGridIdsForBounds: () => ids,
      getTileBounds: ({ x }: { x: number }) => bounds(x),
      getTileGeometricError: () => 0.01,
      getTileDataAvailable: () => true,
    };
    const selection = buildTerrainSelection(base, adapter);
    expect(selection.entries.map(({ id }) => id.x).sort()).toEqual([0, 2, 4]);
    const receivers = selection.viewportStages
      .at(-1)!
      .map(({ id }) => id.x)
      .sort();
    expect(receivers).toEqual([0, 4]);
    expect(
      new Set(
        selection.loadEntries.map(({ id }) => `${id.level}/${id.x}/${id.y}`)
      ).size
    ).toBe(selection.loadEntries.length);
    const remaining = buildTerrainSelection(
      { ...base, cameraViews: [base.cameraViews![0]] },
      adapter
    );
    expect(remaining.entries.map(({ id }) => id.x).sort()).toEqual([0, 2]);
    const rankedViews = base.cameraViews!.map((view) => ({
      ...view,
      priority: TILE_CAMERA_PRIORITY.SECONDARY as number,
    }));
    rankedViews[0] = {
      ...rankedViews[0],
      priority: TILE_CAMERA_PRIORITY.FOCUS,
    };
    const ranked = buildTerrainSelection(
      { ...base, cameraViews: rankedViews },
      adapter
    );
    expect(ranked.entries.map(({ id }) => id.x)).toEqual([2, 0, 4]);
    expect(ranked.entries.map(({ priority }) => priority)).toEqual([2, 1, 0]);
    expect(ranked.entries.filter(({ id }) => id.x === 2)).toHaveLength(1);
    rankedViews[0] = {
      ...rankedViews[0],
      priority: TILE_CAMERA_PRIORITY.SECONDARY,
    };
    rankedViews[2] = {
      ...rankedViews[2],
      priority: TILE_CAMERA_PRIORITY.FOCUS,
    };
    const switched = buildTerrainSelection(
      { ...base, cameraViews: rankedViews },
      adapter
    );
    expect(switched.entries.map(({ id }) => id.x)).toEqual([4, 0, 2]);
    expect(switched.signature).not.toBe(ranked.signature);
    expect(switched.loadEntries).toHaveLength(ranked.loadEntries.length);
  });

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
  it("selects an otherwise off-frustum tile through local bounds padding", () => {
    const base = input();
    const id = { level: 1, x: 0, y: 0 };
    const adapter = {
      getTileGridIdsForBounds: () => [id],
      getTileBounds: () => ({ west: 4, east: 5, south: -1, north: 0 }),
      getTileGeometricError: () => 0,
      getTileDataAvailable: () => true,
    };
    const unpadded = buildTerrainSelection(
      {
        ...base,
        viewportBounds: { west: 0, east: 1, south: 0, north: 1 },
        source: {
          ...base.source,
          bounds: { west: 0, east: 5, south: -1, north: 1 },
          minzoom: 1,
          maxzoom: 1,
        },
        origin: [0.5, 0.5, 0],
        meterScale: 1 / 360,
        minimumLevel: 1,
        maximumLevel: 1,
        knownHeightRanges: { "1/0/0": [0, 0] },
      },
      adapter
    );
    const padded = buildTerrainSelection(
      {
        ...base,
        viewportBounds: { west: 0, east: 1, south: 0, north: 1 },
        source: {
          ...base.source,
          bounds: { west: 0, east: 5, south: -1, north: 1 },
          minzoom: 1,
          maxzoom: 1,
        },
        origin: [0.5, 0.5, 0],
        meterScale: 1 / 360,
        boundsPaddingMeters: [2_000, 2_000, 2_000],
        minimumLevel: 1,
        maximumLevel: 1,
        knownHeightRanges: { "1/0/0": [0, 0] },
      },
      adapter
    );

    expect(unpadded.entries).toEqual([]);
    expect(padded.entries.map((entry) => entry.id)).toEqual([id]);
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
