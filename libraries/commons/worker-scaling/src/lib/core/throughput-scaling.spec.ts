import { describe, expect, it } from "vitest";
import {
  advanceThroughputScaling,
  createThroughputScalingState,
  getHeadroomConcurrency,
  getWorkerProbeLimit,
  relieveWorkerPressure,
  SCALING_PHASE,
} from "./throughput-scaling";
import {
  encodeWorkerCalibration,
  readWorkerCalibration,
} from "./worker-calibration";

const windowAt = (throughput: number, kind = "cpu") => ({
  durationMs: 500,
  completedJobs: 20,
  workByKind: { [kind]: throughput / 2 },
});
const converge = (
  rates: number[],
  initial = createThroughputScalingState(rates.length),
  start = 0
) => {
  let state = initial;
  let now = start;
  const visited: number[] = [];
  for (let index = 0; index < 200; index += 1) {
    now += 500;
    visited.push(state.concurrency);
    state = advanceThroughputScaling(
      state,
      windowAt(rates[state.concurrency - 1]!),
      now
    );
    if (state.phase === SCALING_PHASE.CRUISE && state.resumeAt > now)
      return { state, visited, now };
  }
  throw new Error("Controller did not settle");
};

describe("absolute pool throughput scaling", () => {
  it("accepts more total throughput even when each worker becomes slower", () => {
    const { state, visited } = converge([100, 180, 245, 285, 260, 230]);
    expect(state.optimum).toBe(4);
    expect(state.concurrency).toBe(3);
    expect(state.validated).toBe(true);
    expect(visited).toContain(5);
    expect(visited).not.toContain(6);
  });
  it("backs off a flat throughput plateau to the smallest useful pool", () => {
    const { state } = converge([100, 100, 100, 100]);
    expect(state.optimum).toBe(1);
    expect(state.concurrency).toBe(1);
  });
  it("relearns a lower optimum under outside contention, then recovers", () => {
    const first = converge([100, 180, 245, 285, 260, 230]);
    const loaded = converge(
      [80, 140, 110, 100, 90, 80],
      first.state,
      first.state.resumeAt
    );
    expect(loaded.state.optimum).toBe(2);
    const recovered = converge(
      [100, 180, 245, 285, 260, 230],
      loaded.state,
      loaded.state.resumeAt
    );
    expect(recovered.state.optimum).toBe(4);
  });
  it("does not accept a faster job mixture as a worker-count improvement", () => {
    let state = createThroughputScalingState(4);
    for (let i = 0; i < 9; i += 1) {
      state = advanceThroughputScaling(
        state,
        windowAt(
          i >= 3 && i < 6 ? 300 : 100,
          i >= 3 && i < 6 ? "different" : "cpu"
        ),
        i * 500
      );
    }
    expect(state.optimum).toBe(2);
    expect(state.validated).toBe(false);
    expect(state.phase).toBe(SCALING_PHASE.CRUISE);
  });
  it("rejects host drift in the confirming A window", () => {
    let state = createThroughputScalingState(4);
    for (let i = 0; i < 9; i += 1)
      state = advanceThroughputScaling(
        state,
        windowAt(i < 3 ? 100 : 250),
        i * 500
      );
    expect(state.optimum).toBe(2);
    expect(state.validated).toBe(false);
  });
  it("ignores too-short or invalid samples and backs off noisy windows", () => {
    const initial = createThroughputScalingState(4);
    expect(
      advanceThroughputScaling(
        initial,
        { ...windowAt(100), durationMs: 20 },
        20
      )
    ).toBe(initial);
    expect(advanceThroughputScaling(initial, windowAt(NaN), 500)).toBe(initial);
    const noisy = [100, 200, 100].reduce(
      (state, rate, index) =>
        advanceThroughputScaling(state, windowAt(rate), index * 500),
      initial
    );
    expect(noisy.phase).toBe(SCALING_PHASE.CRUISE);
    expect(noisy.validated).toBe(false);
  });
  it("applies immediate pressure relief without replacing learned hardware calibration", () => {
    const state = createThroughputScalingState(8, 6);
    expect(relieveWorkerPressure(state, 100).concurrency).toBe(3);
    expect(relieveWorkerPressure(state, 100, true).concurrency).toBe(1);
    expect(relieveWorkerPressure(state, 100).optimum).toBe(6);
    expect(
      relieveWorkerPressure({ ...state, concurrency: 7 }, 100).concurrency
    ).toBe(4);
  });
  it.each([
    [1, 1],
    [2, 1],
    [4, 3],
    [16, 8],
    [NaN, 2],
  ])("bounds probes for hardware count %s", (hardware, expected) => {
    expect(getWorkerProbeLimit(hardware)).toBe(expected);
  });
  it("rounds worker headroom conservatively", () => {
    expect([1, 2, 3, 4, 5, 8].map(getHeadroomConcurrency)).toEqual([
      1, 1, 2, 3, 4, 6,
    ]);
  });
});

describe("optional calibration", () => {
  it("roundtrips a versioned count, rejecting changed workload/hardware/age", () => {
    const raw = encodeWorkerCalibration(4, "v1", 8, 1000);
    expect(readWorkerCalibration(raw, "v1", 8, 2000)).toBe(4);
    expect(readWorkerCalibration(raw, "v2", 8, 2000)).toBeUndefined();
    expect(readWorkerCalibration(raw, "v1", 4, 2000)).toBeUndefined();
    expect(readWorkerCalibration(raw, "v1", 8, 1e9)).toBeUndefined();
    expect(readWorkerCalibration(raw, "v1", 8, 0)).toBeUndefined();
  });
  it.each(["broken", "null", "[]", '{"optimum":999}', '{"optimum":-1}'])(
    "ignores invalid storage %s",
    (raw) => {
      expect(readWorkerCalibration(raw, "v1", 8, 2000)).toBeUndefined();
    }
  );
});
