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
self.onmessage = async (event: MessageEvent<TerrainWorkerTask>) => {
  try {
    if (event.data.kind !== "decode" && event.data.kind !== "read-cache")
      await normalsReady;
    const result = await executeTerrainWorkerTask(event.data);
    self.postMessage({ result }, { transfer: terrainResultTransfers(result) });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
