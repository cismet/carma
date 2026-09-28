import { FileLoader, type LoadingManager } from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

const DECODER_TIMEOUT_MS = 30_000;

type DecoderWorker = Worker & {
  _callbacks: Record<number, { reject: (reason: unknown) => void }>;
};

/** Private contracts verified against three 0.183.2: initialization is cached
 * even when rejected, worker callbacks settle only on protocol messages, and
 * disposal only terminates workers. Keep pool/task ownership in that loader.
 * Its FileLoader.abort() is also missing from the installed public typings.
 */
type NativeDracoLoader = DRACOLoader & {
  decoderPath: string;
  decoderPending: Promise<void> | null;
  workerPool: DecoderWorker[];
  _initDecoder: () => Promise<void>;
  _loadLibrary: (
    url: string,
    responseType: string
  ) => Promise<string | ArrayBuffer>;
  _getWorker: (taskId: number, taskCost: number) => Promise<DecoderWorker>;
  _releaseTask: (worker: DecoderWorker, taskId: number) => void;
};

/** Adds failure settlement to the native Draco loader, without another pool. */
export const createThreeTilesDracoLoader = (
  manager?: LoadingManager
): DRACOLoader => {
  const loader = new DRACOLoader(manager) as NativeDracoLoader;
  const initialize = loader._initDecoder.bind(loader);
  const getWorker = loader._getWorker.bind(loader);
  const dispose = loader.dispose.bind(loader);
  const pendingAssets = new Set<(reason: unknown) => void>();
  const observedWorkers = new WeakSet<DecoderWorker>();
  const workerFailures = new WeakMap<DecoderWorker, Error>();
  const decodeDeadlines = new WeakMap<
    DecoderWorker,
    Map<number, ReturnType<typeof setTimeout>>
  >();
  const clearDecodeDeadlines = (worker: DecoderWorker, taskId?: number) => {
    const deadlines = decodeDeadlines.get(worker);
    if (!deadlines) return;
    for (const [id, timer] of deadlines) {
      if (taskId !== undefined && id !== taskId) continue;
      clearTimeout(timer);
      deadlines.delete(id);
    }
    if (deadlines.size === 0) decodeDeadlines.delete(worker);
  };
  let disposed = false;
  const disposalError = () =>
    new DOMException("Draco loader disposed", "AbortError");

  loader._loadLibrary = (url, responseType) =>
    new Promise((resolve, reject) => {
      if (disposed) {
        reject(disposalError());
        return;
      }
      // Preserve native URL modifiers, credentials, cache and manager events.
      const file = new FileLoader(loader.manager) as FileLoader & {
        abort: () => FileLoader;
      };
      file.setPath(loader.decoderPath);
      file.setResponseType(responseType);
      file.setWithCredentials(loader.withCredentials);
      let settled = false;
      const finish = () => {
        if (settled) return false;
        settled = true;
        clearTimeout(timer);
        pendingAssets.delete(cancel);
        return true;
      };
      const cancel = (reason: unknown) => {
        if (!finish()) return;
        reject(reason);
        file.abort();
      };
      const timer = setTimeout(
        () =>
          cancel(
            new DOMException("Draco decoder asset timed out", "TimeoutError")
          ),
        DECODER_TIMEOUT_MS
      );
      pendingAssets.add(cancel);
      try {
        file.load(
          url,
          (result) => {
            if (finish()) resolve(result);
          },
          undefined,
          (error) => {
            if (finish()) reject(error);
          }
        );
      } catch (error) {
        if (finish()) reject(error);
      }
    });

  loader._initDecoder = () => {
    if (disposed) return Promise.reject(disposalError());
    if (loader.decoderPending) return loader.decoderPending;
    const pending = initialize()
      .then(() => {
        if (disposed) {
          // Native initialization may create its blob URL after dispose ran.
          dispose();
          throw disposalError();
        }
      })
      .catch((error: unknown) => {
        if (loader.decoderPending === pending) loader.decoderPending = null;
        throw error;
      });
    loader.decoderPending = pending;
    return pending;
  };

  const failWorker = (worker: DecoderWorker, reason: Error) => {
    const index = loader.workerPool.indexOf(worker);
    if (index < 0) return;
    workerFailures.set(worker, reason);
    clearDecodeDeadlines(worker);
    loader.workerPool.splice(index, 1);
    // A queued message must not access callbacks released by the native catch.
    worker.onmessage = null;
    worker.terminate();
    for (const callback of Object.values(worker._callbacks))
      callback.reject(reason);
  };

  loader._getWorker = (taskId, taskCost) => {
    if (disposed) return Promise.reject(disposalError());
    return getWorker(taskId, taskCost).then((worker) => {
      if (disposed) {
        // This task was reserved but decodeGeometry has not registered its
        // callback yet; native cleanup cannot see that worker on rejection.
        loader._releaseTask(worker, taskId);
        failWorker(worker, disposalError());
        throw disposalError();
      }
      if (!observedWorkers.has(worker)) {
        observedWorkers.add(worker);
        const onmessage = worker.onmessage;
        worker.onmessage = (event) => {
          const { type, id } = event.data;
          if ((type === "decode" || type === "error") && typeof id === "number")
            clearDecodeDeadlines(worker, id);
          onmessage?.call(worker, event);
        };
        const postMessage = worker.postMessage.bind(worker);
        worker.postMessage = (
          message: unknown,
          transferOrOptions?: Transferable[] | StructuredSerializeOptions
        ) => {
          // Disposal can occur after this reservation resolves but before
          // native decodeGeometry registers its callback in the next microtask.
          if (disposed) throw disposalError();
          const failure = workerFailures.get(worker);
          if (failure) throw failure;
          const task = message as { type?: string; id?: number } | null;
          const taskId =
            task?.type === "decode" && typeof task.id === "number"
              ? task.id
              : undefined;
          if (taskId !== undefined) {
            const deadlines = decodeDeadlines.get(worker) ?? new Map();
            decodeDeadlines.set(worker, deadlines);
            // Native async WASM initialization can reject without a worker
            // error event. A silent worker must not hold parse slots forever.
            deadlines.set(
              taskId,
              setTimeout(
                () =>
                  failWorker(
                    worker,
                    new DOMException("Draco decode timed out", "TimeoutError")
                  ),
                DECODER_TIMEOUT_MS
              )
            );
          }
          try {
            if (Array.isArray(transferOrOptions))
              postMessage(message, transferOrOptions);
            else postMessage(message, transferOrOptions);
          } catch (error) {
            if (taskId !== undefined) clearDecodeDeadlines(worker, taskId);
            throw error;
          }
        };
        worker.addEventListener("error", (event) =>
          failWorker(
            worker,
            event.error instanceof Error
              ? event.error
              : new Error(event.message || "Draco decoder worker failed")
          )
        );
        worker.addEventListener("messageerror", () =>
          failWorker(worker, new Error("Draco decoder worker message failed"))
        );
      }
      return worker;
    });
  };

  loader.dispose = () => {
    if (disposed) return loader;
    disposed = true;
    const reason = disposalError();
    for (const cancel of [...pendingAssets]) cancel(reason);
    for (const worker of [...loader.workerPool]) failWorker(worker, reason);
    dispose();
    return loader;
  };
  return loader;
};
