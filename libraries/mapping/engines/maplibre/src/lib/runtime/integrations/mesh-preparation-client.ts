import { createWorkerThroughputMonitor } from "@carma-commons/worker-scaling";
import {
  meshPreparationTaskTransfers,
  type MeshPreparationTask,
  type MeshPreparationResult,
  type MeshPreparationReply,
  type MeshPreparationRequest,
} from "./mesh-preparation-task";

export type {
  MeshPreparationTask,
  MeshPreparationResult,
} from "./mesh-preparation-task";
export type MeshPreparationOptions = {
  signal?: AbortSignal;
  /** Higher values run first; evaluated at admission, preserving live tile priority. */
  getPriority?: () => number;
};
type Job = MeshPreparationOptions & {
  id: number;
  task: MeshPreparationTask;
  work: number;
  startedAt?: number;
  resolve: (result: MeshPreparationResult) => void;
  reject: (reason: unknown) => void;
};
type Slot = {
  worker: Worker;
  warmed: boolean;
  job?: Job;
  timer?: ReturnType<typeof setTimeout>;
};
const slots: Slot[] = [];
const queue: Job[] = [];
let nextId = 0;
let pumping = false;
let disposalError: Error | undefined;
let scaling: ReturnType<typeof createWorkerThroughputMonitor> | undefined;
let dispatchYieldTimer: ReturnType<typeof setTimeout> | undefined;
const IDLE_MS = 30_000;
const DEADLINE_MS = 60_000;
const DISPATCH_BUDGET_MS = 2;

const updateLoad = () => {
  if (disposalError) return;
  const running = slots.filter((slot) => slot.job);
  scaling?.setLoad(
    running.length,
    queue.length,
    running.every((slot) => slot.warmed)
  );
};
const removeSlot = (slot: Slot) => {
  const index = slots.indexOf(slot);
  if (index < 0) return;
  clearTimeout(slot.timer);
  slot.worker.onmessage = null;
  slot.worker.onerror = null;
  slot.worker.onmessageerror = null;
  slot.worker.terminate();
  slot.job = undefined;
  slots.splice(index, 1);
  updateLoad();
};
const priority = (job: Job) => {
  try {
    const value = job.getPriority?.() ?? 0;
    return Number.isNaN(value) ? -Infinity : value;
  } catch {
    // Disposed tile metadata belongs behind every still-needed tile.
    return -Infinity;
  }
};
const createScaling = () => {
  let storage: Storage | undefined;
  try {
    storage = globalThis.localStorage;
  } catch {
    /* Optional storage. */
  }
  return createWorkerThroughputMonitor({
    hardwareConcurrency:
      typeof navigator === "undefined" ? 4 : navigator.hardwareConcurrency,
    storage,
    storageKey: "carma:mesh-preparation-worker-calibration",
    workloadVersion: "mesh-binary-v1:separated-surfaces-v1",
    onLimitChanged: () => pump(),
  });
};

