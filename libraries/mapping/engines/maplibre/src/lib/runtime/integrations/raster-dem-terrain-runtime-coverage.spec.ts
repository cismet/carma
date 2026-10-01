import { NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN } from "@carma-commons/resources";
import { Camera, Matrix4, PerspectiveCamera, Vector2, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import { getTileBounds } from "../../core/raster-dem-tile";
import type { TerrainTile, TerrainTileId } from "../../core/raster-dem-tile";
import {
  acquireRasterDemTerrainTileSource,
  registerSharedThreeTerrainSampler,
  terrainConfig,
  installRasterDemTerrainRuntimeFixture,
} from "./raster-dem-terrain-runtime.test-support";
import { buildRasterDemTerrainRuntime } from "./raster-dem-terrain-runtime";

describe("buildRasterDemTerrainRuntime coverage refinement", () => {
  installRasterDemTerrainRuntimeFixture();

  it.each([
    { sourceMaxzoom: 18, maximumLevel: 14, finalLevel: 14 },
    {
      sourceMaxzoom: NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN.maxzoom,
      maximumLevel: undefined,
      finalLevel: 16,
    },
    { sourceMaxzoom: 15, maximumLevel: undefined, finalLevel: 15 },
    { sourceMaxzoom: 16, maximumLevel: 20, finalLevel: 16 },
  ])(
    "publishes complete coarse coverage before each refinement up to $finalLevel (source $sourceMaxzoom, limit $maximumLevel)",
    async ({ sourceMaxzoom, maximumLevel, finalLevel }) => {
      const visibleIds = () =>
        runtime.root.children
          .filter((child) => child.visible)
          .map((child) => child.name.match(/source:(\d+)\/(\d+)\/(\d+)$/)!)
          .map((match) => ({
            level: Number(match[1]),
            x: Number(match[2]),
            y: Number(match[3]),
          }));
      const expectCompleteCut = () => {
        const ids = visibleIds();
        // A disjoint dyadic cut has exactly one root's area, at every stage.
        expect(ids.reduce((area, id) => area + 4 ** (10 - id.level), 0)).toBe(
          1
        );
        for (const id of ids)
          expect(
            ids.some(
              (other) =>
                other !== id &&
                other.level <= id.level &&
                Math.floor(id.x / 2 ** (id.level - other.level)) === other.x &&
                Math.floor(id.y / 2 ** (id.level - other.level)) === other.y
            )
          ).toBe(false);
      };
      const source = {
        requestTile: vi.fn(async (id: TerrainTileId): Promise<TerrainTile> => {
          if (id.level > 11) {
            expectCompleteCut();
            expect(
              visibleIds().some(
                (ancestor) =>
                  ancestor.level < id.level &&
                  Math.floor(id.x / 2 ** (id.level - ancestor.level)) ===
                    ancestor.x &&
                  Math.floor(id.y / 2 ** (id.level - ancestor.level)) ===
                    ancestor.y
              )
            ).toBe(true);
          }
          return {
            id,
            bounds: source.getTileBounds(id),
            u: new Float32Array([0, 0, 1, 1]),
            v: new Float32Array([0, 1, 0, 1]),
            heightMeters: new Float32Array([100, 100, 100, 100]),
            indices: new Uint32Array([0, 2, 1, 1, 2, 3]),
            byteLength: 256,
            westIndices: new Uint32Array(),
            southIndices: new Uint32Array(),
            eastIndices: new Uint32Array(),
            northIndices: new Uint32Array(),
          };
        }),
        getTileGridIdsForBounds: vi.fn(() => [{ level: 10, x: 0, y: 0 }]),
        getTileBounds: vi.fn((id: TerrainTileId) => {
          const width = 0.2 / 2 ** (id.level - 10);
          const west = 7.1 + id.x * width;
          const north = 51.35 - id.y * width;
          return { west, east: west + width, south: north - width, north };
        }),
        getLevelMaximumGeometricError: vi.fn(
          (level) => 0.1 / 2 ** (level - 10)
        ),
        getTileDataAvailable: vi.fn(() => true),
        sampleHeight: vi.fn(),
        trimCache: vi.fn(),
        release: vi.fn(),
      };
      acquireRasterDemTerrainTileSource.mockResolvedValue(source);
      const runtime = buildRasterDemTerrainRuntime(
        "skip-ancestors",
        {
          ...terrainConfig("https://example.test/skip-ancestors"),
          maxzoom: sourceMaxzoom,
        },
        [7.101, 51.349],
        {
          minimumLevel: 10,
          maximumLevel,
          errorTargetPixels: 0.5,
          maxCachedMeshes: 1,
        }
      );
      const map = {
        getBounds: () => ({
          getWest: () => 7.1005,
          getSouth: () => 51.3485,
          getEast: () => 7.1015,
          getNorth: () => 51.3495,
        }),
        triggerRepaint: vi.fn(),
      };
      runtime.onAdd?.(map as never);
      await vi.waitFor(() =>
        expect(registerSharedThreeTerrainSampler).toHaveBeenCalled()
      );
      const lodCamera = new PerspectiveCamera(60, 1, 1, 100_000);
      lodCamera.position.set(0, 1000, 0);
      runtime.update({
        map: map as never,
        renderCamera: new Camera(),
        lodCamera,
        lookTarget: new Vector3(),
        viewport: new Vector2(1000, 1000),
        localFrame: {
          lngLat: [7.15, 51.25] as const,
          revision: 1,
          sceneFromLocal: new Matrix4(),
          sceneFromLocalRotation: new Matrix4(),
          referenceLngLat: [7.15, 51.25] as const,
          sceneFromLocalReference: new Matrix4(),
          referenceToCurrent: new Matrix4(),
          currentToReference: new Matrix4(),
        },
      });
      await runtime.ready;
      await vi.waitFor(() => expect(source.trimCache).toHaveBeenCalled());
      const requestedIds = source.requestTile.mock.calls.map(([id]) => id);
      // The bounded first-coverage stage may start with at most four tiles;
      // once published, every deeper stage must retain full root coverage.
      expect(Math.min(...requestedIds.map(({ level }) => level))).toBe(11);
      expectCompleteCut();
      const expectedFinalCut = [{ level: finalLevel, x: 0, y: 0 }];
      for (let level = 11; level <= finalLevel; level += 1) {
        // Only the focus branch refines. Its three support siblings remain at
        // each level, even when a useful preview skips the branch's parent LOD.
        expectedFinalCut.push(
          { level, x: 1, y: 0 },
          { level, x: 0, y: 1 },
          { level, x: 1, y: 1 }
        );
      }
      const idKey = ({ level, x, y }: TerrainTileId) => `${level}/${x}/${y}`;
      expect(visibleIds().map(idKey).sort()).toEqual(
        expectedFinalCut.map(idKey).sort()
      );
      expect(new Set(requestedIds.map(idKey)).size).toBe(requestedIds.length);
      expect(Math.max(...requestedIds.map(({ level }) => level))).toBe(
        finalLevel
      );
      expect(Math.max(...visibleIds().map(({ level }) => level))).toBe(
        finalLevel
      );
      // A tiny optional cache keeps the complete published cut, but hidden
      // preview ancestors must lose preparation protection after publication.
      expect(runtime.getTerrainCacheStats().cachedMeshes).toBe(
        visibleIds().length
      );
      runtime.dispose();
    }
  );

  it.each([true, false])(
    "publishes a parent only within 16 px, retains detail on pan (within target: %s)",
    async (withinInitialTarget) => {
      const parentId = { level: 10, x: 532, y: 218 };
      let resolveNeighbor = () => undefined;
      const neighborReady = new Promise<void>((resolve) => {
        resolveNeighbor = resolve;
      });
      let resolveChildren = () => undefined;
      const childrenReady = new Promise<void>((resolve) => {
        resolveChildren = resolve;
      });
      const createTile = (id: typeof parentId) => ({
        id,
        bounds: { west: 7, south: 51, east: 7.4, north: 51.4 },
        heightMeters: new Float32Array([100]),
        westIndices: new Uint32Array(),
        southIndices: new Uint32Array(),
        eastIndices: new Uint32Array(),
        northIndices: new Uint32Array(),
      });
      const source = {
        requestTile: vi.fn(async (id: typeof parentId) => {
          if (id.level > parentId.level) await childrenReady;
          if (id.level > parentId.level && id.x >= 1066) await neighborReady;
          return createTile(id);
        }),
        getTileGridIdsForBounds: vi.fn(() => [parentId]),
        getTileBounds: vi.fn((id: typeof parentId) => {
          if (id.level === parentId.level) {
            return { west: 7, south: 51, east: 7.4, north: 51.4 };
          }
          const west = id.x % 2 === 0 ? 7 : 7.2;
          const north = id.y % 2 === 0 ? 51.4 : 51.2;
          return { west, south: north - 0.2, east: west + 0.2, north };
        }),
        getLevelMaximumGeometricError: vi.fn(() =>
          withinInitialTarget ? 1 : 1_000_000
        ),
        getTileDataAvailable: vi.fn(() => true),
        sampleHeight: vi.fn(),
        trimCache: vi.fn(),
        release: vi.fn(),
      };
      acquireRasterDemTerrainTileSource.mockResolvedValue(source);
      const runtime = buildRasterDemTerrainRuntime(
        "progressive-terrain",
        terrainConfig("https://example.test/progressive-terrain"),
        [7.2, 51.2],
        {
          minimumLevel: 10,
          maximumLevel: 11,
          errorTargetPixels: 0.001,
          heightRangeMeters: [0, 200],
        }
      );
      const map = {
        getBounds: vi.fn(() => ({
          getWest: () => 7,
          getSouth: () => 51,
          getEast: () => 7.4,
          getNorth: () => 51.4,
        })),
        triggerRepaint: vi.fn(),
      };
      runtime.onAdd?.(map as never);
      await vi.waitFor(() => {
        expect(registerSharedThreeTerrainSampler).toHaveBeenCalled();
      });
      const lodCamera = new PerspectiveCamera(60, 1, 1, 100_000);
      lodCamera.position.set(0, 1_000, 0);
      runtime.update({
        map: map as never,
        renderCamera: new Camera(),
        lodCamera,
        lookTarget: new Vector3(),
        viewport: new Vector2(1_000, 1_000),
        localFrame: {
          lngLat: [7.15, 51.25] as const,
          revision: 1,
          sceneFromLocal: new Matrix4(),
          sceneFromLocalRotation: new Matrix4(),
          referenceLngLat: [7.15, 51.25] as const,
          sceneFromLocalReference: new Matrix4(),
          referenceToCurrent: new Matrix4(),
          currentToReference: new Matrix4(),
        },
      });

      if (withinInitialTarget) await expect(runtime.ready).resolves.toBe(true);
      else
        await vi.waitFor(() => expect(source.requestTile).toHaveBeenCalled());
      const parentNode = runtime.root.children.find((child) =>
        child.name.includes("source:10/532/218")
      );
      if (withinInitialTarget) expect(parentNode?.visible).toBe(true);
      else
        expect(
          source.requestTile.mock.calls.map(([id]) => id)
        ).not.toContainEqual(parentId);

      resolveChildren();
      await expect(runtime.ready).resolves.toBe(true);
      await vi.waitFor(() => {
        expect(parentNode?.visible ?? false).toBe(false);
        expect(
          runtime.root.children.filter(
            (child) => child.visible && child.name.includes("source:11/")
          )
        ).toHaveLength(4);
      });

      // A pan adds another root whose children are still loading. The cached
      // coarse stage must not replace the already displayed detailed children.
      source.getTileGridIdsForBounds.mockReturnValue([
        parentId,
        { level: 10, x: 533, y: 218 },
      ]);
      lodCamera.position.x += 100;
      runtime.update({
        map: map as never,
        renderCamera: new Camera(),
        lodCamera,
        lookTarget: new Vector3(),
        viewport: new Vector2(1_000, 1_000),
        localFrame: {
          lngLat: [7.15, 51.25] as const,
          revision: 1,
          sceneFromLocal: new Matrix4(),
          sceneFromLocalRotation: new Matrix4(),
          referenceLngLat: [7.15, 51.25] as const,
          sceneFromLocalReference: new Matrix4(),
          referenceToCurrent: new Matrix4(),
          currentToReference: new Matrix4(),
        },
      });
      await vi.waitFor(() => {
        expect(
          source.requestTile.mock.calls.some(
            ([id]) => id.level === 11 && id.x >= 1066
          )
        ).toBe(true);
      });
      expect(parentNode?.visible ?? false).toBe(false);
      expect(
        runtime.root.children.filter(
          (child) => child.visible && child.name.includes("source:11/")
        )
      ).toHaveLength(4);
      if (withinInitialTarget) {
        // New pan coverage is published while its fine children are delayed;
        // the already visible fine neighbor must not regress to its parent.
        expect(
          runtime.root.children.find((child) =>
            child.name.includes("source:10/533/218")
          )?.visible
        ).toBe(true);
      }
      resolveNeighbor();
      await vi.waitFor(() => {
        expect(
          runtime.root.children.filter(
            (child) => child.visible && child.name.includes("source:11/")
          )
        ).toHaveLength(8);
      });

      runtime.dispose();
    }
  );
});
