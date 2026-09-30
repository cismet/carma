import { prepareCachedEqualLevelTerrainShell } from "./terrain-edge-topology-cache";
import { MercatorCoordinate } from "maplibre-gl";
import { BufferAttribute, BufferGeometry } from "three";
import { partitionNoDataTerrainGeometry } from "./terrain-no-data";
import {
  computeMeshVertexNormals,
  createProjectedTerrainTileGeometry,
} from "@carma-mapping/engines/three/primitives/core";
import {
  buildErrorBoundedGridTile,
  buildGridTile,
  type DecodedRaster,
  type TerrainTile,
  type TerrainTileId,
} from "../../core/raster-dem-tile";
import { createMercatorTerrainProjector } from "./mercator-terrain-projector";
import { decodeImage } from "./decode-raster-dem-image";
import {
  readProjectedTerrainCacheRecord,
  writeProjectedTerrainCacheRecord,
  updateProjectedTerrainReadCost,
  calibrateProjectedTerrainCache,
  readTerrainHeightMetadata,
  writeTerrainHeightMetadata,
  type CachedProjectedTerrainTile,
} from "./projected-terrain-cache-record";
import {
  executeTerrainBoundaryStitch,
  type TerrainStitchInput,
} from "./terrain-boundary-stitch";
import { buildTerrainSelection } from "../../core/terrain-selection";
import type { TerrainSelectionInput } from "../../core/terrain-selection-types";
import { TERRAIN_WORKER_TASK_KIND } from "../../core/terrain-worker-protocol";

export type TerrainWorkerTask =
  | {
      kind: typeof TERRAIN_WORKER_TASK_KIND.READ_HEIGHT_METADATA;
      key: string;
      producerAssetUrl?: string;
    }
  | {
      kind: typeof TERRAIN_WORKER_TASK_KIND.WRITE_HEIGHT_METADATA;
      key: string;
      ranges: Float64Array;
      producerAssetUrl?: string;
    }
  | {
      kind: typeof TERRAIN_WORKER_TASK_KIND.READ_CACHE;
      key: string;
      producerAssetUrl?: string;
    }
  | {
      kind: typeof TERRAIN_WORKER_TASK_KIND.WRITE_CACHE;
      key: string;
      entry: CachedProjectedTerrainTile;
      bytes: number;
      recomputeMs?: number;
      producerAssetUrl?: string;
    }
  | {
      kind: typeof TERRAIN_WORKER_TASK_KIND.CACHE_COST;
      key: string;
      restoreMs: number;
      producerAssetUrl?: string;
    }
  | {
      kind: typeof TERRAIN_WORKER_TASK_KIND.CALIBRATE_CACHE;
      producerAssetUrl?: string;
    }
  | {
      kind: typeof TERRAIN_WORKER_TASK_KIND.SELECT;
      input: TerrainSelectionInput;
    }
  | {
      kind: typeof TERRAIN_WORKER_TASK_KIND.PARTITION;
      positions: Float32Array;
      indices: Uint16Array | Uint32Array;
      heights: Float32Array;
      noDataHeightMeters: number;
    }
  | {
      kind: typeof TERRAIN_WORKER_TASK_KIND.STITCH;
      sameLevelOnly?: boolean;
      prepareEqualLevelShells?: boolean;
      applyBoundaryStates?: Record<string, Float32Array>;
      inputs: TerrainStitchInput[];
      outputKeys?: string[];
      captureBoundaryState?: boolean;
      prepareShellKeys?: string[];
      probeOnly?: boolean;
      prepareOnly?: boolean;
    }
  | {
      kind: typeof TERRAIN_WORKER_TASK_KIND.DECODE;
      blob: Blob;
      id: TerrainTileId;
      segments: number;
      error: number;
      maximumMeshErrorMeters?: number;
      maximumMeshSegments?: number;
    }
  | {
      kind: typeof TERRAIN_WORKER_TASK_KIND.REMESH;
      raster: DecodedRaster;
      id: TerrainTileId;
      error: number;
      maximumMeshErrorMeters?: number;
      maximumMeshSegments?: number;
    }
  | {
      kind: typeof TERRAIN_WORKER_TASK_KIND.PROJECT;
      tile: TerrainTile;
      origin: { x: number; y: number; z: number };
    };

