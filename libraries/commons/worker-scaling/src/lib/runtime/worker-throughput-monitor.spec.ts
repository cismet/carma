import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkerThroughputMonitor } from "./worker-throughput-monitor";

afterEach(() => {
  vi.useRealTimers();
});

describe("worker pool instrumentation", () => {
  it("ignores unsaturated and unwarmed intervals, stops all timers at idle", () => {
    vi.useFakeTimers();
    let now = 0;
    const monitor = createWorkerThroughputMonitor({
      hardwareConcurrency: 8,
      storageKey: "test",
      workloadVersion: "test",
      now: () => now,
      onLimitChanged: vi.fn(),
    });
    monitor.setLoad(2, 10, false);
    for (let i = 0; i < 100; i += 1) {
      now += 50;
      monitor.complete("cpu", 1, true, now - 1);
    }
    expect(monitor.concurrency).toBe(2);
    monitor.setLoad(2, 0, true);
    for (let i = 0; i < 100; i += 1) {
      now += 50;
      monitor.complete("cpu", 1, true, now - 1);
    }
    expect(monitor.concurrency).toBe(2);
    monitor.setLoad(0, 0, true);
    expect(vi.getTimerCount()).toBe(0);
    monitor.dispose();
  });
  it("measures completed work over wall time, excluding cancelled/error results", () => {
    vi.useFakeTimers();
    let now = 0;
    const changed = vi.fn();
    const monitor = createWorkerThroughputMonitor({
      hardwareConcurrency: 8,
      storageKey: "test",
      workloadVersion: "test",
      now: () => now,
      onLimitChanged: changed,
    });
    monitor.setLoad(2, 100, true);
    for (let i = 0; i < 100; i += 1) {
      now += 50;
      monitor.complete("cpu", 1, false, now - 1);
    }
    expect(changed).not.toHaveBeenCalled();
    for (let i = 0; i < 24; i += 1) {
      now += 50;
      monitor.complete("cpu", 1, true, now - 1);
    }
    expect(monitor.concurrency).toBe(3);
    expect(changed).toHaveBeenCalledOnce();
    monitor.dispose();
  });
  it("backs off delayed main-thread ticks and a hidden tab", () => {
    vi.useFakeTimers();
    let now = 0;
    let hidden = false;
    const monitor = createWorkerThroughputMonitor({
      hardwareConcurrency: 8,
      storageKey: "test",
      workloadVersion: "test",
      now: () => now,
      isHidden: () => hidden,
      onLimitChanged: vi.fn(),
    });
    monitor.setLoad(2, 100, true);
    now = 200;
    vi.advanceTimersByTime(100);
    expect(monitor.concurrency).toBe(1);
    hidden = true;
    now = 300;
    vi.advanceTimersByTime(100);
    expect(monitor.concurrency).toBe(1);
    monitor.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("continues when localStorage throws", () => {
    const monitor = createWorkerThroughputMonitor({
      hardwareConcurrency: 8,
      storageKey: "test",
      workloadVersion: "test",
      onLimitChanged: vi.fn(),
      storage: {
        getItem: () => {
          throw new Error("denied");
        },
        setItem: () => {
          throw new Error("denied");
        },
      },
    });
    expect(monitor.concurrency).toBe(2);
    monitor.dispose();
  });

  it("starts a hidden tab at one worker, including a stored warm-start hint", () => {
    const monitor = createWorkerThroughputMonitor({
      hardwareConcurrency: 8,
      storageKey: "test",
      workloadVersion: "test",
      onLimitChanged: vi.fn(),
      isHidden: () => true,
      wallNow: () => 1000,
      storage: {
        getItem: () =>
          JSON.stringify({
            version: "test",
            hardwareConcurrency: 8,
            optimum: 6,
            savedAt: 1000,
          }),
        setItem: vi.fn(),
      },
    });
    expect(monitor.concurrency).toBe(1);
    monitor.dispose();
  });

  it("persists only a validated optimum and resumes with headroom", () => {
    vi.useFakeTimers();
    let now = 0;
    let saved: string | null = null;
    const storage = {
      getItem: () => saved,
      setItem: vi.fn((_key: string, value: string) => {
        saved = value;
      }),
    };
    const options = {
      hardwareConcurrency: 8,
      storageKey: "test",
      workloadVersion: "test",
      now: () => now,
      wallNow: () => 1000,
      storage,
    };
    const monitor = createWorkerThroughputMonitor({
      ...options,
      onLimitChanged: () => monitor.setLoad(monitor.concurrency, 100, true),
    });
    monitor.setLoad(2, 100, true);
    const rates = [100, 180, 245, 285, 260, 230, 200];
    for (let index = 0; index < 400; index++) {
      now += 50;
      monitor.complete(
        "cpu",
        rates[monitor.concurrency - 1]! / 20,
        true,
        now - 1
      );
    }
    expect(storage.setItem).toHaveBeenCalledOnce();
    expect(JSON.parse(saved!).optimum).toBe(4);
    monitor.dispose();
    const restored = createWorkerThroughputMonitor({
      ...options,
      onLimitChanged: vi.fn(),
    });
    expect(restored.concurrency).toBe(3);
    expect(restored.state.optimum).toBe(4);
    restored.dispose();
  });

  it("discards carried-in jobs and incomplete trials across idle bursts", () => {
    vi.useFakeTimers();
    let now = 100;
    const monitor = createWorkerThroughputMonitor({
      hardwareConcurrency: 8,
      storageKey: "test",
      workloadVersion: "test",
      now: () => now,
      onLimitChanged: vi.fn(),
    });
    monitor.setLoad(2, 100, true);
    for (let index = 0; index < 30; index++) {
      now += 50;
      monitor.complete("cpu", 100, true, 0);
    }
    expect(monitor.state.windows).toHaveLength(0);
    for (let index = 0; index < 18; index++) {
      now += 50;
      monitor.complete("cpu", 1, true, now - 1);
    }
    expect(monitor.state.windows).toHaveLength(2);
    monitor.setLoad(0, 0, true);
    now += 3_600_000;
    expect(monitor.state.windows).toHaveLength(0);
    expect(monitor.state.baseline).toBeUndefined();
    expect(monitor.state.probe).toBeUndefined();
    expect(monitor.state.validated).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    monitor.dispose();
  });
});
