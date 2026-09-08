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
const isOptionalCacheTask = (task: TerrainWorkerTask) =>
  task.kind === "read-cache" || task.kind === "write-cache" ||
  task.kind === "cache-cost" || task.kind === "calibrate-cache";

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
// FIFO within each priority; running terrain conversion is not interrupted. A ready cut's
// stitch must precede further decodes, otherwise a download burst postpones
// progressive publication until nearly the entire selection has been converted.
const TASK_PRIORITY = {
  "read-cache": 0,
  select: 0,
  partition: 0,
  project: 1,
  stitch: 2,
  decode: 3,
  remesh: 3,
  "cache-cost": 4,
  "write-cache": 5,
  "calibrate-cache": 6,
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
  let preemptedCacheWorker = false;
  const batchStartedAt = performance.now();
  try {
    scaling ??= createTerrainWorkerScaling(() => pump());
    for (const slot of [...slots]) {
      if (slots.length > scaling.concurrency && !slot.job) removeSlot(slot);
    }
    while (queue.length) {
      let next = queue[0];
      if (next.signal?.aborted) {
        queue.shift();
        next.reject(next.signal.reason);
        continue;
      }
      const running = slots.filter((candidate) => candidate.job);
      if (running.length >= scaling.concurrency) {
        const foregroundIndex = queue.findIndex((job) =>
          !isOptionalCacheTask(job.task)
        );
        // A cache miss may precede a slow download. When that source finally
        // needs conversion, no further read deadline exists to free hung IDB
        // workers. Sacrifice at most one optional cache offer per pump, and only
        // if every busy worker is cache I/O. Calibration is optional too: a
        // cooperative abort alone cannot release a hung native storage call.
        // Worker termination aborts uncommitted IDB transactions/releases locks;
        // ordinary terrain work is never killed by this scheduling decision.
        if (preemptedCacheWorker || foregroundIndex === -1 ||
          !running.every((slot) => isOptionalCacheTask(slot.job!.task))) return;
        const victim = [...running].sort((a, b) =>
          TASK_PRIORITY[b.job!.task.kind] - TASK_PRIORITY[a.job!.task.kind]
        )[0];
        preemptedCacheWorker = true;
        victim.job!.reject(new DOMException("Cache yielded to visible terrain", "AbortError"));
        removeSlot(victim);
        // A queued cache read has equal priority to selection; the reclaimed
        // slot must go to the actual foreground work that justified preemption.
        next = queue.splice(foregroundIndex, 1)[0];
        queue.unshift(next);
      }
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
        const task = active.job.task;
        // Cache snapshots are already owned by the write, unlike live source
        // tiles. Transfer their geometry instead of cloning it a second time.
        const transfers = task.kind === "write-cache" ? [
          task.entry.reliefVertexMask.buffer,
          ...(task.entry.geometry ? [task.entry.geometry.positions.buffer, task.entry.geometry.normals.buffer, task.entry.geometry.indices.buffer] : []),
        ] as ArrayBuffer[] : [];
        if (transfers.length) active.worker.postMessage(task, transfers);
        else active.worker.postMessage(task);
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
    return executeTerrainWorkerTask(structuredClone(task), signal);
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
      // Only multi-step idle profiling needs cooperative in-flight abort.
      // Keep the slot owned until its final reply, preventing crossed jobs.
      if (task.kind === "calibrate-cache") {
        slots.find(slot => slot.job === job)?.worker.postMessage({kind: "cancel-current"});
      }
      job.reject(signal?.reason);
      if (isOptionalCacheTask(task) && task.kind !== "calibrate-cache") {
        // IDB need not finish after aborting its caller. Release the optional
        // cache worker (and its native locks) so visible terrain can proceed.
        // Removed-slot guards discard even an already-queued late message.
        const active = slots.find((slot) => slot.job === job);
        if (active) removeSlot(active);
      }
      updateLoad();
      pump();
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