export const disposeMeshPreparationPool = () => {
  if (disposalError) return;
  disposalError = new Error("Mesh preparation pool was disposed");
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
  const batchStart = performance.now();
  try {
    scaling ??= createScaling();
    for (const slot of [...slots]) {
      if (slots.length > scaling.concurrency && !slot.job) removeSlot(slot);
    }
    while (queue.length) {
      // Re-evaluate queued native tile priorities after camera/selection changes.
      let index = 0;
      let highest = priority(queue[0]);
      for (let i = 1; i < queue.length; i += 1) {
        const candidate = priority(queue[i]);
        if (candidate > highest) {
          highest = candidate;
          index = i;
        }
      }
      const job = queue[index];
      if (job.signal?.aborted) {
        queue.splice(index, 1);
        job.reject(job.signal.reason);
        continue;
      }
      if (slots.filter((slot) => slot.job).length >= scaling.concurrency)
        return;
      let slot = slots.find((candidate) => !candidate.job);
      if (!slot) {
        try {
          slot = {
            worker: new Worker(
              new URL("./mesh-preparation.worker.ts", import.meta.url),
              { type: "module", name: "mesh-preparation" }
            ),
            warmed: false,
          };
          slots.push(slot);
        } catch (error) {
          if (slots.length) {
            scaling.capacityFailed(slots.length);
            return;
          }
          queue.splice(index, 1);
          job.reject(error);
          continue;
        }
      }
      queue.splice(index, 1);
      const active = slot;
      clearTimeout(active.timer);
      active.job = job;
      const current = () =>
        !disposalError && slots.includes(active) && active.job === job;
      const fail = (error: unknown) => {
        if (!current()) return;
        scaling?.complete(
          job.task.kind,
          job.work,
          false,
          job.startedAt ?? performance.now()
        );
        job.reject(error);
        removeSlot(active);
        pump();
      };
      active.worker.onerror = (event) =>
        fail(new Error(event.message || "Mesh worker failed"));
      active.worker.onmessageerror = () =>
        fail(new Error("Mesh worker reply could not be decoded"));
      active.worker.onmessage = (event: MessageEvent<MeshPreparationReply>) => {
        if (!current() || event.data.id !== job.id) return;
        clearTimeout(active.timer);
        const reply = event.data;
        const result = "result" in reply ? reply.result : undefined;
        const valid = !!result && result.kind === job.task.kind;
        active.job = undefined;
        scaling?.complete(
          job.task.kind,
          job.work,
          valid && !job.signal?.aborted && active.warmed,
          job.startedAt ?? performance.now()
        );
        active.warmed = true;
        if (job.signal?.aborted) job.reject(job.signal.reason);
        else if (valid) job.resolve(result!);
        else {
          const error = new Error(
            "error" in reply
              ? reply.error.message
              : "Invalid mesh worker result"
          );
          if ("error" in reply) error.name = reply.error.name;
          job.reject(error);
        }
        if (!active.job && slots.includes(active))
          active.timer = setTimeout(() => removeSlot(active), IDLE_MS);
        pump();
      };
      active.timer = setTimeout(
        () => fail(new Error("Mesh preparation timed out")),
        DEADLINE_MS
      );
      try {
        job.startedAt = performance.now();
        // Admission transfers private buffers exactly once. A failed/aborted worker
        // rejects; detached input is never retried on the render thread.
        active.worker.postMessage(
          { id: job.id, task: job.task } satisfies MeshPreparationRequest,
          meshPreparationTaskTransfers(job.task)
        );
      } catch (error) {
        fail(error);
      }
      if (performance.now() - batchStart >= DISPATCH_BUDGET_MS) {
        dispatchYieldTimer = setTimeout(() => {
          dispatchYieldTimer = undefined;
          pump();
        }, 0);
        return;
      }
    }
  } finally {
    pumping = false;
    updateLoad();
  }
};

/** Inputs are private copies and become worker-owned on dispatch. */
export async function runMeshPreparationTask(
  task: MeshPreparationTask,
  { signal, getPriority }: MeshPreparationOptions = {}
): Promise<MeshPreparationResult> {
  if (disposalError) throw disposalError;
  signal?.throwIfAborted();
  const transfers = meshPreparationTaskTransfers(task);
  if (
    typeof Worker === "undefined" &&
    (typeof window === "undefined" || import.meta.env?.MODE === "test")
  ) {
    const { executeMeshPreparationTask } = await import(
      "./mesh-preparation-task"
    );
    if (disposalError) throw disposalError;
    signal?.throwIfAborted();
    const result = await executeMeshPreparationTask(
      structuredClone(task),
      signal
    );
    if (disposalError) throw disposalError;
    signal?.throwIfAborted();
    return result;
  }
  // Capture work units before postMessage detaches the input buffers.
  const work =
    task.kind === "binary"
      ? transfers.reduce((sum, buffer) => sum + buffer.byteLength, 0)
      : task.parts.reduce((sum, part) => sum + part.indices.length / 3, 0);
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    const job: Job = {
      id: ++nextId,
      task,
      work,
      signal,
      getPriority,
      resolve: (result) => {
        if (!settled) {
          settled = true;
          cleanup();
          resolve(result);
        }
      },
      reject: (reason) => {
        if (!settled) {
          settled = true;
          cleanup();
          reject(reason);
        }
      },
    };
    const onAbort = () => {
      const index = queue.indexOf(job);
      if (index >= 0) queue.splice(index, 1);
      job.reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
      const slot = slots.find((candidate) => candidate.job === job);
      if (slot) removeSlot(slot);
      updateLoad();
      pump();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    queue.push(job);
    pump();
  });
}

if (import.meta.hot) {
  import.meta.hot.dispose(disposeMeshPreparationPool);
  // Imperative tile loaders retain their pool closures beyond React refresh.
  import.meta.hot.accept(() => window.location.reload());
}
