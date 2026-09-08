import { createWorkerThroughputMonitor } from "@carma-commons/worker-scaling";
import type { TerrainWorkerTask } from "./terrain-worker-task";

// Work units are input samples/vertices, not task count or per-worker latency.
// The controller rejects comparisons whose task-kind mixture changes materially.
export const getTerrainTaskWork = (task: TerrainWorkerTask): number => {
  switch (task.kind) {
    case "read-cache":
    case "write-cache":
    case "cache-cost":
    case "calibrate-cache":
      // Storage service time is not comparable with geometry work throughput.
      return 0;
    case "select":
      return task.input.source.maxzoom - task.input.source.minzoom + 1;
    case "decode":
      return (task.segments + 2) ** 2;
    case "remesh":
      return (task.raster.width + 2) * (task.raster.height + 2);
    case "project":
      return task.tile.heightMeters.length;
    case "partition":
      return task.heights.length;
    case "stitch":
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
      "throughput-aba-v3:raster-grid-error-v7:wasm-normals-v1:selection-v1:cache-read-v1",
    storage,
    onLimitChanged,
  });
};
