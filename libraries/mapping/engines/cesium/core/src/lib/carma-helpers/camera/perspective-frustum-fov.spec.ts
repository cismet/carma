import { describe, expect, it } from "vitest";

import { PerspectiveFrustum } from "@carma-cesium";
import {
  readPerspectiveFrustumLongerEdgeFov,
  readPerspectiveFrustumVerticalFov,
  writePerspectiveFrustumLongerEdgeFov,
  writePerspectiveFrustumVerticalFov,
} from "./perspective-frustum-fov";

describe("PerspectiveFrustumFov helpers", () => {
  it("reads Cesium frustum.fov as the longer-edge fov", () => {
    const frustum = new PerspectiveFrustum();
    frustum.aspectRatio = 16 / 9;
    frustum.fov = Math.PI / 2;

    expect(readPerspectiveFrustumLongerEdgeFov(frustum)).toBeCloseTo(
      Math.PI / 2,
      8
    );
  });

  it("reads vertical fov from a wide frustum", () => {
    const frustum = new PerspectiveFrustum();
    frustum.aspectRatio = 16 / 9;
    frustum.fov = Math.PI / 2;

    expect(readPerspectiveFrustumVerticalFov(frustum)).toBeCloseTo(
      Math.atan(Math.tan(Math.PI / 4) / (16 / 9)) * 2,
      8
    );
  });

  it("writes a vertical fov back through the wide-frustum horizontal basis", () => {
    const frustum = new PerspectiveFrustum();
    frustum.aspectRatio = 16 / 9;

    writePerspectiveFrustumVerticalFov(frustum, 0.9);

    expect(frustum.fov).toBeCloseTo(
      Math.atan(Math.tan(0.9 * 0.5) * (16 / 9)) * 2,
      8
    );
    expect(readPerspectiveFrustumVerticalFov(frustum)).toBeCloseTo(0.9, 8);
  });

  it("writes a longer-edge fov directly to Cesium frustum.fov", () => {
    const frustum = new PerspectiveFrustum();
    frustum.aspectRatio = 16 / 9;

    writePerspectiveFrustumLongerEdgeFov(frustum, Math.PI / 3);

    expect(frustum.fov).toBeCloseTo(Math.PI / 3, 8);
  });
});
