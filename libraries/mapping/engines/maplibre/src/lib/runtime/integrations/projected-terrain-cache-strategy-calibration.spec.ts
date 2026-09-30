// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import {
  meshopt,
  VERSION,
  validate,
  deferred,
  cache,
  profileKey,
  profile,
  reusableRow,
  seed,
  timing,
  lockRequest,
  calibrateDerivedCacheStrategies,
  createProjectedTerrainCacheStrategy,
  type Row,
} from "./projected-terrain-cache-strategy.test-support";

describe("bounded worker-local cache calibration", () => {
  it("trials only real reuse candidates, peeks without hits and retains one probe at a time", async () => {
    const context = cache();
    const gpu = vi.fn(() => {
      throw new Error("Calibration must not access GPU resources");
    });
    Object.defineProperty(navigator, "gpu", { get: gpu, configurable: true });
    const entry = seed(context, 4);
    context.records.state.rows.unshift(
      { ...reusableRow(), key: "never-read", hits: 0 },
      { ...reusableRow(), key: "no-costs", restoreMs: undefined },
      { ...reusableRow(), key: "too-large", bytes: 32 * 1024 ** 2 + 1 }
    );
    timing(context);
    expect(await context.strategy.calibrate()).toBe(true);
    expect(lockRequest).toHaveBeenCalledWith(
      "carma-terrain-cache-calibration",
      { ifAvailable: true, mode: "exclusive" },
      expect.any(Function)
    );
    expect(context.records.get).toHaveBeenCalledOnce();
    expect(context.records.get).toHaveBeenCalledWith("real-terrain-hit", {
      touch: false,
    });
    expect(context.probes.put).toHaveBeenCalledTimes(3);
    expect(context.probes.get).toHaveBeenCalledTimes(18);
    for (const [, options] of context.probes.get.mock.calls)
      expect(options).toEqual({ touch: false });
    expect(context.probes.state.peakEntries).toBe(1);
    expect(context.probes.values.size).toBe(0);
    expect(context.records.values.get("real-terrain-hit")).toBe(entry);
    expect(context.records.put).not.toHaveBeenCalled();
    expect(gpu).not.toHaveBeenCalled();
    const auditCall = vi.mocked(calibrateDerivedCacheStrategies).mock.calls[0];
    expect(auditCall[2]).toBe(4);
    expect(auditCall[0].samplesMs).toEqual([10, 10, 10, 10, 10]);
    expect(auditCall[1].map((trial) => trial.samplesMs)).toEqual([
      [8, 8, 8, 8, 8],
      [9, 9, 9, 9, 9],
    ]);
    expect(context.profiles.values.get(profileKey())).toMatchObject({
      format: "binary",
      observedReuseCount: 4,
      scope: "worker-storage-restore",
    });
    expect(context.profiles.put.mock.calls[0][2].bytes).toBeGreaterThan(0);
  });

  it.each([
    ["median", [9.6, 9.6, 9.6, 9.6, 9.6], 1, "insufficient-median-saving"],
    ["p95", [8, 8, 8, 8, 9.6], 1, "insufficient-p95-saving"],
    ["observed amortization", [8, 8, 8, 8, 8], 3, "preparation-not-amortized"],
  ] as const)(
    "keeps native when %s does not pass the admission gate",
    async (_, samples, prepare, reason) => {
      const context = cache();
      const entry = seed(context, 1);
      timing(context, {
        binary: [1000, ...samples],
        meshopt: [1000, ...samples],
        prepare,
      });
      expect(await context.strategy.calibrate()).toBe(true);
      expect(context.profiles.values.get(profileKey())).toMatchObject({
        format: "native",
        observedReuseCount: 1,
        audit: {
          winnerId: null,
          candidates: [
            { admitted: false, admittedReason: reason },
            { admitted: false, admittedReason: reason },
          ],
        },
      });
      expect((await context.strategy.encode(entry, 256))?.payload).toBe(entry);
    }
  );

  it("retries a native preselection only when real observed reuse doubles", async () => {
    const context = cache();
    seed(context, 1);
    context.profiles.values.set(profileKey(), profile("native"));
    timing(context);
    expect(await context.strategy.calibrate()).toBe(false);
    expect(context.records.get).not.toHaveBeenCalled();
    context.records.state.rows[0].hits = 2;
    expect(await context.strategy.calibrate()).toBe(true);
    expect(context.probes.put).toHaveBeenCalledTimes(3);
    expect(await context.strategy.calibrate()).toBe(false);
    expect(context.probes.put).toHaveBeenCalledTimes(3);
  });

  it.each(["no-browser", "no-locks", "busy-lock", "aborted"] as const)(
    "does no experiment for %s",
    async (mode) => {
      const context = cache();
      seed(context);
      const controller = new AbortController();
      if (mode === "no-browser") vi.stubGlobal("navigator", undefined);
      else if (mode === "no-locks") vi.stubGlobal("navigator", {});
      else if (mode === "busy-lock")
        lockRequest.mockImplementationOnce(async (_name, _options, callback) =>
          callback(null)
        );
      else controller.abort();
      expect(await context.strategy.calibrate(controller.signal)).toBe(false);
      expect(context.records.inspect).not.toHaveBeenCalled();
      expect(context.probes.put).not.toHaveBeenCalled();
    }
  );

  it("prevents same-controller and cross-controller concurrent experiments", async () => {
    const context = cache();
    const inspected = deferred<Row[]>();
    context.records.inspect.mockImplementationOnce(() => inspected.promise);
    const first = context.strategy.calibrate();
    expect(await context.strategy.calibrate()).toBe(false);
    const other = createProjectedTerrainCacheStrategy(
      context.manager,
      "terrain-projected",
      VERSION,
      validate
    );
    expect(await other.calibrate()).toBe(false);
    expect(context.records.inspect).toHaveBeenCalledOnce();
    inspected.resolve([]);
    expect(await first).toBe(false);
    expect(await context.strategy.calibrate()).toBe(false);
    expect(context.records.inspect).toHaveBeenCalledTimes(2);
  });

  it("stops and cleans up when the shared budget refuses a probe", async () => {
    const context = cache();
    seed(context);
    context.probes.state.admit = false;
    expect(await context.strategy.calibrate()).toBe(false);
    expect(context.probes.put).toHaveBeenCalledTimes(1);
    expect(context.probes.get).not.toHaveBeenCalled();
    expect(context.probes.remove).toHaveBeenCalledWith("probe-1");
    expect(context.profiles.put).not.toHaveBeenCalled();
    expect(meshopt.encode).not.toHaveBeenCalled();
  });

  it("honors cancellation during the task yield before starting a probe read", async () => {
    const context = cache();
    seed(context);
    const controller = new AbortController();
    context.probes.state.onPut = () => {
      setTimeout(() => controller.abort(), 0);
    };
    expect(await context.strategy.calibrate(controller.signal)).toBe(false);
    expect(context.probes.get).not.toHaveBeenCalled();
    expect(context.probes.values.size).toBe(0);
    expect(context.profiles.put).not.toHaveBeenCalled();
  });

  it("does not write a codec result completed after cancellation", async () => {
    const context = cache();
    const entry = seed(context);
    timing(context);
    const started = deferred<void>();
    const encoded = deferred<unknown>();
    meshopt.encode.mockImplementationOnce(() => {
      started.resolve();
      return encoded.promise;
    });
    const controller = new AbortController();
    const calibration = context.strategy.calibrate(controller.signal);
    await started.promise;
    controller.abort();
    encoded.resolve({ meshFixture: entry });
    expect(await calibration).toBe(false);
    expect(context.probes.put).toHaveBeenCalledTimes(2);
    expect(context.probes.values.size).toBe(0);
    expect(context.profiles.put).not.toHaveBeenCalled();
  });

  it("stops after a cancelled storage read and releases the calibration slot", async () => {
    const context = cache();
    seed(context);
    const controller = new AbortController();
    context.probes.state.onGet = () => controller.abort();
    expect(await context.strategy.calibrate(controller.signal)).toBe(false);
    expect(context.probes.get).toHaveBeenCalledOnce();
    expect(context.probes.values.size).toBe(0);
    expect(context.profiles.put).not.toHaveBeenCalled();
    context.records.state.rows = [];
    expect(await context.strategy.calibrate()).toBe(false);
    expect(context.records.inspect).toHaveBeenCalledTimes(2);
  });

  it("rejects byte-parity mismatches and removes speculative data", async () => {
    const context = cache();
    const entry = seed(context);
    timing(context);
    meshopt.decode.mockImplementationOnce(async () => {
      const changed = structuredClone(entry);
      changed.tile.u[1] = 0; // -0 and +0 must not be treated as identical bytes.
      return changed;
    });
    expect(await context.strategy.calibrate()).toBe(false);
    expect(context.probes.values.size).toBe(0);
    expect(context.profiles.put).not.toHaveBeenCalled();
  });
});
