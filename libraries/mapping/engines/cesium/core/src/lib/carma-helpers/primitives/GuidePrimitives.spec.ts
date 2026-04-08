import { describe, expect, it } from "vitest";
import { Cartesian3 } from "@carma-cesium";

import { resolveStableDiscNormal } from "./GuidePrimitives";

describe("resolveStableDiscNormal", () => {
  it("keeps vertical surface normals instead of forcing ellipsoid-up", () => {
    const origin = new Cartesian3(6378137, 0, 0);
    const preferredNormal = new Cartesian3(0, 1, 0);

    const resolvedNormal = resolveStableDiscNormal(origin, preferredNormal);

    expect(Cartesian3.dot(resolvedNormal, preferredNormal)).toBeCloseTo(1, 6);
  });

  it("keeps the preferred normal in the same hemisphere as the fallback", () => {
    const origin = new Cartesian3(6378137, 0, 0);
    const preferredNormal = new Cartesian3(0, -1, 0);
    const fallbackNormal = new Cartesian3(0, 1, 0);

    const resolvedNormal = resolveStableDiscNormal(
      origin,
      preferredNormal,
      fallbackNormal
    );

    expect(Cartesian3.dot(resolvedNormal, fallbackNormal)).toBeCloseTo(1, 6);
  });

  it("falls back to local ellipsoid-up when no usable normal is available", () => {
    const origin = new Cartesian3(6378137, 0, 0);

    const resolvedNormal = resolveStableDiscNormal(
      origin,
      Cartesian3.ZERO,
      null
    );

    expect(Cartesian3.dot(resolvedNormal, Cartesian3.UNIT_X)).toBeCloseTo(1, 6);
  });
});
