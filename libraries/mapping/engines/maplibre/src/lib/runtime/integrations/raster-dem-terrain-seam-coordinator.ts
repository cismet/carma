import { Box3, BufferAttribute, Sphere, Vector3 } from "three";

import { getWorkerProbeLimit } from "@carma-commons/worker-scaling";

import {
  runBatchedTerrainBoundaryStitch,
  type TerrainBoundaryStitchState,
} from "./terrain-boundary-stitch-batching";
import type { TerrainSeamMeshRecord } from "./raster-dem-terrain-equal-level-seams";
import { TERRAIN_WORKER_TASK_KIND } from "../../core/terrain-worker-protocol";
import { runTerrainWorkerTask } from "./terrain-worker-client";
import type { TerrainWorkerResult } from "./terrain-worker-task";

type TerrainSeamCoordinatorOptions = Readonly<{
  meshes: ReadonlyMap<string, TerrainSeamMeshRecord>;
  signal: AbortSignal;
  getActiveMeshKeys: () => ReadonlySet<string>;
  getSelectionGeneration: () => number;
  isDisposed: () => boolean;
  isLoading: () => boolean;
  isSelectionPending: () => boolean;
  hasPendingMeshes: () => boolean;
  isMapMoving: () => boolean | undefined;
  admitRetainedBytes?: (additionalBytes: number) => boolean;
  onChanged: () => void;
  onError?: (error: unknown) => void;
}>;

