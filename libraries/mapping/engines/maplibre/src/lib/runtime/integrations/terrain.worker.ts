import {
  executeTerrainWorkerTask,
  terrainResultTransfers,
  type TerrainWorkerTask,
} from "./terrain-worker-task";
import { prepareMeshVertexNormalsWasm } from "@carma-mapping/engines/three/primitives/core";

// Compile once, concurrently with the first image decode. No main-thread work,
// new request, or per-tile instance; projection/partition/stitch share the kernel.
const normalsReady = prepareMeshVertexNormalsWasm();

// This module is loaded only by the module Worker, never as a main-thread task.
let currentTask: AbortController | null = null;
self.onmessage = async (event: MessageEvent<TerrainWorkerTask | {kind: "cancel-current"}>) => {
  if (event.data.kind === "cancel-current") {
    currentTask?.abort();
    return;
  }
  const controller = new AbortController();
  currentTask = controller;
  try {
    if (["project", "partition", "stitch"].includes(event.data.kind))
      await normalsReady;
    const result = await executeTerrainWorkerTask(event.data, controller.signal);
    self.postMessage({ result }, { transfer: terrainResultTransfers(result) });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    if (currentTask === controller) currentTask = null;
  }
};
