import { describe, expect, it } from "vitest";
import {
  createShadowFrameBudget,
  updateShadowFrameBudget,
} from "./shadow-frame-budget";

describe("shadow frame budget", () => {
  it("adapts tiled depth density without throttling coverage or color resolution", () => {
    let budget = createShadowFrameBudget(4);
    for (let time = 0; time <= 500; time += 50) {
      budget = updateShadowFrameBudget(budget, time, true, {
        allowCadenceReduction: false,
      });
    }
    expect(budget.depthScale).toBe(0.75);
    expect(budget.updateIntervalMs).toBeCloseTo(1000 / 120);
    // No real gain: restore density rather than degrading a CPU/display-limited map.
    for (let time = 550; time <= 1000; time += 50) {
      budget = updateShadowFrameBudget(budget, time, true, {
        allowCadenceReduction: false,
      });
    }
    expect(budget.depthScale).toBe(1);
    expect(budget.adaptationBlocked).toBe(true);
    expect(budget).not.toHaveProperty("renderScale");
  });

  it("turns adaptation off immediately and keeps the fixed budget idle", () => {
    let budget = createShadowFrameBudget(4);
    for (let time = 0; time <= 500; time += 50) {
      budget = updateShadowFrameBudget(budget, time, true, {
        allowCadenceReduction: false,
      });
    }
    const fixed = updateShadowFrameBudget(budget, 550, true, {
      enabled: false,
    });
    expect(fixed.depthScale).toBe(1);
    expect(fixed.updateIntervalMs).toBeCloseTo(1000 / 120);
    expect(fixed.trial).toBeNull();
    expect(updateShadowFrameBudget(fixed, 1500, true, { enabled: false })).toBe(
      fixed
    );
  });

  it.each([
    [4, 120],
    [16, 60],
    [64, 30],
  ] as const)("uses the %s profile's %s FPS budget", (quality, fps) => {
    const budget = createShadowFrameBudget(quality);
    expect(budget.targetFrameMs).toBeCloseTo(1000 / fps);
    expect(budget.updateIntervalMs).toBeCloseTo(1000 / fps);
    expect(budget.depthScale).toBe(1);
  });
  it("restores quality when a trial does not improve throughput", () => {
    let budget = createShadowFrameBudget(4);
    for (let time = 0; time <= 3000; time += 50)
      budget = updateShadowFrameBudget(budget, time, true);
    expect(budget.depthScale).toBe(1);
    expect(budget.adaptationBlocked).toBe(true);
    expect(budget.updateIntervalMs).toBeCloseTo(1000 / 120);
    expect(updateShadowFrameBudget(budget, 3001, false).depthScale).toBe(1);
    expect(updateShadowFrameBudget(budget, 3001, false).adaptationBlocked).toBe(
      false
    );
  });
  it("does not automatically reduce Ultra quality", () => {
    const budget = createShadowFrameBudget(256);
    for (const time of [0, 500, 1000, 3000, 6000])
      expect(updateShadowFrameBudget(budget, time, true)).toBe(budget);
    expect(budget.updateIntervalMs).toBe(0);
    expect(budget.depthScale).toBe(1);
  });
  it("keeps 30 Hz shadow updates when rendering at 60 FPS", () => {
    let budget = createShadowFrameBudget();
    for (let time = 0; time < 3000; time += 1000 / 60) {
      budget = updateShadowFrameBudget(budget, time, true);
    }
    expect(budget.updateIntervalMs).toBeCloseTo(1000 / 30);
  });

  it("reduces updates under 30 FPS and recovers only after sustained headroom", () => {
    let budget = createShadowFrameBudget();
    for (let time = 0; time <= 500; time += 50) {
      budget = updateShadowFrameBudget(budget, time, true);
    }
    expect(budget.updateIntervalMs).toBeCloseTo(2000 / 30);
    for (let time = 516; time <= 1012; time += 16) {
      budget = updateShadowFrameBudget(budget, time, true);
    }
    expect(budget.updateIntervalMs).toBeCloseTo(2000 / 30);
    for (let time = 1028; time <= 2708; time += 16) {
      budget = updateShadowFrameBudget(budget, time, true);
    }
    expect(budget.updateIntervalMs).toBeCloseTo(1000 / 30);
  });

  it("does not permanently degrade a display-limited 120 FPS target", () => {
    let budget = createShadowFrameBudget(4);
    for (let frame = 0; frame < 180; frame++)
      budget = updateShadowFrameBudget(budget, (frame * 1000) / 60, true);
    expect(budget.updateIntervalMs).toBeCloseTo(1000 / 120);
    expect(budget.depthScale).toBe(1);
    expect(budget.adaptationBlocked).toBe(true);
  });

  it("reduces depth density only after useful cadence reductions", () => {
    let budget = createShadowFrameBudget(4);
    let time = 0;
    budget = updateShadowFrameBudget(budget, time, true);
    for (const frameMs of [50, 40, 30, 20, 15]) {
      const end = time + 600;
      while (time < end) {
        time += frameMs;
        budget = updateShadowFrameBudget(budget, time, true);
      }
    }
    expect(budget.depthScale).toBeLessThan(1);
    expect(updateShadowFrameBudget(budget, time + 1, false).depthScale).toBe(1);
  });

  it("does not count idle gaps as dropped frames", () => {
    let budget = updateShadowFrameBudget(createShadowFrameBudget(), 0, true);
    budget = updateShadowFrameBudget(budget, 20, false);
    budget = updateShadowFrameBudget(budget, 60000, true);
    expect(budget.sampleCount).toBe(0);
    expect(budget.updateIntervalMs).toBeCloseTo(1000 / 30);
  });
});
