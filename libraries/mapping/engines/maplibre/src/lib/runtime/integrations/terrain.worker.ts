import {
  TERRAIN_WORKER_CONTROL_KIND,
  TERRAIN_WORKER_TASK_KIND,
  type TerrainWorkerControlMessage,
  type TerrainWorkerTaskKind,
} from "../../core/terrain-worker-protocol";
import {
  executeTerrainWorkerTask,
  terrainResultTransfers,
  type TerrainWorkerTask,
} from "./terrain-worker-task";
import { prepareMeshVertexNormalsWasm } from "@carma-mapping/engines/three/primitives/core";

// Compile once, concurrently with the first image decode. No main-thread work,
// new request, or per-tile instance; projection/partition/stitch share the kernel.
const normalsReady = prepareMeshVertexNormalsWasm();
const NORMALS_TASK_KINDS: readonly TerrainWorkerTaskKind[] = [
  TERRAIN_WORKER_TASK_KIND.PROJECT,
  TERRAIN_WORKER_TASK_KIND.PROJECT_ECEF,
  TERRAIN_WORKER_TASK_KIND.PARTITION,
  TERRAIN_WORKER_TASK_KIND.STITCH,
];

// This module is loaded only by the module Worker, never as a main-thread task.
let currentTask: AbortController | null = null;
self.onmessage = async (
  event: MessageEvent<TerrainWorkerTask | TerrainWorkerControlMessage | null>
) => {
  // Vite can deliver an empty message while replacing a module worker during
  // Storybook HMR. It is lifecycle noise, not a terrain task.
  if (!event.data) return;
  if (event.data.kind === TERRAIN_WORKER_CONTROL_KIND.CANCEL_CURRENT) {
    currentTask?.abort();
    return;
  }
  const controller = new AbortController();
  currentTask = controller;
  try {
    if (NORMALS_TASK_KINDS.includes(event.data.kind)) await normalsReady;
    const result = await executeTerrainWorkerTask(
      event.data,
      controller.signal
    );
    self.postMessage({ result }, { transfer: terrainResultTransfers(result) });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    if (currentTask === controller) currentTask = null;
  }
};
