import { describe, expect, it } from "vitest";

import { formatElapsed } from "./MetricLog";

describe("MetricLog", () => {
  it("carries rounded tenths across the minute boundary", () => {
    expect(formatElapsed(59_960)).toBe("1:00.0");
  });
});
