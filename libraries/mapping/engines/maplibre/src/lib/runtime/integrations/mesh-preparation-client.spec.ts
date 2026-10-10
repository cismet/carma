import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  MeshPreparationRequest,
  MeshPreparationReply,
} from "./mesh-preparation-task";

const monitor = vi.hoisted(() => ({
  concurrency: 1,
  complete: vi.fn(),
  setLoad: vi.fn(),
  dispose: vi.fn(),
  capacityFailed: vi.fn(),
  changed: () => {},
}));
vi.mock("@carma-commons/worker-scaling", () => ({
  createWorkerThroughputMonitor: (options: { onLimitChanged: () => void }) => {
    monitor.changed = options.onLimitChanged;
    return monitor;
  },
}));

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: { data: MeshPreparationReply }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  requests: MeshPreparationRequest[] = [];
  terminate = vi.fn();
  constructor() {
    FakeWorker.instances.push(this);
  }
  postMessage(message: MeshPreparationRequest, transfer: Transferable[]) {
    this.requests.push(structuredClone(message, { transfer }));
  }
  reply() {
    const { id } = this.requests.at(-1)!;
    this.onmessage?.({
      data: {
        id,
        result: {
          kind: "binary",
          data: {
            kind: "glb",
            json: { asset: { version: "2.0" } },
            binary: null,
          },
        },
      },
    });
  }
}

