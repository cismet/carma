import { describe, expect, it } from "vitest";
import { resolveShadowReceiverBias } from "./shadow-receiver-bias";

describe("terrain receiver bias", () => {
  it("protects low-sun terrain using its world grid without changing on camera-fit or DPR changes", () => {
    for (const metersPerTexel of [0.1, 0.5, 2])
      for (const depthRangeMeters of [1000, 5000]) {
        const result = resolveShadowReceiverBias({
          metersPerTexel,
          receiverTexelMeters: 0.25,
          elevationSine: Math.sin((8 * Math.PI) / 180),
          depthRangeMeters,
        });
        expect(result.normalBias).toBeCloseTo(1.5);
        expect(-result.bias * depthRangeMeters).toBeCloseTo(1);
      }
  });

  it("retains explicit contact limits for mesh receivers and existing fixed-offset hosts", () => {
    const base = {
      metersPerTexel: 2,
      elevationSine: 0.5,
      depthRangeMeters: 1000,
    };
    expect(
      resolveShadowReceiverBias({ ...base, maxReceiverBiasMeters: 0.01 })
    ).toEqual({ bias: -0.00001, normalBias: 0.01 });
    expect(
      resolveShadowReceiverBias({ ...base, receiverBiasMeters: 0.5 })
    ).toEqual({ bias: -0.0005, normalBias: 0.5 });
    expect(
      resolveShadowReceiverBias({ ...base, receiverTexelMeters: NaN })
    ).toEqual(resolveShadowReceiverBias(base));
  });
});