export const executeTerrainWorkerTask = async (
  task: TerrainWorkerTask,
  signal?: AbortSignal
) => {
  if (task.kind === TERRAIN_WORKER_TASK_KIND.READ_HEIGHT_METADATA)
    return {
      kind: task.kind,
      ranges: await readTerrainHeightMetadata(task.key, task.producerAssetUrl),
    };
  if (task.kind === TERRAIN_WORKER_TASK_KIND.WRITE_HEIGHT_METADATA)
    return {
      kind: task.kind,
      stored: await writeTerrainHeightMetadata(
        task.key,
        task.ranges,
        task.producerAssetUrl
      ),
    };
  if (task.kind === TERRAIN_WORKER_TASK_KIND.CALIBRATE_CACHE)
    return {
      kind: TERRAIN_WORKER_TASK_KIND.CALIBRATE_CACHE,
      calibrated: await calibrateProjectedTerrainCache(
        task.producerAssetUrl,
        signal
      ),
    };
  if (task.kind === TERRAIN_WORKER_TASK_KIND.WRITE_CACHE)
    return {
      kind: TERRAIN_WORKER_TASK_KIND.WRITE_CACHE,
      stored: await writeProjectedTerrainCacheRecord(
        task.key,
        task.entry,
        task.bytes,
        task.recomputeMs,
        task.producerAssetUrl
      ),
    };
  if (task.kind === TERRAIN_WORKER_TASK_KIND.CACHE_COST)
    return {
      kind: TERRAIN_WORKER_TASK_KIND.CACHE_COST,
      updated: await updateProjectedTerrainReadCost(
        task.key,
        task.restoreMs,
        task.producerAssetUrl
      ),
    };
  if (task.kind === TERRAIN_WORKER_TASK_KIND.READ_CACHE)
    return {
      kind: TERRAIN_WORKER_TASK_KIND.READ_CACHE,
      entry: await readProjectedTerrainCacheRecord(
        task.key,
        task.producerAssetUrl
      ),
    };
  if (task.kind === TERRAIN_WORKER_TASK_KIND.SELECT)
    return {
      kind: TERRAIN_WORKER_TASK_KIND.SELECT,
      selection: buildTerrainSelection(task.input),
    };
  if (task.kind === TERRAIN_WORKER_TASK_KIND.PARTITION) {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(task.positions, 3));
    geometry.setIndex(new BufferAttribute(task.indices, 1));
    const partition = partitionNoDataTerrainGeometry(
      geometry,
      task.heights,
      task.noDataHeightMeters
    );
    if (partition.geometry && !partition.geometry.getAttribute("normal"))
      computeMeshVertexNormals(partition.geometry);
    return {
      kind: TERRAIN_WORKER_TASK_KIND.PARTITION,
      geometry: partition.geometry
        ? serializeTerrainGeometry(partition.geometry)
        : null,
      reliefVertexMask: partition.reliefVertexMask,
    };
  }
  if (
    task.kind === TERRAIN_WORKER_TASK_KIND.STITCH &&
    task.prepareEqualLevelShells
  )
    return {
      kind: TERRAIN_WORKER_TASK_KIND.STITCH,
      updates: [] as ReturnType<typeof executeTerrainBoundaryStitch>["updates"],
      shells: await Promise.all(
        task.inputs.map(prepareCachedEqualLevelTerrainShell)
      ),
    };
  if (task.kind === TERRAIN_WORKER_TASK_KIND.STITCH)
    return {
      kind: TERRAIN_WORKER_TASK_KIND.STITCH,
      ...executeTerrainBoundaryStitch(task.inputs, task),
    };
  if (
    task.kind === TERRAIN_WORKER_TASK_KIND.DECODE ||
    task.kind === TERRAIN_WORKER_TASK_KIND.REMESH
  ) {
    // Decoding the image and meshing its raster are separate costs; the
    // diagnostics draw them as their own steps.
    const decodeStart = performance.now();
    const raster =
      task.kind === TERRAIN_WORKER_TASK_KIND.DECODE
        ? await decodeImage(task.blob)
        : task.raster;
    const meshStart = performance.now();
    const maximumSegments = task.maximumMeshSegments;
    // Explicit mobile baseline: allocate the smaller attribute grid as well as
    // fewer indices. Error-bounded desktop reduction retains native attributes.
    const tile =
      maximumSegments !== undefined &&
      Number.isFinite(maximumSegments) &&
      maximumSegments >= 2 &&
      maximumSegments < Math.max(raster.width, raster.height)
        ? buildGridTile(
            task.id,
            raster,
            Math.floor(maximumSegments),
            task.error
          )
        : buildErrorBoundedGridTile(
            task.id,
            raster,
            task.error,
            task.maximumMeshErrorMeters
          );
    return {
      kind: task.kind,
      raster,
      tile: {
        ...tile,
        timings: {
          decodeMs: meshStart - decodeStart,
          meshMs: performance.now() - meshStart,
        },
      },
    };
  }
  const geometry = createProjectedTerrainTileGeometry({
    tile: task.tile,
    projectToWorld: createMercatorTerrainProjector(
      new MercatorCoordinate(task.origin.x, task.origin.y, task.origin.z)
    ),
  });
  return {
    kind: TERRAIN_WORKER_TASK_KIND.PROJECT,
    ...serializeTerrainGeometry(geometry),
  };
};

