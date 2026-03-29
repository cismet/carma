import { describe, expect, it } from "vitest";
import type { CameraIntrinsics } from "./camera-view-specification";
import {
  buildOrthographicScale,
  readHorizontalFovFromVertical,
  readLongerEdgeFovFromIntrinsics,
  readMetersPerCssPixel,
  readMetersPerCssPixelFromIntrinsics,
  readRangeFromMetersPerCssPixel,
  readVerticalFovFromLongerEdge,
  readViewOffsetFromElement,
} from "./camera-intrinsics-utils";

describe("camera intrinsics utils", () => {
  it("derives horizontal fov from vertical fov and aspect", () => {
    const verticalFov = Math.PI / 4;
    const aspect = 1.5;

    expect(readHorizontalFovFromVertical(verticalFov, aspect)).toBeCloseTo(
      2 * Math.atan(Math.tan(verticalFov * 0.5) * aspect),
      8
    );
  });

  it("reads longer-edge fov from intrinsics and viewport", () => {
    const intrinsics: Pick<CameraIntrinsics, "fov" | "fovHorizontal"> = {
      fov: Math.PI / 4,
    };

    expect(
      readLongerEdgeFovFromIntrinsics(intrinsics, {
        viewportWidthPx: 1200,
        viewportHeightPx: 800,
      })
    ).toBeCloseTo(2 * Math.atan(Math.tan((Math.PI / 4) * 0.5) * 1.5), 8);
  });

  it("derives vertical fov from longer-edge fov in landscape viewports", () => {
    const longerEdgeFov = Math.PI / 2;
    const aspect = 1.5;

    expect(readVerticalFovFromLongerEdge(longerEdgeFov, aspect)).toBeCloseTo(
      2 * Math.atan(Math.tan(longerEdgeFov * 0.5) / aspect),
      8
    );
  });

  it("prefers an explicit horizontal fov when present", () => {
    const intrinsics: Pick<CameraIntrinsics, "fov" | "fovHorizontal"> = {
      fov: Math.PI / 4,
      fovHorizontal: Math.PI / 2,
    };

    expect(readLongerEdgeFovFromIntrinsics(intrinsics)).toBeCloseTo(
      Math.PI / 2,
      8
    );
  });

  it("builds a full-frame view offset from an element size", () => {
    expect(
      readViewOffsetFromElement({
        clientWidth: 480,
        clientHeight: 900,
      })
    ).toEqual({
      fullWidth: 480,
      fullHeight: 900,
      offsetX: 0,
      offsetY: 0,
      width: 480,
      height: 900,
    });
  });

  it("returns undefined for invalid element dimensions", () => {
    expect(
      readViewOffsetFromElement({
        clientWidth: 0,
        clientHeight: 0,
      })
    ).toBeUndefined();
  });

  it("derives meters-per-css-pixel from range and fov", () => {
    expect(
      readMetersPerCssPixel({
        rangeM: 620,
        fovRad: Math.PI / 3,
        viewportWidthPx: 1600,
        viewportHeightPx: 900,
      })
    ).toBeCloseTo((620 * Math.tan(Math.PI / 6)) / 800, 8);
  });

  it("round-trips range through meters-per-css-pixel", () => {
    const metersPerCssPixel = readMetersPerCssPixel({
      rangeM: 620,
      fovRad: Math.PI / 3,
      viewportWidthPx: 1600,
      viewportHeightPx: 900,
    });

    expect(metersPerCssPixel).not.toBeNull();
    expect(
      readRangeFromMetersPerCssPixel({
        metersPerCssPixel: metersPerCssPixel!,
        fovRad: Math.PI / 3,
        viewportWidthPx: 1600,
        viewportHeightPx: 900,
      })
    ).toBeCloseTo(620, 8);
  });

  it("prefers orthographic meters-per-css-pixel over perspective derivation", () => {
    expect(
      readMetersPerCssPixelFromIntrinsics({
        intrinsics: {
          type: "OrthographicCamera",
          orthographicScale: buildOrthographicScale(3.25),
          fov: Math.PI / 3,
        },
        rangeM: 620,
        viewportWidthPx: 1600,
        viewportHeightPx: 900,
      })
    ).toBe(3.25);
  });

  it("derives meters-per-css-pixel from perspective intrinsics when orthographic scale is absent", () => {
    const expectedLongerEdgeFov =
      2 * Math.atan(Math.tan((Math.PI / 3) * 0.5) * (1600 / 900));

    expect(
      readMetersPerCssPixelFromIntrinsics({
        intrinsics: {
          type: "PerspectiveCamera",
          fov: Math.PI / 3,
        },
        rangeM: 620,
        viewportWidthPx: 1600,
        viewportHeightPx: 900,
      })
    ).toBeCloseTo((620 * Math.tan(expectedLongerEdgeFov * 0.5)) / 800, 8);
  });

  it("falls back to a default projection radius when viewport is unknown", () => {
    expect(
      readMetersPerCssPixel({
        rangeM: 620,
        fovRad: Math.PI / 3,
      })
    ).toBeCloseTo((620 * Math.tan(Math.PI / 6)) / 960, 8);
  });
});
