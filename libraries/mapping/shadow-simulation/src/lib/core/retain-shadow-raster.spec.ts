import { describe, expect, it } from "vitest";
import { fitShadowMap } from "./fit-shadow-map";
import { retainShadowRaster } from "./retain-shadow-raster";

const bounds = { left: -100, right: 100, bottom: -100, top: 100 };
const fit = (receivers = bounds) =>
  fitShadowMap(receivers, {
    mapSize: 1024,
    maxMapSize: 1024,
    elevationSine: 0.5,
    sunDiscGuardMeters: 1,
    groundTexelFit: false,
  });

describe("retainShadowRaster", () => {
  it("retains texel scale and origin when a rotated view fits the guarded raster", () => {
    const previous = fit();
    const receivers = { left: -40, right: 80, bottom: -60, top: 30 };
    expect(retainShadowRaster(previous, fit(receivers), receivers, 1)).toBe(
      previous
    );
  });
  it.each([
    { ...bounds, left: -101 },
    { ...bounds, right: 101 },
    { ...bounds, bottom: -101 },
    { ...bounds, top: 101 },
  ])("refits when newly exposed terrain exceeds an edge: %j", (receivers) => {
    const next = fit(receivers);
    expect(retainShadowRaster(fit(), next, receivers, 1)).toBe(next);
  });
  it("refits when a wider solar disc needs more guard coverage", () => {
    const next = fit();
    expect(retainShadowRaster(fit(), next, bounds, 10)).toBe(next);
  });
  it("keeps world texel locations when recentering for newly visible terrain", () => {
    const previous = fit();
    const receivers = { left: 940, right: 980, bottom: -50, top: 50 };
    const moved = retainShadowRaster(previous, fit(receivers), receivers, 1);
    expect(moved.metersPerTexelX).toBe(previous.metersPerTexelX);
    expect(moved.metersPerTexelY).toBe(previous.metersPerTexelY);
    const translation = (moved.left - previous.left) / previous.metersPerTexelX;
    expect(translation).toBeCloseTo(Math.round(translation), 9);
    expect(moved.left).toBeLessThan(receivers.left - 1);
    expect(moved.right).toBeGreaterThan(receivers.right + 1);
  });
});
