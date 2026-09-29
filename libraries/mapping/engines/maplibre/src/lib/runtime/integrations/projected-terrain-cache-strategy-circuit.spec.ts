// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import {
  source,
  cache,
  reusableRow,
  seed,
  encodeTypedBinaryRecord,
} from "./projected-terrain-cache-strategy.test-support";

describe("session-local proven-slow key circuit breaker", () => {
  it("suppresses a Binary 25 ms / Source 10 ms key without disabling other keys", async () => {
    const context = cache();
    const entry = seed(context);
    context.records.state.rows[0].recomputeMs = 10;
    context.records.values.set("real-terrain-hit", {
      kind: "terrain-component-v1",
      format: "binary",
      payload: encodeTypedBinaryRecord(entry),
    });
    expect(context.strategy.canWrite("real-terrain-hit")).toBe(true);
    expect(await context.strategy.updateCosts("real-terrain-hit", 25)).toBe(
      false
    );
    expect(context.records.values.size).toBe(0);
    expect(context.strategy.canWrite("real-terrain-hit")).toBe(false);
    expect(context.strategy.canWrite("different-terrain-key")).toBe(true);
    expect((await context.strategy.inspectProfiles()).suppressedKeyCount).toBe(
      1
    );
  });

  it.each([
    { sourceMs: 100, restoreMs: 95, hits: 1, allowed: true },
    { sourceMs: 100, restoreMs: 96, hits: 1, allowed: false },
    { sourceMs: undefined, restoreMs: 25, hits: 1, allowed: true },
    { sourceMs: 10, restoreMs: 25, hits: 0, allowed: true },
    { sourceMs: 10, restoreMs: NaN, hits: 1, allowed: true },
  ])(
    "requires actual insufficient feedback: %j",
    async ({ sourceMs, restoreMs, hits, allowed }) => {
      const context = cache();
      seed(context, hits);
      context.records.state.rows[0].recomputeMs = sourceMs;
      await context.strategy.updateCosts("real-terrain-hit", restoreMs);
      expect(context.strategy.canWrite("real-terrain-hit")).toBe(allowed);
    }
  );

  it("keeps at most 256 exact keys and resets on strategy disposal/new session", async () => {
    const context = cache();
    vi.stubGlobal("navigator", {}); // No calibration clones are needed here.
    for (let index = 0; index < 257; index++) {
      const key = `slow-${index}`;
      context.records.state.rows = [
        { ...reusableRow(1), key, recomputeMs: 10 },
      ];
      context.records.values.set(key, source());
      await context.strategy.updateCosts(key, 25);
    }
    expect((await context.strategy.inspectProfiles()).suppressedKeyCount).toBe(
      256
    );
    expect(context.strategy.canWrite("slow-0")).toBe(true);
    expect(context.strategy.canWrite("slow-256")).toBe(false);
    context.strategy.dispose();
    expect((await context.strategy.inspectProfiles()).suppressedKeyCount).toBe(
      0
    );
    expect(context.strategy.canWrite("new-key")).toBe(false);
    expect(cache().strategy.canWrite("slow-256")).toBe(true);
  });
});
