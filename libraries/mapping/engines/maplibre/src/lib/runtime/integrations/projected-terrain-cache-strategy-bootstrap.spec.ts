// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import {
  NOW,
  source,
  cache,
  profileKey,
  profile,
  seed,
  formatOf,
  timing,
  calibrateDerivedCacheStrategies,
} from "./projected-terrain-cache-strategy.test-support";

describe("rejected native-hit calibration bootstrap", () => {
  it("rejects slow native, profiles from one real hit, then admits faster binary against source", async () => {
    const context = cache();
    const entry = seed(context, 1);
    context.records.state.rows[0].recomputeMs = 9;
    timing(context);

    expect(await context.strategy.updateCosts("real-terrain-hit", 10)).toBe(
      false
    );
    expect(context.records.values.size).toBe(0);
    expect(context.records.get).toHaveBeenCalledWith("real-terrain-hit", {
      touch: false,
    });
    expect(
      (await context.strategy.inspectProfiles()).pendingSeed?.observedReuseCount
    ).toBe(1);
    expect(await context.strategy.calibrate()).toBe(true);
    expect(context.records.get).toHaveBeenCalledOnce();
    expect(vi.mocked(calibrateDerivedCacheStrategies).mock.calls[0][2]).toBe(1);
    expect((await context.strategy.inspectProfiles()).pendingSeed).toBeNull();
    expect(context.profiles.values.get(profileKey())).toMatchObject({
      format: "binary",
    });

    const encoded = await context.strategy.encode(entry, 256);
    expect(formatOf(encoded?.payload)).toBe("binary");
    await context.records.put("fresh", encoded!.payload, {
      bytes: encoded!.bytes,
      recomputeMs: 9,
    });
    await context.records.get("fresh"); // The next real foreground hit, not a trial.
    expect(await context.strategy.updateCosts("fresh", 8)).toBe(true);
    expect(context.records.values.has("fresh")).toBe(true);
    expect((await context.strategy.inspectProfiles()).pendingSeed).toBeNull();
    expect(context.probes.state.peakEntries).toBe(1);
  });

  it("includes the measured seed read/decode cost in amortization", async () => {
    const context = cache();
    seed(context, 1);
    context.records.state.rows[0].recomputeMs = 9;
    timing(context, { seedReadMs: 3 });
    await context.strategy.updateCosts("real-terrain-hit", 10);
    expect(await context.strategy.calibrate()).toBe(true);
    expect(context.profiles.values.get(profileKey())).toMatchObject({
      format: "native",
      audit: {
        candidates: [
          { prepareMs: 4, admittedReason: "preparation-not-amortized" },
          { prepareMs: 4, admittedReason: "preparation-not-amortized" },
        ],
      },
    });
    expect(context.records.values.size).toBe(0);
  });

  it.each(["no-hit", "unknown-source", "oversized", "beneficial"] as const)(
    "does not clone a seed for %s",
    async (mode) => {
      const context = cache();
      seed(context, mode === "no-hit" ? 0 : 1);
      const row = context.records.state.rows[0];
      row.recomputeMs =
        mode === "unknown-source" ? undefined : mode === "beneficial" ? 100 : 9;
      if (mode === "oversized") row.bytes = 32 * 1024 ** 2 + 1;
      await context.strategy.updateCosts("real-terrain-hit", 10);
      expect(context.records.get).not.toHaveBeenCalled();
      expect((await context.strategy.inspectProfiles()).pendingSeed).toBeNull();
      expect(context.records.updateCosts).toHaveBeenCalledWith(
        "real-terrain-hit",
        { restoreMs: 10 }
      );
    }
  );

  it("bounds the decoded buffer bytes, not merely the compressed record size", async () => {
    const context = cache();
    const entry = seed(context);
    context.records.state.rows[0].recomputeMs = 9;
    context.records.values.set("real-terrain-hit", {
      ...entry,
      reliefVertexMask: new Uint8Array(32 * 1024 ** 2 + 1),
    });
    await context.strategy.updateCosts("real-terrain-hit", 10);
    expect((await context.strategy.inspectProfiles()).pendingSeed).toBeNull();
    expect(context.records.values.size).toBe(0);
  });

  it.each(["expired", "disposed"] as const)(
    "releases a %s seed",
    async (mode) => {
      const context = cache();
      seed(context);
      context.records.state.rows[0].recomputeMs = 9;
      await context.strategy.updateCosts("real-terrain-hit", 10);
      if (mode === "expired")
        vi.spyOn(Date, "now").mockReturnValue(NOW + 60_001);
      else context.strategy.dispose();
      expect(await context.strategy.calibrate()).toBe(false);
      expect((await context.strategy.inspectProfiles()).pendingSeed).toBeNull();
      expect(context.probes.put).not.toHaveBeenCalled();
    }
  );

  it("keeps at most one pending seed across producer strategies", async () => {
    const first = cache();
    const second = cache();
    seed(first);
    seed(second);
    first.records.state.rows[0].recomputeMs =
      second.records.state.rows[0].recomputeMs = 9;
    await first.strategy.updateCosts("real-terrain-hit", 10);
    await second.strategy.updateCosts("real-terrain-hit", 10);
    expect(second.records.get).not.toHaveBeenCalled();
    expect((await first.strategy.inspectProfiles()).pendingSeed).not.toBeNull();
    expect((await second.strategy.inspectProfiles()).pendingSeed).toBeNull();
    expect(second.records.values.size).toBe(0);
  });

  it("still applies the rejection if optional seed loading fails", async () => {
    const context = cache();
    seed(context);
    context.records.state.rows[0].recomputeMs = 9;
    context.records.get.mockRejectedValueOnce(new Error("read failed"));
    expect(await context.strategy.updateCosts("real-terrain-hit", 10)).toBe(
      false
    );
    expect(context.records.values.size).toBe(0);
    expect((await context.strategy.inspectProfiles()).pendingSeed).toBeNull();
  });

  it("reads only the two small profiles without incrementing hits", async () => {
    const context = cache();
    context.profiles.values.set(profileKey(), profile());
    const report = await context.strategy.inspectProfiles();
    expect(report).toMatchObject({
      backend: "indexeddb",
      scope: "worker-storage-restore",
      profiles: { coarse: profile(), full: null },
    });
    expect(context.profiles.get.mock.calls).toEqual([
      [profileKey(), { touch: false }],
      [profileKey("full"), { touch: false }],
    ]);
    expect(context.records.get).not.toHaveBeenCalled();
    expect(context.probes.get).not.toHaveBeenCalled();
    expect(context.profiles.put).not.toHaveBeenCalled();
  });
});