/** Optional mixed-LOD seam jobs own their cancellation and solved shell state. */
export const createRasterDemTerrainSeamCoordinator = ({
  meshes,
  signal,
  getActiveMeshKeys,
  getSelectionGeneration,
  isDisposed,
  isLoading,
  isSelectionPending,
  hasPendingMeshes,
  isMapMoving,
  admitRetainedBytes = () => true,
  onChanged,
  onError,
}: TerrainSeamCoordinatorOptions) => {
  let stitchedActiveSignature = "";
  let stitchedBoundaryState: TerrainBoundaryStitchState = new Map();
  signal.addEventListener(
    "abort",
    () => {
      stitchedBoundaryState = new Map();
    },
    { once: true }
  );
  const shellBuffers = (shell: TerrainSeamMeshRecord["equalLevelShell"]) =>
    shell
      ? [
          shell.positions,
          shell.normals,
          shell.indices,
          shell.sourceIndices,
          shell.normalTargets,
          ...Object.values(shell.boundaryEdges),
          ...Object.values(shell.boundaryBaseHeights),
        ]
      : [];
  const immutableBuffers = (record: TerrainSeamMeshRecord) =>
    new Set(
      [
        record.stitchBase?.positions,
        record.stitchBase?.normals,
        record.stitchBase?.indices,
        ...Object.values(record.boundaryEdges),
        ...Object.values(record.boundaryBaseHeights),
        ...shellBuffers(record.equalLevelShell),
      ].flatMap((array) => (array ? [array.buffer] : []))
    );
  const stateRetainedBytes = (state: TerrainBoundaryStitchState) => {
    const meshBuffers = new Set<ArrayBufferLike>();
    for (const record of meshes.values()) {
      for (const buffer of immutableBuffers(record)) meshBuffers.add(buffer);
      const geometry = record.reliefMesh?.geometry;
      for (const attribute of [
        ...Object.values(geometry?.attributes ?? {}),
        geometry?.index,
      ])
        if (attribute && "array" in attribute)
          meshBuffers.add(attribute.array.buffer);
    }
    const buffers = new Set<ArrayBufferLike>();
    for (const entry of state.values())
      for (const array of [
        ...shellBuffers(entry.base),
        ...shellBuffers(entry.shell),
        entry.boundaryState,
      ])
        if (array && !meshBuffers.has(array.buffer)) buffers.add(array.buffer);
    return [...buffers].reduce((sum, buffer) => sum + buffer.byteLength, 0);
  };
  let pendingStitch: {
    signature: string;
    controller: AbortController;
    result: Promise<{
      result: TerrainWorkerResult;
      state: TerrainBoundaryStitchState;
    }>;
  } | null = null;
  const smoothActiveBoundaryNormals = async (
    activeKeys: ReadonlySet<string>,
    generation: number,
    isCurrentPublication: () => boolean
  ) => {
    const signature = [...activeKeys].sort().join(";");
    if (signature === stitchedActiveSignature) {
      pendingStitch?.controller.abort();
      pendingStitch = null;
      return false;
    }
    if (pendingStitch?.signature !== signature) {
      // Retain tile preparation across pans, but never queue obsolete seam passes.
      pendingStitch?.controller.abort();
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal.addEventListener("abort", abort, { once: true });
      const inputs = [...activeKeys].flatMap((key) => {
        const record = meshes.get(key);
        const geometry = record?.reliefMesh?.geometry;
        if (!record?.stitchBase || !geometry) return [];
        return [
          {
            key,
            id: record.id,
            ...record.stitchBase,
            boundaryEdges: record.boundaryEdges,
            boundaryBaseHeights: record.boundaryBaseHeights,
          },
        ];
      });
      pendingStitch = {
        signature,
        controller,
        result: (async () => {
          const stitched = await runBatchedTerrainBoundaryStitch(
            inputs,
            stitchedBoundaryState,
            async (batch, stitchOptions) => {
              const result = await runTerrainWorkerTask(
                {
                  kind: TERRAIN_WORKER_TASK_KIND.STITCH,
                  inputs: batch,
                  ...stitchOptions,
                },
                controller.signal
              );
              if (result.kind !== TERRAIN_WORKER_TASK_KIND.STITCH)
                throw new Error("Unexpected terrain stitching result");
              return result;
            },
            {
              signal: controller.signal,
              concurrency: getWorkerProbeLimit(
                typeof navigator === "undefined"
                  ? 4
                  : navigator.hardwareConcurrency
              ),
              // The general mixed-LOD solver also changes equal-level junction
              // normals. Publish its whole cut atomically; a subset would undo
              // equality on one side of a neighbouring same-level seam.
              forceOutput: true,
            }
          );
          return {
            result: {
              kind: TERRAIN_WORKER_TASK_KIND.STITCH,
              updates: stitched.updates,
            },
            state: stitched.state,
          };
        })().finally(() => signal.removeEventListener("abort", abort)),
      };
    }
    const job = pendingStitch;
    let completion: Awaited<typeof job.result>;
    try {
      completion = await job.result;
    } catch (error) {
      if (job.controller.signal.aborted) return;
      throw error;
    } finally {
      if (pendingStitch === job) pendingStitch = null;
    }
    const { result } = completion;
    if (result.kind !== TERRAIN_WORKER_TASK_KIND.STITCH)
      throw new Error("Unexpected terrain stitching result");
    if (
      isDisposed() ||
      job.controller.signal.aborted ||
      generation !== getSelectionGeneration() ||
      !isCurrentPublication()
    )
      return;
    // Check the complete replacement before touching any existing GPU handle.
    // Pristine bases remain retained when a stitched array replaces a borrowed view.
    let additionalBytes = Math.max(
      0,
      stateRetainedBytes(completion.state) -
        stateRetainedBytes(stitchedBoundaryState)
    );
    for (const update of result.updates) {
      const record = meshes.get(update.key);
      const geometry = record?.reliefMesh?.geometry;
      if (!record || !geometry) continue;
      const immutable = immutableBuffers(record);
      const currentArrays = [
        (geometry.getAttribute("position") as BufferAttribute).array,
        (geometry.getAttribute("normal") as BufferAttribute).array,
        geometry.index!.array,
      ];
      const nextArrays = [update.positions, update.normals, update.indices];
      const ownedCpuBytes = (arrays: typeof currentArrays) =>
        [
          ...new Set(
            arrays
              .map((array) => array.buffer)
              .filter((buffer) => !immutable.has(buffer))
          ),
        ].reduce((sum, buffer) => sum + buffer.byteLength, 0);
      additionalBytes +=
        ownedCpuBytes(nextArrays) -
        ownedCpuBytes(currentArrays) +
        nextArrays.reduce((sum, array) => sum + array.byteLength, 0) -
        currentArrays.reduce((sum, array) => sum + array.byteLength, 0);
    }
    if (!admitRetainedBytes(Math.max(0, additionalBytes))) return false;
    for (const update of result.updates) {
      const record = meshes.get(update.key);
      if (record) record.equalLevelSignature = undefined;
      const geometry = meshes.get(update.key)?.reliefMesh?.geometry;
      if (!geometry) continue;
      const position = geometry.getAttribute("position") as BufferAttribute;
      const normal = geometry.getAttribute("normal") as BufferAttribute;
      const index = geometry.getIndex();
      const sameLayout =
        position.array.length === update.positions.length &&
        normal.array.length === update.normals.length &&
        index?.array.length === update.indices.length &&
        index.array.constructor === update.indices.constructor;
      if (sameLayout) {
        // Keep Three's GPU buffer handles. Worker results own these arrays, so
        // replacing CPU storage needs no extra copy or allocation on this thread.
        position.array = update.positions;
        normal.array = update.normals;
        index.array = update.indices;
        position.clearUpdateRanges();
        normal.clearUpdateRanges();
        index.clearUpdateRanges();
        position.needsUpdate = normal.needsUpdate = index.needsUpdate = true;
      } else {
        // setAttribute alone drops the old handles without deleting their GL
        // buffers. Dispose BEFORE changing topology; Three reuploads on demand.
        geometry.dispose();
        geometry.setAttribute(
          "position",
          new BufferAttribute(update.positions, 3)
        );
        geometry.setAttribute("normal", new BufferAttribute(update.normals, 3));
        geometry.setIndex(new BufferAttribute(update.indices, 1));
      }
      geometry.boundingBox = new Box3(
        new Vector3().fromArray(update.box.min),
        new Vector3().fromArray(update.box.max)
      );
      geometry.boundingSphere = new Sphere(
        new Vector3().fromArray(update.sphere.center),
        update.sphere.radius
      );
    }

    stitchedBoundaryState = completion.state;
    stitchedActiveSignature = signature;
    return result.updates.length > 0;
  };

  let idleStitchTimer: ReturnType<typeof setTimeout> | null = null;
  const cancelIdleStitch = () => {
    if (idleStitchTimer !== null) clearTimeout(idleStitchTimer);
    idleStitchTimer = null;
    pendingStitch?.controller.abort();
    pendingStitch = null;
  };
  const scheduleIdleStitch = () => {
    cancelIdleStitch();
    if (isDisposed()) return;
    idleStitchTimer = setTimeout(() => {
      idleStitchTimer = null;
      if (isDisposed()) return;
      if (
        isLoading() ||
        isSelectionPending() ||
        hasPendingMeshes() ||
        isMapMoving()
      ) {
        scheduleIdleStitch();
        return;
      }
      const keys = getActiveMeshKeys();
      // Same-LOD terrain keeps its native edges; only mixed-LOD transitions
      // justify optional geometry work. Detail loading always has priority.
      const levels = new Set([...keys].map((key) => meshes.get(key)?.id.level));
      if (levels.size < 2) return;
      const generation = getSelectionGeneration();
      const current = () =>
        !isDisposed() &&
        generation === getSelectionGeneration() &&
        keys === getActiveMeshKeys();
      void smoothActiveBoundaryNormals(keys, generation, current)
        .then((changed) => {
          if (!current() || !changed) return;
          onChanged();
        })
        .catch((error) => {
          // Optional seam refinement must never revoke published coverage or
          // restart foreground downloads. A later settled cut can try again.
          if (current()) onError?.(error);
        });
    }, 500);
  };

  return {
    cancelIdleStitch,
    scheduleIdleStitch,
    getRetainedBytes: () => stateRetainedBytes(stitchedBoundaryState),
    abortPendingStitch: () => pendingStitch?.controller.abort(),
  };
};
