import type {
  CopcNodeDescriptor,
  CopcPointChunk,
  CopcSceneMetadata,
} from "./copcLoader";
import type {
  CopcWorkerRequest,
  CopcWorkerResponse,
  CopcWorkerStreamOptions,
} from "./copc-stream.worker";

export type { CopcWorkerStreamOptions } from "./copc-stream.worker";

export type CopcStreamCallbacks = {
  onMetadata: (metadata: CopcSceneMetadata) => void | Promise<void>;
  onChunk: (chunk: CopcPointChunk) => void;
  onProgress?: (loadedPoints: number, selectedPoints: number) => void;
};

export type CopcWorkerSource = {
  nodes: readonly CopcNodeDescriptor[];
  loadNode: (key: string) => Promise<CopcPointChunk>;
};

export interface CopcStreamWorkerClient {
  /** Streams a COPC file off-thread; resolves when all nodes arrived. */
  stream: (
    options: CopcWorkerStreamOptions,
    callbacks: CopcStreamCallbacks
  ) => Promise<void>;
  cancelStream: () => void;
  /** Opens the random-access node source for on-demand refinement. */
  openSource: (options: CopcWorkerStreamOptions) => Promise<CopcWorkerSource>;
  dispose: () => void;
}

type Resolver<Value> = {
  resolve: (value: Value) => void;
  reject: (cause: Error) => void;
};

/**
 * Creates the off-thread COPC decoding client, or null when module workers
 * are unavailable. A worker that dies before delivering data rejects all
 * pending promises, so callers can fall back to main-thread streamCopcPoints.
 */
export const createCopcStreamWorkerClient =
  (): CopcStreamWorkerClient | null => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./copc-stream.worker.ts", import.meta.url), {
        type: "module",
      });
    } catch {
      return null;
    }

    let disposed = false;
    let streamResolver: Resolver<void> | null = null;
    let streamCallbacks: CopcStreamCallbacks | null = null;
    let sourceResolver: Resolver<CopcNodeDescriptor[]> | null = null;
    const nodeResolvers = new Map<number, Resolver<CopcPointChunk>>();
    let nextRequestId = 1;

    // Callbacks run strictly in arrival order; an async onMetadata gates the
    // chunk dispatch exactly like the main-thread loader does.
    let dispatchQueue: Promise<void> = Promise.resolve();
    const enqueue = (task: () => void | Promise<void>) => {
      dispatchQueue = dispatchQueue.then(() => {
        if (disposed) return;
        return task();
      });
    };

    const failEverything = (cause: Error) => {
      streamResolver?.reject(cause);
      streamResolver = null;
      sourceResolver?.reject(cause);
      sourceResolver = null;
      nodeResolvers.forEach((resolver) => resolver.reject(cause));
      nodeResolvers.clear();
    };

    const post = (message: CopcWorkerRequest) => worker.postMessage(message);

    worker.addEventListener("error", (event) => {
      failEverything(
        new Error(`COPC worker failed: ${event.message || "unknown error"}`)
      );
    });
    worker.addEventListener(
      "message",
      (event: MessageEvent<CopcWorkerResponse>) => {
        const response = event.data;
        switch (response.type) {
          case "metadata":
            enqueue(() => streamCallbacks?.onMetadata(response.metadata));
            break;
          case "chunk":
            enqueue(() => streamCallbacks?.onChunk(response.chunk));
            break;
          case "progress":
            enqueue(() =>
              streamCallbacks?.onProgress?.(
                response.loadedPoints,
                response.selectedPoints
              )
            );
            break;
          case "stream-done":
            enqueue(() => {
              streamResolver?.resolve();
              streamResolver = null;
            });
            break;
          case "stream-error":
            enqueue(() => {
              streamResolver?.reject(new Error(response.message));
              streamResolver = null;
            });
            break;
          case "source-nodes":
            sourceResolver?.resolve(response.nodes);
            sourceResolver = null;
            break;
          case "source-error":
            sourceResolver?.reject(new Error(response.message));
            sourceResolver = null;
            break;
          case "node": {
            nodeResolvers.get(response.requestId)?.resolve(response.chunk);
            nodeResolvers.delete(response.requestId);
            break;
          }
          case "node-error": {
            nodeResolvers
              .get(response.requestId)
              ?.reject(new Error(response.message));
            nodeResolvers.delete(response.requestId);
            break;
          }
        }
      }
    );

    const loadNode = (key: string): Promise<CopcPointChunk> =>
      new Promise<CopcPointChunk>((resolve, reject) => {
        if (disposed) {
          reject(new Error("COPC worker client disposed"));
          return;
        }
        const requestId = nextRequestId++;
        nodeResolvers.set(requestId, { resolve, reject });
        post({ type: "load-node", requestId, key });
      });

    return {
      stream: (options, callbacks) =>
        new Promise<void>((resolve, reject) => {
          if (disposed) {
            reject(new Error("COPC worker client disposed"));
            return;
          }
          streamCallbacks = callbacks;
          streamResolver = { resolve, reject };
          post({ type: "stream", options });
        }),
      cancelStream: () => {
        if (!disposed) post({ type: "cancel-stream" });
      },
      openSource: (options) =>
        new Promise<CopcNodeDescriptor[]>((resolve, reject) => {
          if (disposed) {
            reject(new Error("COPC worker client disposed"));
            return;
          }
          sourceResolver = { resolve, reject };
          post({ type: "open-source", options });
        }).then((nodes) => ({ nodes, loadNode })),
      dispose: () => {
        if (disposed) return;
        disposed = true;
        failEverything(new Error("COPC worker client disposed"));
        worker.terminate();
      },
    };
  };