const serializeTerrainGeometry = (geometry: BufferGeometry) => {
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  const result = {
    positions: geometry.getAttribute("position").array as Float32Array,
    normals: geometry.getAttribute("normal").array as Float32Array,
    indices: geometry.index!.array as Uint16Array | Uint32Array,
    box: {
      min: geometry.boundingBox!.min.toArray(),
      max: geometry.boundingBox!.max.toArray(),
    },
    sphere: {
      center: geometry.boundingSphere!.center.toArray(),
      radius: geometry.boundingSphere!.radius,
    },
  };
  geometry.dispose();
  return result;
};

export type TerrainWorkerResult = Awaited<
  ReturnType<typeof executeTerrainWorkerTask>
>;

export const terrainResultTransfers = (
  result: TerrainWorkerResult
): Transferable[] =>
  result.kind === TERRAIN_WORKER_TASK_KIND.READ_HEIGHT_METADATA
    ? result.ranges
      ? [result.ranges.buffer as ArrayBuffer]
      : []
    : result.kind === TERRAIN_WORKER_TASK_KIND.READ_CACHE
    ? result.entry
      ? [
          ...new Set([
            ...Object.values(result.entry.tile).flatMap((value) =>
              ArrayBuffer.isView(value) ? [value.buffer as ArrayBuffer] : []
            ),
            result.entry.reliefVertexMask.buffer as ArrayBuffer,
            ...(result.entry.geometry
              ? ([
                  result.entry.geometry.positions.buffer,
                  result.entry.geometry.normals.buffer,
                  result.entry.geometry.indices.buffer,
                ] as ArrayBuffer[])
              : []),
          ]),
        ]
      : []
    : result.kind === TERRAIN_WORKER_TASK_KIND.SELECT ||
      result.kind === TERRAIN_WORKER_TASK_KIND.WRITE_HEIGHT_METADATA ||
      result.kind === TERRAIN_WORKER_TASK_KIND.WRITE_CACHE ||
      result.kind === TERRAIN_WORKER_TASK_KIND.CACHE_COST ||
      result.kind === TERRAIN_WORKER_TASK_KIND.CALIBRATE_CACHE
    ? []
    : result.kind === TERRAIN_WORKER_TASK_KIND.PARTITION
    ? ([
        result.reliefVertexMask.buffer,
        ...(result.geometry
          ? [
              result.geometry.positions.buffer,
              result.geometry.normals.buffer,
              result.geometry.indices.buffer,
            ]
          : []),
      ] as ArrayBuffer[])
    : result.kind === TERRAIN_WORKER_TASK_KIND.STITCH
    ? ([
        ...new Set([
          ...result.updates.flatMap((update) => [
            update.positions.buffer,
            update.normals.buffer,
            update.indices.buffer,
            ...(update.boundaryState ? [update.boundaryState.buffer] : []),
          ]),
          ...(result.shells ?? []).flatMap((shell) =>
            [
              ...(shell.sourceIndices ? [shell.sourceIndices] : []),
              ...(shell.normalTargets ? [shell.normalTargets] : []),
              shell.positions,
              shell.normals,
              shell.indices,
              ...Object.values(shell.boundaryEdges),
              ...Object.values(shell.boundaryBaseHeights),
            ].map((array) => array.buffer)
          ),
        ]),
      ] as ArrayBuffer[])
    : result.kind === TERRAIN_WORKER_TASK_KIND.PROJECT
    ? ([
        result.positions.buffer,
        result.normals.buffer,
        result.indices.buffer,
      ] as ArrayBuffer[])
    : ([
        result.raster.pixels.buffer,
        ...[
          result.tile.u,
          result.tile.v,
          result.tile.heightMeters,
          result.tile.indices,
          result.tile.westIndices,
          result.tile.eastIndices,
          result.tile.northIndices,
          result.tile.southIndices,
        ].map((array) => array.buffer),
      ] as ArrayBuffer[]);
