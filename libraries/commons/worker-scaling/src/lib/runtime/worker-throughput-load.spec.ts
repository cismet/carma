import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkerThroughputMonitor } from "./worker-throughput-monitor";

/** Deterministic service model, not a hardware benchmark. Running jobs survive
 * resizing; throughput depends on actual occupancy, including draining workers. */
const simulateLoad = (
  ratesAt: (milliseconds: number) => readonly number[],
  sizes: readonly number[] = [1],
  durationMs = 180_000
) => {
  vi.useFakeTimers();
  let now = 0;
  let nextJob = 0;
  let completedWork = 0;
  const running: { work: number; remaining: number; startedAt: number }[] = [];
  const observations: {
    at: number;
    optimum: number;
    concurrency: number;
    phase: string;
  }[] = [];
  const monitor = createWorkerThroughputMonitor({
    hardwareConcurrency: 14,
    storageKey: "test",
    workloadVersion: "test",
    now: () => now,
    isHidden: () => false,
    onLimitChanged: () => undefined,
  });
  const refill = () => {
    while (running.length < monitor.concurrency) {
      const work = sizes[nextJob++ % sizes.length]!;
      running.push({ work, remaining: work, startedAt: now });
    }
    monitor.setLoad(running.length, 1000, true);
  };
  refill();
  for (now = 5; now <= durationMs; now += 5) {
    vi.advanceTimersByTime(5);
    const perJob = ratesAt(now)[running.length - 1]! / running.length / 200;
    for (const job of running) job.remaining -= perJob;
    const finished = running.filter((job) => job.remaining <= 0);
    for (const job of finished) {
      running.splice(running.indexOf(job), 1);
      completedWork += job.work;
      monitor.complete("cpu", job.work, true, job.startedAt);
      refill();
    }
    if (now % 1000 === 0)
      observations.push({
        at: now,
        optimum: monitor.state.optimum,
        concurrency: monitor.concurrency,
        phase: monitor.state.phase,
      });
  }
  const state = monitor.state;
  monitor.dispose();
  return { state, observations, completedWork };
};

afterEach(() => {
  vi.useRealTimers();
});

describe("throughput scaling under controlled service load", () => {
  const normalRates = [10, 19, 27, 33, 36, 32, 28, 23];
  const contendedRates = [10, 17, 14, 11, 9, 7, 6, 5];

  it("finds the throughput peak with jobs spanning measurement boundaries", () => {
    const result = simulateLoad(() => normalRates);
    expect(result.state.validated).toBe(true);
    expect(result.state.optimum).toBe(5);
    expect(result.state.concurrency).toBe(4);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("learns a lower optimum under sustained third-party contention", () => {
    const result = simulateLoad(
      (now) => (now < 60_000 ? normalRates : contendedRates),
      [1],
      240_000
    );
    expect(result.observations.some((entry) => entry.optimum === 5)).toBe(true);
    expect(result.state.optimum).toBe(2);
    expect(result.state.validated).toBe(true);
  });

  it("recovers throughput after contention ends", () => {
    const result = simulateLoad(
      (now) => (now < 60_000 ? contendedRates : normalRates),
      [1],
      240_000
    );
    expect(result.state.optimum).toBe(5);
    expect(result.state.validated).toBe(true);
  });

  it("keeps bounded progress for long heterogeneous jobs without leaking timers", () => {
    const result = simulateLoad(() => normalRates, [0.5, 1, 2, 8, 16]);
    expect(result.completedWork).toBeGreaterThan(1000);
    expect(
      result.observations.every(
        (entry) => entry.concurrency >= 1 && entry.concurrency <= 8
      )
    ).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
