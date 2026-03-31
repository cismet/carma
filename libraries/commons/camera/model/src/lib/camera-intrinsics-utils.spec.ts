import { describe, expect, it } from "vitest";

import {
  buildOrthographicScale,
  interpolateDollyCompensatedFov,
  interpolateDollyCompensatedRange,
  readHorizontalFovFromVertical,
  readLongerEdgeFovFromMetersPerCssPixel,
  readLongerEdgeFovFromIntrinsics,
  readMetersPerCssPixelAfterZoomStep,
  readMetersPerCssPixel,
  readMetersPerCssPixelFromIntrinsics,
  readRangeFromMetersPerCssPixel,
  readTargetLongerEdgeFovForZoomStepFromIntrinsics,
  readTargetRangeForZoomStepFromIntrinsics,
  readVerticalFovFromLongerEdge,
  readViewOffsetFromElement,
  readZoomStepScale,
} from "./camera-intrinsics-utils";
import type { CameraIntrinsics } from "./camera-view-specification";
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

  it("round-trips longer-edge fov through meters-per-css-pixel", () => {
    const metersPerCssPixel = readMetersPerCssPixel({
      rangeM: 620,
      fovRad: Math.PI / 2,
      viewportWidthPx: 1600,
      viewportHeightPx: 900,
    });

    expect(metersPerCssPixel).not.toBeNull();
    expect(
      readLongerEdgeFovFromMetersPerCssPixel({
        metersPerCssPixel: metersPerCssPixel!,
        rangeM: 620,
        viewportWidthPx: 1600,
        viewportHeightPx: 900,
      })
    ).toBeCloseTo(Math.PI / 2, 8);
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

  it("derives logarithmic zoom-step scales", () => {
    expect(
      readZoomStepScale({
        direction: "out",
        zoomDelta: 1,
      })
    ).toBeCloseTo(2, 8);
    expect(
      readZoomStepScale({
        direction: "in",
        zoomDelta: 1,
      })
    ).toBeCloseTo(0.5, 8);
    expect(
      readZoomStepScale({
        direction: "out",
        zoomDelta: 0.5,
      })
    ).toBeCloseTo(Math.sqrt(2), 8);
  });

  it("scales meters-per-css-pixel by logarithmic zoom steps", () => {
    expect(
      readMetersPerCssPixelAfterZoomStep({
        metersPerCssPixel: 3.5,
        direction: "out",
        zoomDelta: 1,
      })
    ).toBeCloseTo(7, 8);
    expect(
      readMetersPerCssPixelAfterZoomStep({
        metersPerCssPixel: 3.5,
        direction: "in",
        zoomDelta: 0.5,
      })
    ).toBeCloseTo(3.5 / Math.sqrt(2), 8);
  });

  it("reads the target range for a zoom step from perspective intrinsics", () => {
    const intrinsics: CameraIntrinsics = {
      type: "PerspectiveCamera",
      fov: Math.PI / 3,
    };

    expect(
      readTargetRangeForZoomStepFromIntrinsics({
        intrinsics,
        currentRangeM: 620,
        direction: "out",
        zoomDelta: 1,
        viewportWidthPx: 1600,
        viewportHeightPx: 900,
      })
    ).toBeCloseTo(1240, 8);
    expect(
      readTargetRangeForZoomStepFromIntrinsics({
        intrinsics,
        currentRangeM: 620,
        direction: "in",
        zoomDelta: 0.5,
        viewportWidthPx: 1600,
        viewportHeightPx: 900,
      })
    ).toBeCloseTo(620 / Math.sqrt(2), 8);
  });

  it("reads the target longer-edge fov for a zoom step from perspective intrinsics", () => {
    const intrinsics: CameraIntrinsics = {
      type: "PerspectiveCamera",
      fov: Math.PI / 3,
    };
    const currentLongerEdgeFov =
      2 * Math.atan(Math.tan((Math.PI / 3) * 0.5) * (1600 / 900));

    expect(
      readTargetLongerEdgeFovForZoomStepFromIntrinsics({
        intrinsics,
        currentRangeM: 620,
        direction: "out",
        zoomDelta: 1,
        viewportWidthPx: 1600,
        viewportHeightPx: 900,
      })
    ).toBeCloseTo(2 * Math.atan(Math.tan(currentLongerEdgeFov * 0.5) * 2), 8);
    expect(
      readTargetLongerEdgeFovForZoomStepFromIntrinsics({
        intrinsics,
        currentRangeM: 620,
        direction: "in",
        zoomDelta: 1,
        viewportWidthPx: 1600,
        viewportHeightPx: 900,
      })
    ).toBeCloseTo(2 * Math.atan(Math.tan(currentLongerEdgeFov * 0.5) * 0.5), 8);
  });

  it("keeps meters-per-css-pixel constant across dolly interpolation steps", () => {
    const viewportWidthPx = 1920;
    const viewportHeightPx = 1080;
    const startRangeM = 840;
    const startFovRad = Math.PI / 2;
    const targetFovRad = Math.PI / 6;
    const startMetersPerCssPixel = readMetersPerCssPixel({
      rangeM: startRangeM,
      fovRad: startFovRad,
      viewportWidthPx,
      viewportHeightPx,
    });

    expect(startMetersPerCssPixel).not.toBeNull();

    [0, 0.2, 0.5, 0.8, 1].forEach((progress) => {
      const interpolatedFovRad = interpolateDollyCompensatedFov({
        startFovRad,
        targetFovRad,
        progress,
      });
      const interpolatedRangeM = interpolateDollyCompensatedRange({
        startRangeM,
        startFovRad,
        targetFovRad,
        progress,
        viewportWidthPx,
        viewportHeightPx,
      });

      expect(interpolatedFovRad).not.toBeNull();
      expect(interpolatedRangeM).not.toBeNull();
      expect(
        readMetersPerCssPixel({
          rangeM: interpolatedRangeM!,
          fovRad: interpolatedFovRad!,
          viewportWidthPx,
          viewportHeightPx,
        })
      ).toBeCloseTo(startMetersPerCssPixel!, 8);
    });
  });
});
