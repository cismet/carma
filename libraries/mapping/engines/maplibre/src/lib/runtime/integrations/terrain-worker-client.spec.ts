import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TerrainWorkerTask } from "./terrain-worker-task";

class TestWorker {
  static instances: TestWorker[] = [];
  static failAfter = Infinity;
  onmessage?: (event: unknown) => void;
  onerror?: (event: unknown) => void;
  onmessageerror?: () => void;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() {
    if (TestWorker.instances.length >= TestWorker.failAfter)
      throw new Error("worker capacity exhausted");
    TestWorker.instances.push(this);
  }
  respond() {
    this.onmessage?.({ data: { result: { kind: "decode" } } });
  }
}
const task = () => ({
  kind: "decode" as const,
  blob: new Blob(),
  id: { level: 1, x: 0, y: 0 },
  segments: 512,
  error: 1,
});

const optionalCacheTasks: TerrainWorkerTask[] = [
  { kind: "read-cache", key: "cached" },
  { kind: "cache-cost", key: "cached", restoreMs: 1 },
  {
    kind: "write-cache", key: "cached", bytes: 0,
    entry: {
      geometry: null,
      reliefVertexMask: new Uint8Array(),
      tile: {
        id: { level: 1, x: 0, y: 0 },
        bounds: { west: 0, south: 0, east: 1, north: 1 },
        u: new Float32Array(), v: new Float32Array(), heightMeters: new Float32Array(),
        indices: new Uint32Array(), westIndices: new Uint32Array(),
        southIndices: new Uint32Array(), eastIndices: new Uint32Array(), northIndices: new Uint32Array(),
        minimumHeightMeters: 0, maximumHeightMeters: 0, childTileMask: 0,
        geometricErrorMeters: 0, byteLength: 0,
      },
    },
  },
];

