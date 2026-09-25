import { describe, expect, it } from "vitest";

import {
  getSunDiscSampleOffset,
  SUN_ANGULAR_RADIUS_RAD,
} from "./sun-disc-sampling";

describe("getSunDiscSampleOffset", () => {
  it("keeps every deterministic sample inside the apparent solar disc", () => {
    const samples = Array.from({ length: 8 }, (_, index) =>
      getSunDiscSampleOffset(index, 8)
    );
    for (const sample of samples) {
      expect(sample.angularRadius).toBeGreaterThan(0);
      expect(sample.angularRadius).toBeLessThan(SUN_ANGULAR_RADIUS_RAD);
      expect(Math.hypot(sample.tangentA, sample.tangentB)).toBeCloseTo(
        sample.angularRadius
      );
    }
    expect(getSunDiscSampleOffset(8, 8)).toEqual(samples[0]);
    expect(new Set(samples.map(({ tangentA }) => tangentA)).size).toBe(8);
  });
});
