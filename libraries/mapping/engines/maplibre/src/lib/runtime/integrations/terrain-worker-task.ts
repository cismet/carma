import { MercatorCoordinate } from "maplibre-gl";
import { BufferAttribute, BufferGeometry } from "three";
import { partitionNoDataTerrainGeometry } from "./terrain-no-data";
import {
  computeMeshVertexNormals,
  createProjectedTerrainTileGeometry,
} from "@carma-mapping/engines/three/primitives/core";
import {
  buildGridTile,
  decodeImage,
  type TerrainTile,
  type TerrainTileId,
} from "./raster-dem-tile";
import { createMercatorTerrainProjector } from "./mercator-terrain-projector";
import { readProjectedTerrainCacheRecord } from "./projected-terrain-cache-record";
import {
  executeTerrainBoundaryStitch,
  type TerrainStitchInput,
} from "./terrain-boundary-stitch";
import {
  buildTerrainSelection,
  type TerrainSelectionInput,
} from "../../core/terrain-selection";

export type TerrainWorkerTask =
  | { kind: "read-cache"; key: string }
  | { kind: "select"; input: TerrainSelectionInput }
  | {
      kind: "partition";
      positions: Float32Array;
      indices: Uint16Array | Uint32Array;
      heights: Float32Array;
      noDataHeightMeters: number;
    }
  | {
      kind: "stitch";
      inputs: TerrainStitchInput[];
      outputKeys?: string[];
      captureBoundaryState?: boolean;
      prepareShellKeys?: string[];
      probeOnly?: boolean;
    }
  | {
      kind: "decode";
      blob: Blob;
      id: TerrainTileId;
      segments: number;
      error: number;
    }
  | {
      kind: "project";
      tile: TerrainTile;
      origin: { x: number; y: number; z: number };
    };

export const executeTerrainWorkerTask = async (task: TerrainWorkerTask) => {
  if (task.kind === "read-cache")
    return {
      kind: "read-cache" as const,
      entry: await readProjectedTerrainCacheRecord(task.key),
    };
  if (task.kind === "select")
    return {
      kind: "select" as const,
      selection: buildTerrainSelection(task.input),
    };
  if (task.kind === "partition") {
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
      kind: "partition" as const,
      geometry: partition.geometry
        ? serializeTerrainGeometry(partition.geometry)
        : null,
      reliefVertexMask: partition.reliefVertexMask,
    };
  }
  if (task.kind === "stitch")
    return {
      kind: "stitch" as const,
      ...executeTerrainBoundaryStitch(task.inputs, task),
    };
  if (task.kind === "decode") {
    const raster = await decodeImage(task.blob);
    return {
      kind: "decode" as const,
      raster,
      tile: buildGridTile(task.id, raster, task.segments, task.error),
    };
  }
  const geometry = createProjectedTerrainTileGeometry({
    tile: task.tile,
    projectToWorld: createMercatorTerrainProjector(
      new MercatorCoordinate(task.origin.x, task.origin.y, task.origin.z)
    ),
  });
  return { kind: "project" as const, ...serializeTerrainGeometry(geometry) };
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
  result.kind === "read-cache"
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
    : result.kind === "select"
    ? []
    : result.kind === "partition"
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
    : result.kind === "stitch"
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
              shell.positions,
              shell.normals,
              shell.indices,
              ...Object.values(shell.boundaryEdges),
              ...Object.values(shell.boundaryBaseHeights),
            ].map((array) => array.buffer)
          ),
        ]),
      ] as ArrayBuffer[])
    : result.kind === "project"
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