describe("terrain worker queue", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    TestWorker.instances = [];
    TestWorker.failAfter = Infinity;
    vi.stubGlobal("Worker", TestWorker);
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("bounds CPU concurrency to two real worker slots and retires idle workers", async () => {
    // Test capacity independently of wall-clock scheduling under a busy runner.
    vi.spyOn(performance, "now").mockReturnValue(0);
    const { runTerrainWorkerTask } = await import("./terrain-worker-client");
    const pending = [
      runTerrainWorkerTask(task()),
      runTerrainWorkerTask(task()),
      runTerrainWorkerTask(task()),
    ];
    expect(TestWorker.instances).toHaveLength(2);
    expect(TestWorker.instances[0].postMessage).toHaveBeenCalledTimes(1);
    TestWorker.instances[0].respond();
    expect(TestWorker.instances[0].postMessage).toHaveBeenCalledTimes(2);
    TestWorker.instances[1].respond();
    TestWorker.instances[0].respond();
    await Promise.all(pending);
    vi.advanceTimersByTime(30_000);
    for (const worker of TestWorker.instances)
      expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("rejects worker failures without silently doing the conversion on the main thread", async () => {
    const { runTerrainWorkerTask } = await import("./terrain-worker-client");
    const pending = runTerrainWorkerTask(task());
    const rejection = expect(pending).rejects.toThrow("broken worker");
    TestWorker.instances[0].onerror?.({ message: "broken worker" });
    await rejection;
    expect(TestWorker.instances[0].terminate).toHaveBeenCalledOnce();
  });

  it("cooperatively cancels calibration without reusing its still-running slot", async () => {
    const { runTerrainWorkerTask, disposeTerrainWorkerPool } = await import("./terrain-worker-client");
    const controller = new AbortController();
    const pending = runTerrainWorkerTask({kind: "calibrate-cache"}, controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({name: "AbortError"});
    const worker = TestWorker.instances[0];
    controller.abort();
    expect(worker.postMessage).toHaveBeenLastCalledWith({kind: "cancel-current"});
    expect(worker.terminate).not.toHaveBeenCalled();
    const visible = runTerrainWorkerTask(task());
    expect(TestWorker.instances).toHaveLength(2);
    expect(worker.postMessage).toHaveBeenCalledTimes(2);
    worker.respond();
    TestWorker.instances[1].respond();
    await rejected;
    await visible;
    disposeTerrainWorkerPool();
  });

  it.each(optionalCacheTasks)("releases an aborted $kind worker immediately for queued terrain", async (cacheTask) => {
    vi.spyOn(performance, "now").mockReturnValue(0);
    const { runTerrainWorkerTask, disposeTerrainWorkerPool } = await import("./terrain-worker-client");
    const busy = runTerrainWorkerTask(task());
    const controller = new AbortController();
    const optional = runTerrainWorkerTask(cacheTask, controller.signal);
    const rejected = expect(optional).rejects.toMatchObject({ name: "TimeoutError" });
    const foreground = runTerrainWorkerTask(task());
    const settled = vi.fn();
    void foreground.then(settled);
    expect(TestWorker.instances).toHaveLength(2);
    const cacheWorker = TestWorker.instances[1];
    const lateReply = cacheWorker.onmessage!;
    controller.abort(new DOMException("Cache deadline", "TimeoutError"));
    await rejected;

    expect(cacheWorker.terminate).toHaveBeenCalledOnce();
    expect(TestWorker.instances[0].terminate).not.toHaveBeenCalled();
    expect(TestWorker.instances).toHaveLength(3);
    expect(TestWorker.instances[2].postMessage).toHaveBeenCalledOnce();
    expect(TestWorker.instances[2].postMessage).toHaveBeenCalledWith(task());
    expect(cacheWorker.onmessage).toBeNull();
    expect(cacheWorker.onerror).toBeNull();
    expect(cacheWorker.onmessageerror).toBeNull();
    lateReply({ data: { result: { kind: "read-cache", entry: null } } });
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    TestWorker.instances[0].respond();
    TestWorker.instances[2].respond();
    await Promise.all([busy, foreground]);
    disposeTerrainWorkerPool();
    expect(cacheWorker.terminate).toHaveBeenCalledOnce();
  });

  it("removes an aborted queued cache read without terminating unrelated terrain workers", async () => {
    vi.spyOn(performance, "now").mockReturnValue(0);
    const { runTerrainWorkerTask, disposeTerrainWorkerPool } = await import("./terrain-worker-client");
    const running = [runTerrainWorkerTask(task()), runTerrainWorkerTask(task())];
    const controller = new AbortController();
    const optional = runTerrainWorkerTask({ kind: "read-cache", key: "queued" }, controller.signal);
    const rejected = expect(optional).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await rejected;
    expect(TestWorker.instances).toHaveLength(2);
    for (const worker of TestWorker.instances) {
      expect(worker.terminate).not.toHaveBeenCalled();
      worker.respond();
      expect(worker.postMessage).toHaveBeenCalledOnce();
    }
    await Promise.all(running);
    disposeTerrainWorkerPool();
  });

  it.each([...optionalCacheTasks, { kind: "calibrate-cache" } as const])(
    "preempts one $kind slot when optional I/O fills the pool and terrain becomes ready",
    async (cacheTask) => {
      vi.spyOn(performance, "now").mockReturnValue(0);
      const { runTerrainWorkerTask, disposeTerrainWorkerPool } = await import("./terrain-worker-client");
      const offers = [runTerrainWorkerTask(cacheTask), runTerrainWorkerTask(cacheTask)];
      const settledOffers = Promise.allSettled(offers);
      const victim = TestWorker.instances[0];
      const lateReply = victim.onmessage!;
      // Even a higher-priority queued cache read must not consume the slot
      // specifically reclaimed for the already downloaded foreground terrain.
      const cachedRead = runTerrainWorkerTask({ kind: "read-cache", key: "queued" });
      const foreground = runTerrainWorkerTask(task());
      const settledForeground = vi.fn();
      void foreground.then(settledForeground);
      expect(TestWorker.instances).toHaveLength(3);
      expect(victim.terminate).toHaveBeenCalledOnce();
      expect(TestWorker.instances[1].terminate).not.toHaveBeenCalled();
      expect(TestWorker.instances[2].postMessage).toHaveBeenCalledWith(task());
      lateReply({ data: { result: { kind: "read-cache", entry: null } } });
      await Promise.resolve();
      expect(settledForeground).not.toHaveBeenCalled();
      TestWorker.instances[2].respond();
      await foreground;
      expect(TestWorker.instances[2].postMessage).toHaveBeenLastCalledWith({ kind: "read-cache", key: "queued" });
      TestWorker.instances[1].respond();
      TestWorker.instances[2].respond();
      await cachedRead;
      const offersResult = await settledOffers;
      expect(offersResult.map((result) => result.status)).toEqual(["rejected", "fulfilled"]);
      expect(offersResult[0]).toMatchObject({ reason: { name: "AbortError" } });
      disposeTerrainWorkerPool();
      expect(victim.terminate).toHaveBeenCalledOnce();
    }
  );

  it("never preempts terrain while the other slot performs optional cache I/O", async () => {
    vi.spyOn(performance, "now").mockReturnValue(0);
    const { runTerrainWorkerTask, disposeTerrainWorkerPool } = await import("./terrain-worker-client");
    const busy = runTerrainWorkerTask(task());
    const optional = runTerrainWorkerTask(optionalCacheTasks[2]);
    const next = runTerrainWorkerTask(task());
    expect(TestWorker.instances).toHaveLength(2);
    expect(TestWorker.instances.every((worker) => worker.terminate.mock.calls.length === 0)).toBe(true);
    TestWorker.instances[0].respond();
    TestWorker.instances[0].respond();
    TestWorker.instances[1].respond();
    await Promise.all([busy, optional, next]);
    disposeTerrainWorkerPool();
  });

  it("yields between expensive input-copy bursts without dropping queued work", async () => {
    const clock = vi.spyOn(performance, "now").mockReturnValue(0);
    const { runTerrainWorkerTask } = await import("./terrain-worker-client");
    const first = runTerrainWorkerTask(task());
    const second = runTerrainWorkerTask(task());
    const worker = TestWorker.instances[0];
    worker.postMessage.mockImplementationOnce(() => clock.mockReturnValue(3));
    const third = runTerrainWorkerTask(task());
    const fourth = runTerrainWorkerTask(task());
    worker.respond();
    expect(worker.postMessage).toHaveBeenCalledTimes(2);
    TestWorker.instances[1].respond();
    // Completion cannot bypass the scheduled yield, even with a free slot.
    expect(TestWorker.instances[1].postMessage).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(TestWorker.instances[1].postMessage).toHaveBeenCalledTimes(2);
    worker.respond();
    TestWorker.instances[1].respond();
    await Promise.all([first, second, third, fourth]);
  });

  it("prepares and stitches ready tiles before decoding the rest of a download burst", async () => {
    const { runTerrainWorkerTask } = await import("./terrain-worker-client");
    const pending = Array.from({ length: 5 }, () =>
      runTerrainWorkerTask(task())
    );
    pending.push(runTerrainWorkerTask({ kind: "stitch", inputs: [] }));
    const partition = {
      kind: "partition" as const,
      positions: new Float32Array(),
      indices: new Uint16Array(),
      heights: new Float32Array(),
      noDataHeightMeters: -9999,
    };
    pending.push(runTerrainWorkerTask(partition));
    const worker = TestWorker.instances[0];
    worker.respond();
    expect(worker.postMessage).toHaveBeenLastCalledWith(partition);
    worker.respond();
    expect(worker.postMessage).toHaveBeenLastCalledWith({
      kind: "stitch",
      inputs: [],
    });
    for (let index = 0; index < 4; index += 1) worker.respond();
    TestWorker.instances[1].respond();
    await Promise.all(pending);
  });

  it("discards completed results after runtime cancellation", async () => {
    const { runTerrainWorkerTask } = await import("./terrain-worker-client");
    const controller = new AbortController();
    const pending = runTerrainWorkerTask(task(), controller.signal);
    controller.abort(new Error("disposed"));
    const rejection = expect(pending).rejects.toThrow("disposed");
    TestWorker.instances[0].respond();
    await rejection;
  });

  it("disposes running and queued jobs, scaling and callbacks without reviving the pool", async () => {
    const scalingModule = await import("./terrain-worker-scaling");
    const createScaling = vi.spyOn(scalingModule, "createTerrainWorkerScaling");
    const { runTerrainWorkerTask, disposeTerrainWorkerPool } = await import(
      "./terrain-worker-client"
    );
    const controller = new AbortController();
    const removeAbortListener = vi.spyOn(
      controller.signal,
      "removeEventListener"
    );
    const pending = Array.from({ length: 4 }, () =>
      runTerrainWorkerTask(task(), controller.signal)
    );
    const settled = Promise.allSettled(pending);
    const workers = [...TestWorker.instances];
    const lateCallbacks = workers.map((worker) => ({
      message: worker.onmessage!,
      error: worker.onerror!,
      messageError: worker.onmessageerror!,
    }));
    const disposeScaling = vi.spyOn(
      createScaling.mock.results[0].value,
      "dispose"
    );
    expect(workers).toHaveLength(2);
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    disposeTerrainWorkerPool();
    disposeTerrainWorkerPool();
    const results = await settled;
    expect(results).toHaveLength(4);
    for (const result of results) {
      expect(result.status).toBe("rejected");
      if (result.status === "rejected") {
        expect(result.reason).toEqual(
          new Error("Terrain worker pool was disposed")
        );
      }
    }
    expect(disposeScaling).toHaveBeenCalledOnce();
    expect(removeAbortListener).toHaveBeenCalledTimes(4);
    expect(vi.getTimerCount()).toBe(0);
    for (const worker of workers) {
      expect(worker.terminate).toHaveBeenCalledOnce();
      expect(worker.onmessage).toBeNull();
      expect(worker.onerror).toBeNull();
      expect(worker.onmessageerror).toBeNull();
      expect(worker.postMessage).toHaveBeenCalledOnce();
    }

    for (const callback of lateCallbacks) {
      expect(() => {
        callback.message({ data: { result: { kind: "decode" } } });
        callback.error({ message: "late worker error" });
        callback.messageError();
      }).not.toThrow();
    }
    controller.abort();
    vi.advanceTimersByTime(60_000);
    await expect(runTerrainWorkerTask(task())).rejects.toThrow(
      "Terrain worker pool was disposed"
    );
    expect(TestWorker.instances).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
    for (const worker of workers)
      expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("clears idle worker retirement timers when disposing the module pool", async () => {
    const { runTerrainWorkerTask, disposeTerrainWorkerPool } = await import(
      "./terrain-worker-client"
    );
    const pending = runTerrainWorkerTask(task());
    const worker = TestWorker.instances[0];
    worker.respond();
    await pending;
    expect(vi.getTimerCount()).toBe(1);
    disposeTerrainWorkerPool();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("starts a new module pool while disposed module references remain unusable", async () => {
    const oldModule = await import("./terrain-worker-client");
    const oldPending = oldModule.runTerrainWorkerTask(task());
    const rejected = expect(oldPending).rejects.toThrow(
      "Terrain worker pool was disposed"
    );
    const lateMessage = TestWorker.instances[0].onmessage!;
    oldModule.disposeTerrainWorkerPool();
    await rejected;

    vi.resetModules();
    const newModule = await import("./terrain-worker-client");
    const next = newModule.runTerrainWorkerTask(task());
    expect(TestWorker.instances).toHaveLength(2);
    lateMessage({ data: { result: { kind: "decode" } } });
    await expect(oldModule.runTerrainWorkerTask(task())).rejects.toThrow(
      "Terrain worker pool was disposed"
    );
    expect(TestWorker.instances[1].terminate).not.toHaveBeenCalled();
    TestWorker.instances[1].respond();
    await expect(next).resolves.toEqual({ kind: "decode" });
    newModule.disposeTerrainWorkerPool();
    expect(vi.getTimerCount()).toBe(0);
    for (const worker of TestWorker.instances)
      expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("probes a third real worker only after warmed, saturated throughput windows", async () => {
    let now = 0;
    vi.stubGlobal("performance", { now: () => now });
    vi.stubGlobal("navigator", { hardwareConcurrency: 8 });
    const { runTerrainWorkerTask } = await import("./terrain-worker-client");
    const controller = new AbortController();
    const pending = Array.from({ length: 100 }, () =>
      runTerrainWorkerTask(task(), controller.signal).catch(() => undefined)
    );
    TestWorker.instances[0].respond();
    TestWorker.instances[1].respond();
    for (let index = 0; index < 24; index += 1) {
      now += 50;
      vi.advanceTimersByTime(50);
      TestWorker.instances[index % 2].respond();
    }
    expect(TestWorker.instances).toHaveLength(3);
    controller.abort();
    for (const worker of TestWorker.instances) worker.respond();
    await Promise.all(pending);
    vi.advanceTimersByTime(30_000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps queued work on healthy workers if creating an extra worker fails", async () => {
    let now = 0;
    vi.stubGlobal("performance", { now: () => now });
    vi.stubGlobal("navigator", { hardwareConcurrency: 8 });
    TestWorker.failAfter = 2;
    const { runTerrainWorkerTask } = await import("./terrain-worker-client");
    const pending = Array.from({ length: 40 }, () =>
      runTerrainWorkerTask(task())
    );
    TestWorker.instances[0].respond();
    TestWorker.instances[1].respond();
    for (let index = 0; index < 24; index++) {
      now += 50;
      vi.advanceTimersByTime(50);
      TestWorker.instances[index % 2].respond();
    }
    // Capacity backoff leaves both running jobs intact, then drains on one slot.
    expect(TestWorker.instances).toHaveLength(2);
    TestWorker.instances[0].respond();
    for (let index = 0; index < 13; index++) TestWorker.instances[1].respond();
    await expect(Promise.all(pending)).resolves.toHaveLength(40);
    vi.advanceTimersByTime(30_000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shrinks on UI pressure without terminating busy jobs or losing queued work", async () => {
    let now = 0;
    vi.stubGlobal("performance", { now: () => now });
    vi.stubGlobal("navigator", { hardwareConcurrency: 8 });
    const { runTerrainWorkerTask } = await import("./terrain-worker-client");
    const pending = Array.from({ length: 4 }, () =>
      runTerrainWorkerTask(task())
    );
    now = 200;
    vi.advanceTimersByTime(100);
    expect(
      TestWorker.instances.every(
        (worker) => worker.terminate.mock.calls.length === 0
      )
    ).toBe(true);
    TestWorker.instances[0].respond();
    expect(TestWorker.instances[0].terminate).toHaveBeenCalledOnce();
    expect(TestWorker.instances[1].postMessage).toHaveBeenCalledTimes(1);
    TestWorker.instances[1].respond();
    expect(TestWorker.instances[1].postMessage).toHaveBeenCalledTimes(2);
    TestWorker.instances[1].respond();
    TestWorker.instances[1].respond();
    await Promise.all(pending);
    vi.advanceTimersByTime(30_000);
    expect(vi.getTimerCount()).toBe(0);
  });
});