let pool: typeof import("./mesh-preparation-client");
beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  vi.clearAllMocks();
  monitor.concurrency = 1;
  FakeWorker.instances = [];
  vi.stubGlobal("Worker", FakeWorker);
  pool = await import("./mesh-preparation-client");
});
afterEach(() => {
  pool.disposeMeshPreparationPool();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const task = (buffer = new ArrayBuffer(32)) => ({
  kind: "binary" as const,
  buffer,
});

describe("shared mesh preparation workers", () => {
  it("transfers owned input once, reuses the worker and excludes cold starts from calibration", async () => {
    const input = new ArrayBuffer(32);
    const first = pool.runMeshPreparationTask(task(input));
    const worker = FakeWorker.instances[0];
    expect(input.byteLength).toBe(0);
    expect(worker.requests[0].task).toMatchObject({ kind: "binary" });
    worker.reply();
    await first;
    expect(monitor.complete).toHaveBeenLastCalledWith(
      "binary",
      32,
      false,
      expect.any(Number)
    );
    const second = pool.runMeshPreparationTask(task());
    expect(FakeWorker.instances).toHaveLength(1);
    worker.reply();
    await second;
    expect(monitor.complete).toHaveBeenLastCalledWith(
      "binary",
      32,
      true,
      expect.any(Number)
    );
  });

  it("keeps queued inputs intact and reevaluates current view priority at admission", async () => {
    const first = pool.runMeshPreparationTask(task());
    let priority = 0;
    const queued = new ArrayBuffer(48);
    const second = pool.runMeshPreparationTask(task(queued), {
      getPriority: () => priority,
    });
    const third = pool.runMeshPreparationTask(task(new ArrayBuffer(64)), {
      getPriority: () => 1,
    });
    expect(queued.byteLength).toBe(48);
    priority = 5;
    const worker = FakeWorker.instances[0];
    worker.reply();
    await first;
    expect(worker.requests[1].task).toMatchObject({
      buffer: expect.any(ArrayBuffer),
    });
    expect(
      (worker.requests[1].task as { buffer: ArrayBuffer }).buffer.byteLength
    ).toBe(48);
    expect(queued.byteLength).toBe(0);
    worker.reply();
    await second;
    worker.reply();
    await third;
  });

  it("demotes obsolete demand below prefetch when its live priority becomes negative infinity", async () => {
    const active = pool.runMeshPreparationTask(task());
    let wantedPriority = 5;
    const obsolete = pool.runMeshPreparationTask(task(new ArrayBuffer(48)), {
      getPriority: () => wantedPriority,
    });
    const prefetch = pool.runMeshPreparationTask(task(new ArrayBuffer(64)), {
      getPriority: () => -1,
    });
    wantedPriority = -Infinity;
    const worker = FakeWorker.instances[0];
    worker.reply();
    await active;
    expect(
      (worker.requests[1].task as { buffer: ArrayBuffer }).buffer.byteLength
    ).toBe(64);
    worker.reply();
    await prefetch;
    worker.reply();
    await obsolete;
  });

  it("cancels queued work without transfer and replaces a cancelled running worker", async () => {
    const active = new AbortController(),
      queued = new AbortController();
    const first = pool.runMeshPreparationTask(task(), {
      signal: active.signal,
    });
    const firstRejected = expect(first).rejects.toMatchObject({
      name: "AbortError",
    });
    const bytes = new ArrayBuffer(16);
    const second = pool.runMeshPreparationTask(task(bytes), {
      signal: queued.signal,
    });
    const secondRejected = expect(second).rejects.toMatchObject({
      name: "AbortError",
    });
    queued.abort();
    await secondRejected;
    expect(bytes.byteLength).toBe(16);
    const oldWorker = FakeWorker.instances[0];
    const lateReply = oldWorker.onmessage;
    active.abort();
    await firstRejected;
    expect(oldWorker.terminate).toHaveBeenCalledOnce();
    const third = pool.runMeshPreparationTask(task());
    lateReply?.({
      data: { id: 1, error: { name: "Error", message: "stale" } },
    });
    expect(FakeWorker.instances).toHaveLength(2);
    FakeWorker.instances[1].reply();
    await third;
  });

  it.each(["error", "messageerror", "timeout"])(
    "recovers after worker %s without retrying detached input on the main thread",
    async (reason) => {
      const first = pool.runMeshPreparationTask(task());
      const rejected = expect(first).rejects.toThrow();
      const second = pool.runMeshPreparationTask(task());
      const worker = FakeWorker.instances[0];
      if (reason === "error") worker.onerror?.({ message: "crashed" });
      else if (reason === "messageerror") worker.onmessageerror?.();
      else await vi.advanceTimersByTimeAsync(60_000);
      await rejected;
      expect(worker.terminate).toHaveBeenCalledOnce();
      expect(FakeWorker.instances).toHaveLength(2);
      FakeWorker.instances[1].reply();
      await second;
    }
  );

  it("rejects mismatched task results but ignores unrelated reply ids", async () => {
    const pending = pool.runMeshPreparationTask(task());
    const rejected = expect(pending).rejects.toThrow(
      "Invalid mesh worker result"
    );
    const worker = FakeWorker.instances[0];
    worker.onmessage?.({
      data: { id: 99, error: { name: "Error", message: "old" } },
    });
    expect(monitor.complete).not.toHaveBeenCalled();
    worker.onmessage?.({
      data: {
        id: 1,
        result: { kind: "surfaces", data: { closed: false, parts: [] } },
      },
    });
    await rejected;
  });

  it("adapts shared concurrency without killing running jobs when the limit falls", async () => {
    const jobs = Array.from({ length: 4 }, () =>
      pool.runMeshPreparationTask(task())
    );
    monitor.concurrency = 3;
    monitor.changed();
    expect(FakeWorker.instances).toHaveLength(3);
    monitor.concurrency = 1;
    monitor.changed();
    expect(
      FakeWorker.instances.every(
        (worker) => !worker.terminate.mock.calls.length
      )
    ).toBe(true);
    FakeWorker.instances[0].reply();
    await jobs[0];
    FakeWorker.instances[1].reply();
    await jobs[1];
    expect(FakeWorker.instances[2].requests).toHaveLength(1);
    FakeWorker.instances[2].reply();
    await jobs[2];
    FakeWorker.instances[2].reply();
    await jobs[3];
    expect(FakeWorker.instances[2].requests).toHaveLength(2);
  });

  it("releases idle workers and rejects all pending work on disposal", async () => {
    const warm = pool.runMeshPreparationTask(task());
    FakeWorker.instances[0].reply();
    await warm;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
    const first = pool.runMeshPreparationTask(task());
    const second = pool.runMeshPreparationTask(task());
    const outcomes = Promise.allSettled([first, second]);
    pool.disposeMeshPreparationPool();
    expect(
      (await outcomes).every((result) => result.status === "rejected")
    ).toBe(true);
    expect(monitor.dispose).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    await expect(pool.runMeshPreparationTask(task())).rejects.toThrow(
      "disposed"
    );
  });
});
