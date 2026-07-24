import {
  openCopcPointSource,
  streamCopcPoints,
  type CopcNodeDescriptor,
  type CopcPointChunk,
  type CopcPointSource,
  type CopcRegionOfInterest,
  type CopcRigidRegistration,
  type CopcSceneMetadata,
} from "./copcLoader";

// ─────────────────────────────────────────────────────────────
//  COPC decode worker (wupp#4064)
//
//  Runs the laz-perf/WASM node decoding and the per-point CRS
//  projection off the main thread. Point buffers are posted as
//  transferables, so chunks arrive on the main thread without
//  copies and the render loop never blocks on decoding.
//  Consumed through createCopcStreamWorkerClient.
// ─────────────────────────────────────────────────────────────

export type CopcWorkerStreamOptions = {
  url: string;
  registration?: CopcRigidRegistration;
  fieldDimensions?: readonly string[];
  includeRgb?: boolean;
  pointBudget?: number;
  pointBudgetPercent?: number;
  roi?: CopcRegionOfInterest;
};

export type CopcWorkerRequest =
  | { type: "stream"; options: CopcWorkerStreamOptions }
  | { type: "cancel-stream" }
  | { type: "open-source"; options: CopcWorkerStreamOptions }
  | { type: "load-node"; requestId: number; key: string };

export type CopcWorkerResponse =
  | { type: "metadata"; metadata: CopcSceneMetadata }
  | { type: "chunk"; chunk: CopcPointChunk }
  | { type: "progress"; loadedPoints: number; selectedPoints: number }
  | { type: "stream-done" }
  | { type: "stream-error"; message: string }
  | { type: "source-nodes"; nodes: CopcNodeDescriptor[] }
  | { type: "source-error"; message: string }
  | { type: "node"; requestId: number; chunk: CopcPointChunk }
  | { type: "node-error"; requestId: number; message: string };

type WorkerScope = {
  postMessage(message: CopcWorkerResponse, transfer?: Transferable[]): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<CopcWorkerRequest>) => void
  ): void;
};

const workerScope = self as unknown as WorkerScope;

const errorMessage = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

const chunkTransferables = (chunk: CopcPointChunk): Transferable[] => {
  const buffers = new Set<ArrayBuffer>([chunk.positions.buffer as ArrayBuffer]);
  if (chunk.colors) buffers.add(chunk.colors.buffer as ArrayBuffer);
  for (const values of Object.values(chunk.fieldValues)) {
    buffers.add(values.buffer as ArrayBuffer);
  }
  return [...buffers];
};

let streamCancelToken: { cancelled: boolean } | null = null;
let sourcePromise: Promise<CopcPointSource> | null = null;

workerScope.addEventListener("message", (event) => {
  const request = event.data;
  switch (request.type) {
    case "stream": {
      const cancelToken = { cancelled: false };
      streamCancelToken = cancelToken;
      void streamCopcPoints({
        ...request.options,
        cancelToken,
        onMetadata: (metadata) => {
          workerScope.postMessage({ type: "metadata", metadata });
        },
        onChunk: (chunk) => {
          workerScope.postMessage(
            { type: "chunk", chunk },
            chunkTransferables(chunk)
          );
        },
        onProgress: (loadedPoints, selectedPoints) => {
          workerScope.postMessage({
            type: "progress",
            loadedPoints,
            selectedPoints,
          });
        },
      })
        .then(() => workerScope.postMessage({ type: "stream-done" }))
        .catch((cause: unknown) =>
          workerScope.postMessage({
            type: "stream-error",
            message: errorMessage(cause),
          })
        );
      break;
    }
    case "cancel-stream": {
      if (streamCancelToken) streamCancelToken.cancelled = true;
      break;
    }
    case "open-source": {
      sourcePromise ??= openCopcPointSource(request.options);
      sourcePromise
        .then((source) =>
          workerScope.postMessage({
            type: "source-nodes",
            nodes: [...source.nodes],
          })
        )
        .catch((cause: unknown) =>
          workerScope.postMessage({
            type: "source-error",
            message: errorMessage(cause),
          })
        );
      break;
    }
    case "load-node": {
      const pending = sourcePromise;
      if (!pending) {
        workerScope.postMessage({
          type: "node-error",
          requestId: request.requestId,
          message: "COPC source has not been opened",
        });
        break;
      }
      pending
        .then((source) => source.loadNode(request.key))
        .then((chunk) =>
          workerScope.postMessage(
            { type: "node", requestId: request.requestId, chunk },
            chunkTransferables(chunk)
          )
        )
        .catch((cause: unknown) =>
          workerScope.postMessage({
            type: "node-error",
            requestId: request.requestId,
            message: errorMessage(cause),
          })
        );
      break;
    }
  }
});
