import { describe, it, expect } from "vitest";

import { geometricScale } from "./scaling";
describe("geometricScale", () => {
  it("matches repeated single-step applications", () => {
    const base = 200;
    const stepFraction = 0.05;
    const steps = 3;

    const direct = geometricScale(base, stepFraction, steps);

    let repeated = base;
    for (let i = 0; i < steps; i += 1) {
      repeated = geometricScale(repeated, stepFraction, 1);
    }

    expect(direct).toBeCloseTo(repeated);
  });
});
