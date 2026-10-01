import { createWorkerThroughputMonitor } from "@carma-commons/worker-scaling";
import { TERRAIN_WORKER_TASK_KIND } from "../../core/terrain-worker-protocol";
import type { TerrainWorkerTask } from "./terrain-worker-task";

// Work units are input samples/vertices, not task count or per-worker latency.
// The controller rejects comparisons whose task-kind mixture changes materially.
export const getTerrainTaskWork = (task: TerrainWorkerTask): number => {
  switch (task.kind) {
    case TERRAIN_WORKER_TASK_KIND.READ_CACHE:
    case TERRAIN_WORKER_TASK_KIND.READ_HEIGHT_METADATA:
    case TERRAIN_WORKER_TASK_KIND.WRITE_HEIGHT_METADATA:
    case TERRAIN_WORKER_TASK_KIND.WRITE_CACHE:
    case TERRAIN_WORKER_TASK_KIND.CACHE_COST:
    case TERRAIN_WORKER_TASK_KIND.CALIBRATE_CACHE:
      // Storage service time is not comparable with geometry work throughput.
      return 0;
    case TERRAIN_WORKER_TASK_KIND.SELECT:
      return task.input.source.maxzoom - task.input.source.minzoom + 1;
    case TERRAIN_WORKER_TASK_KIND.DECODE:
      return (task.segments + 2) ** 2;
    case TERRAIN_WORKER_TASK_KIND.REMESH:
      return (task.raster.width + 2) * (task.raster.height + 2);
    case TERRAIN_WORKER_TASK_KIND.PROJECT:
      return task.tile.heightMeters.length;
    case TERRAIN_WORKER_TASK_KIND.PROJECT_ECEF:
      return task.input.positions.length / 3;
    case TERRAIN_WORKER_TASK_KIND.PARTITION:
      return task.heights.length;
    case TERRAIN_WORKER_TASK_KIND.STITCH:
      if (task.prepareEqualLevelShells) return 0;
      return task.inputs.reduce(
        (sum, input) => sum + input.positions.length / 3,
        0
      );
  }
};

export const createTerrainWorkerScaling = (onLimitChanged: () => void) => {
  let storage: Storage | undefined;
  try {
    storage = globalThis.localStorage;
  } catch {
    /* Optional in private contexts. */
  }
  return createWorkerThroughputMonitor({
    hardwareConcurrency:
      typeof navigator === "undefined" ? 4 : navigator.hardwareConcurrency,
    storageKey: "carma:terrain-worker-calibration",
    workloadVersion:
      "throughput-aba-v3:raster-grid-error-v7:wasm-normals-v1:selection-v1:cache-read-v1:ecef-v0.1",
    storage,
    onLimitChanged,
  });
};
