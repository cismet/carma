import { describe, expect, it } from "vitest";

import { computeNextCesiumWheelFov } from "./wheel-fov";

describe("computeNextCesiumWheelFov", () => {
  it("reduces vertical fov on zoom-in steps", () => {
    const nextFov = computeNextCesiumWheelFov(Math.PI / 3, "in", {
      zoomDelta: 1,
      minimumFovRad: 0.1,
      maximumFovRad: Math.PI * 0.75,
      viewportWidthPx: 1600,
      viewportHeightPx: 900,
    });

    expect(nextFov).not.toBeNull();
    expect(nextFov!).toBeLessThan(Math.PI / 3);
  });

  it("increases vertical fov on zoom-out steps", () => {
    const nextFov = computeNextCesiumWheelFov(Math.PI / 3, "out", {
      zoomDelta: 1,
      minimumFovRad: 0.1,
      maximumFovRad: Math.PI * 0.75,
      viewportWidthPx: 1600,
      viewportHeightPx: 900,
    });

    expect(nextFov).not.toBeNull();
    expect(nextFov!).toBeGreaterThan(Math.PI / 3);
  });

  it("clamps to the configured maximum fov", () => {
    const nextFov = computeNextCesiumWheelFov(Math.PI / 2, "out", {
      zoomDelta: 100,
      minimumFovRad: 0.1,
      maximumFovRad: 1,
      viewportWidthPx: 1600,
      viewportHeightPx: 900,
    });

    expect(nextFov).toBe(1);
  });
});
