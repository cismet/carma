import { describe, expect, it } from "vitest";

import type { CssPixelPosition } from "@carma-units";

import { resolveSegmentEndOutsideHorizontalCapsule } from "./pillConnectorGeometry";

describe("pillConnectorGeometry", () => {
  it("clips center-attached compact pills at the visible badge perimeter", () => {
    const endPoint = resolveSegmentEndOutsideHorizontalCapsule(
      { x: 0, y: 30 } as CssPixelPosition,
      { x: 0, y: 0 } as CssPixelPosition,
      "center",
      20,
      20
    );

    expect(endPoint.x).toBeCloseTo(0, 3);
    expect(endPoint.y).toBeCloseTo(10, 3);
  });

  it("clips right-attached compact pills at the outer capsule edge", () => {
    const endPoint = resolveSegmentEndOutsideHorizontalCapsule(
      { x: 40, y: 0 } as CssPixelPosition,
      { x: 0, y: 0 } as CssPixelPosition,
      "right",
      38,
      19
    );

    expect(endPoint.x).toBeCloseTo(9.5, 3);
    expect(endPoint.y).toBeCloseTo(0, 3);
  });
});
