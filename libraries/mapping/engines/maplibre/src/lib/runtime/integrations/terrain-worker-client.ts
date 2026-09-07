import type {
  TerrainWorkerTask,
  TerrainWorkerResult,
} from "./terrain-worker-task";
import {
  createTerrainWorkerScaling,
  getTerrainTaskWork,
} from "./terrain-worker-scaling";

type Job = {
  task: TerrainWorkerTask;
  startedAt?: number;
  resolve: (result: TerrainWorkerResult) => void;
  reject: (reason: unknown) => void;
  signal?: AbortSignal;
};
type Slot = {
  worker: Worker;
  warmed?: boolean;
  job?: Job;
  timer?: ReturnType<typeof setTimeout>;
};
const slots: Slot[] = [];
const queue: Job[] = [];
let scaling: ReturnType<typeof createTerrainWorkerScaling> | undefined;
let pumping = false;
let disposalError: Error | undefined;
let dispatchYieldTimer: ReturnType<typeof setTimeout> | undefined;
const MAX_DISPATCH_BATCH_MS = 2;

const updateLoad = () => {
  if (disposalError) return;
  const running = slots.filter((slot) => slot.job);
  scaling?.setLoad(
    running.length,
    queue.length,
    running.every((slot) => slot.warmed)
  );
};
// Finish an already decoded tile before decoding the rest of a network burst.
// FIFO within each priority; running work is never interrupted. A ready cut's
// stitch must precede further decodes, otherwise a download burst postpones
// progressive publication until nearly the entire selection has been converted.
const TASK_PRIORITY = {
  "read-cache": 0,
  select: 0,
  partition: 0,
  project: 1,
  stitch: 2,
  decode: 3,
} as const;

const removeSlot = (slot: Slot) => {
  const index = slots.indexOf(slot);
  if (index === -1) return;
  clearTimeout(slot.timer);
  slot.timer = undefined;
  slot.worker.onmessage = null;
  slot.worker.onerror = null;
  slot.worker.onmessageerror = null;
  slot.worker.terminate();
  slot.job = undefined;
  slots.splice(index, 1);
  updateLoad();
};

export const disposeTerrainWorkerPool = () => {
  if (disposalError) return;
  disposalError = new Error("Terrain worker pool was disposed");
  clearTimeout(dispatchYieldTimer);
  dispatchYieldTimer = undefined;
  scaling?.dispose();
  scaling = undefined;
  for (const job of queue.splice(0)) job.reject(disposalError);
  for (const slot of [...slots]) {
    slot.job?.reject(disposalError);
    removeSlot(slot);
  }
};

