import {
  BufferGeometry,
  Camera,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  PerspectiveCamera,
  Vector2,
  Vector3,
} from "three";
import { describe, expect, it, vi } from "vitest";
import { getTileBounds } from "../../core/raster-dem-tile";
import type { TerrainTileId } from "../../core/raster-dem-tile";
import * as terrainWorkers from "./terrain-worker-client";
import {
  acquireRasterDemTerrainTileSource,
  createProjectedTerrainTileGeometry,
  registerSharedThreeTerrainSampler,
  terrainConfig,
  installRasterDemTerrainRuntimeFixture,
} from "./raster-dem-terrain-runtime.test-support";
import { buildRasterDemTerrainRuntime } from "./raster-dem-terrain-runtime";

describe("buildRasterDemTerrainRuntime mixed-LOD seams", () => {
  installRasterDemTerrainRuntimeFixture();

  it("interpolates coarse neighbor normals", async () => {
    let fineBoundaryNormalBeforeSmoothing: Vector3 | null = null;
    const run = terrainWorkers.runTerrainWorkerTask;
    let releaseStitch: (() => void) | undefined;
    const stitchGate = new Promise<void>((resolve) => {
      releaseStitch = resolve;
    });
    let stitchStarted = false;
    const worker = vi
      .spyOn(terrainWorkers, "runTerrainWorkerTask")
      .mockImplementation(async (task, signal) => {
        if (
          task.kind === "stitch" &&
          !task.sameLevelOnly &&
          !task.prepareEqualLevelShells
        ) {
          stitchStarted = true;
          await stitchGate;
        }
        return run(task, signal);
      });

    const coarseId = { level: 10, x: 532, y: 218 };
    const fineParentId = { level: 10, x: 533, y: 218 };
    const fineId = { level: 11, x: 1066, y: 436 };
    const isFineTile = (id: TerrainTileId) =>
      id.level === fineId.level && id.x === fineId.x && id.y === fineId.y;
    createProjectedTerrainTileGeometry.mockImplementation(({ tile }) => {
      const id = tile.id as TerrainTileId;
      const fine = isFineTile(id);
      const width = id.level === 10 ? 1 : 0.5;
      const west = id.level === 10 ? id.x - 532 : 1 + (id.x - 1066) * width;
      const north = id.level === 10 ? 0 : -(id.y - 436);
      const geometry = new BufferGeometry();
      geometry.setAttribute(
        "position",
        new Float32BufferAttribute(
          fine
            ? [
                west,
                2,
                north,
                west,
                2,
                north - 0.5,
                west,
                2,
                north - 1,
                west + width,
                1,
                north,
                west + width,
                1,
                north - 0.5,
                west + width,
                1,
                north - 1,
              ]
            : [
                west,
                0,
                north,
                west,
                0,
                north - (id.level === 10 ? 2 : 1),
                west + width,
                0,
                north,
                west + width,
                0,
                north - (id.level === 10 ? 2 : 1),
              ],
          3
        )
      );
      geometry.setIndex(
        fine ? [0, 3, 1, 1, 3, 4, 1, 4, 2, 2, 4, 5] : [0, 2, 1, 1, 2, 3]
      );
      geometry.computeVertexNormals();
      if (fine) {
        const normal = geometry.getAttribute("normal");
        fineBoundaryNormalBeforeSmoothing = new Vector3(
          normal.getX(1),
          normal.getY(1),
          normal.getZ(1)
        );
      }
      return geometry;
    });
    const source = {
      requestTile: vi.fn(async (id) => ({
        id,
        heightMeters: isFineTile(id)
          ? new Float32Array([456])
          : new Float32Array([100]),
        westIndices: isFineTile(id)
          ? new Uint32Array([0, 1, 2])
          : new Uint32Array(),
        southIndices: new Uint32Array(),
        eastIndices:
          id.level === coarseId.level && id.x === coarseId.x
            ? new Uint32Array([2, 3])
            : new Uint32Array(),
        northIndices: new Uint32Array(),
      })),
      getTileGridIdsForBounds: vi.fn(() => [coarseId, fineParentId]),
      getTileBounds: vi.fn((id: TerrainTileId) => {
        const scale = 2 ** (id.level - 10);
        const west = 7 + (id.x / scale - 532) * 0.2;
        const north = 51.3 - (id.y / scale - 218) * 0.3;
        return {
          west,
          east: west + 0.2 / scale,
          south: north - 0.3 / scale,
          north,
        };
      }),
      getLevelMaximumGeometricError: vi.fn((level) =>
        level === 10 ? 0.01 : 0.00001
      ),
      getTileDataAvailable: vi.fn(() => true),
      sampleHeight: vi.fn(() => 150),
      trimCache: vi.fn(),
      release: vi.fn(),
    };
    acquireRasterDemTerrainTileSource.mockResolvedValue(source);
    const runtime = buildRasterDemTerrainRuntime(
      "mixed-lod-terrain",
      terrainConfig("https://example.test/mixed-lod-terrain"),
      [7.3, 51.25],
      { minimumLevel: 10, maximumLevel: 11 }
    );
    const map = {
      getBounds: vi.fn(() => ({
        getWest: () => 7,
        getSouth: () => 51,
        getEast: () => 7.4,
        getNorth: () => 51.3,
      })),
      triggerRepaint: vi.fn(),
    };
    runtime.onAdd?.(map as never);
    await vi.waitFor(() => {
      expect(registerSharedThreeTerrainSampler).toHaveBeenCalled();
    });
    const lodCamera = new PerspectiveCamera(60, 1, 1, 10_000);
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

    await expect(runtime.ready).resolves.toBe(true);
    await vi.waitFor(() =>
      expect(
        runtime.root.children.some((child) =>
          child.name.endsWith("11/1066/436")
        )
      ).toBe(true)
    );
    const fineMesh = (
      runtime.root.children.find((child) =>
        child.name.endsWith("11/1066/436")
      ) as Group
    ).children[0] as Mesh;
    await vi.waitFor(() => expect(source.trimCache).toHaveBeenCalled());
    await vi.waitFor(() => expect(stitchStarted).toBe(true));
    expect(runtime.getRequestDemand?.()).toBe(0);
    expect(fineMesh.parent!.visible).toBe(true);
    // Even an indefinitely delayed stitch cannot gate detail or readiness.
    releaseStitch!();
    worker.mockRestore();
    // Wait only here for the optional correction, not for terrain publication.
    await vi.waitFor(() =>
      expect(fineMesh.geometry.getAttribute("position").getY(0)).toBe(0)
    );
    const smoothedNormal = fineMesh.geometry.getAttribute("normal");
    const stitchedPosition = fineMesh.geometry.getAttribute("position");

    expect(fineBoundaryNormalBeforeSmoothing).not.toBeNull();
    expect(stitchedPosition.getY(0)).toBe(0);
    expect(stitchedPosition.getY(1)).toBe(0);
    expect(stitchedPosition.getY(2)).toBe(0);
    expect(smoothedNormal.getY(1)).toBeGreaterThan(
      fineBoundaryNormalBeforeSmoothing!.y + 0.1
    );
    expect(fineMesh.parent!.visible).toBe(true);
    const visible = runtime.root.children.filter((child) => child.visible);
    expect(visible).toHaveLength(5);
    expect(visible.some((child) => child.name.endsWith("10/532/218"))).toBe(
      true
    );
    for (const x of [1066, 1067])
      for (const y of [436, 437])
        expect(
          visible.some((child) => child.name.endsWith(`11/${x}/${y}`))
        ).toBe(true);

    runtime.dispose();
  });
});