const pump = () => {
  if (pumping || disposalError || dispatchYieldTimer !== undefined) return;
  pumping = true;
  const batchStartedAt = performance.now();
  try {
    scaling ??= createTerrainWorkerScaling(() => pump());
    for (const slot of [...slots]) {
      if (slots.length > scaling.concurrency && !slot.job) removeSlot(slot);
    }
    while (queue.length) {
      const next = queue[0];
      if (next.signal?.aborted) {
        queue.shift();
        next.reject(next.signal.reason);
        continue;
      }
      if (
        slots.filter((candidate) => candidate.job).length >= scaling.concurrency
      )
        return;
      let slot = slots.find((candidate) => !candidate.job);
      if (!slot && slots.length < scaling.concurrency) {
        try {
          slot = {
            worker: new Worker(
              new URL("./terrain.worker.ts", import.meta.url),
              {
                type: "module",
                name: "shadow-terrain",
              }
            ),
          };
          slots.push(slot);
        } catch (error) {
          if (slots.length > 0) {
            // Capacity exhaustion is not a failure of the queued jobs. Let
            // healthy workers drain them and defer another capacity probe.
            scaling.capacityFailed(slots.length);
            return;
          }
          queue.shift();
          next.reject(error);
          continue;
        }
      }
      if (!slot) return;
      const active = slot;
      clearTimeout(active.timer);
      active.job = queue.shift()!;
      const fail = (error: unknown) => {
        if (disposalError || !slots.includes(active)) return;
        scaling?.complete(
          active.job?.task.kind ?? "error",
          0,
          false,
          performance.now()
        );
        active.job?.reject(error);
        removeSlot(active);
        pump();
      };
      active.worker.onerror = (event) =>
        fail(
          new Error(
            `${event.message || "Terrain worker failed"}${
              event.filename
                ? ` (${event.filename}:${event.lineno}:${event.colno})`
                : ""
            }`
          )
        );
      active.worker.onmessageerror = () =>
        fail(new Error("Terrain worker message could not be decoded"));
      active.worker.onmessage = (
        event: MessageEvent<{ result?: TerrainWorkerResult; error?: string }>
      ) => {
        if (disposalError || !active.job || !slots.includes(active)) return;
        clearTimeout(active.timer);
        const job = active.job;
        // Count only useful results, excluding cancelled work and each new
        // worker's first task (module/WASM warm-up). Never terminate running work
        // solely to shrink the pool; replacement capacity is gated in pump().
        const successful =
          !job.signal?.aborted && !!event.data.result && !!active.warmed;
        // Clear the job before a controller callback may dispatch another task.
        active.job = undefined;
        active.warmed = true;
        scaling?.complete(
          job.task.kind,
          getTerrainTaskWork(job.task),
          successful,
          job.startedAt ?? performance.now()
        );
        if (job.signal?.aborted) job.reject(job.signal.reason);
        else if (event.data.result) job.resolve(event.data.result);
        else
          job.reject(
            new Error(event.data.error ?? "Terrain worker returned no result")
          );
        if (!active.job && slots.includes(active))
          active.timer = setTimeout(() => removeSlot(active), 30_000);
        pump();
      };
      active.timer = setTimeout(
        () => fail(new Error("Terrain worker timed out")),
        60_000
      );
      try {
        // Source tiles stay owned by the source cache. Inputs are cloned; worker
        // results transfer their backing buffers without a second geometry copy.
        active.job.startedAt = performance.now();
        active.worker.postMessage(active.job.task);
        if (performance.now() - batchStartedAt >= MAX_DISPATCH_BATCH_MS) {
          // postMessage clones cache-owned inputs synchronously. Do not chain
          // a whole burst of large stitch/project copies inside one worker
          // completion or render callback. Yield a task so input/paint can run.
          // This bounds the batch, not the cost of an individual native copy.
          dispatchYieldTimer = setTimeout(() => {
            dispatchYieldTimer = undefined;
            pump();
          }, 0);
          return;
        }
      } catch (error) {
        fail(error);
      }
    }
  } finally {
    pumping = false;
    updateLoad();
  }
};

export const runTerrainWorkerTask = async (
  task: TerrainWorkerTask,
  signal?: AbortSignal
): Promise<TerrainWorkerResult> => {
  if (disposalError) throw disposalError;
  signal?.throwIfAborted();
  // Explicit non-browser path for headless unit tests and CPU benchmarks.
  // Browsers never silently fall back to blocking main-thread conversion.
  if (
    typeof Worker === "undefined" &&
    (typeof window === "undefined" || import.meta.env?.MODE === "test")
  ) {
    const { executeTerrainWorkerTask } = await import("./terrain-worker-task");
    if (disposalError) throw disposalError;
    // Match postMessage ownership in Node/test execution too. Stitching may
    // mutate its worker-owned arrays, never the source cache on the caller.
    return executeTerrainWorkerTask(structuredClone(task));
  }
  return new Promise((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    const job: Job = {
      task,
      signal,
      resolve: (result) => {
        cleanup();
        resolve(result);
      },
      reject: (error) => {
        cleanup();
        reject(error);
      },
    };
    const onAbort = () => {
      const index = queue.indexOf(job);
      if (index !== -1) queue.splice(index, 1);
      job.reject(signal?.reason);
      updateLoad();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    const before = queue.findIndex(
      (queued) => TASK_PRIORITY[queued.task.kind] > TASK_PRIORITY[task.kind]
    );
    queue.splice(before < 0 ? queue.length : before, 0, job);
    pump();
  });
};

import.meta.hot?.dispose(disposeTerrainWorkerPool);
