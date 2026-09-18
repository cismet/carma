import { describe, expect, it } from "vitest";

import {
  constrainCanvasImageStripView,
  getCanvasImageStripSlices,
  getCanvasImageStripView,
  setCanvasImageStripPosition,
  zoomCanvasImageStripAt,
  type CanvasImageStripDimensions,
} from "./canvas-image-strip-view";

const dimensions: CanvasImageStripDimensions = {
  sourceWidth: 2000,
  sourceHeight: 400,
  viewportWidth: 600,
  viewportHeight: 300,
};
const transform = { scale: 1, centerX: 1000, centerY: 200 };

describe("canvas image strip navigation", () => {
  it("keeps the source point under an off-centre zoom anchor", () => {
    const anchor = { x: 120, y: 170 };
    const next = zoomCanvasImageStripAt(
      transform,
      dimensions,
      2,
      anchor,
      false
    );
    const sourceBefore = {
      x: transform.centerX + (anchor.x - 300) / transform.scale,
      y: transform.centerY + (anchor.y - 150) / transform.scale,
    };
    expect(next.centerX + (anchor.x - 300) / next.scale).toBe(sourceBefore.x);
    expect(next.centerY + (anchor.y - 150) / next.scale).toBe(sourceBefore.y);
  });

  it("bounds both axes of open strips and centres an image smaller than its viewport", () => {
    expect(
      constrainCanvasImageStripView(
        { scale: 1, centerX: -100, centerY: 1000 },
        dimensions,
        false
      )
    ).toEqual({ scale: 1, centerX: 300, centerY: 250 });
    expect(
      constrainCanvasImageStripView(
        { scale: 0.01, centerX: 20, centerY: -80 },
        dimensions,
        false
      )
    ).toEqual({ scale: 0.3, centerX: 1000, centerY: 200 });
  });

  it("caps zoom without shifting the anchor when already at the limit", () => {
    const maximum = { scale: 8, centerX: 1000, centerY: 200 };
    expect(
      zoomCanvasImageStripAt(maximum, dimensions, 10, { x: 12, y: 36 }, false)
    ).toEqual(maximum);
  });

  it("wraps large positive and negative pans into the same loop position", () => {
    for (const centerX of [-4010, -2010, -10, 1990, 3990]) {
      const next = constrainCanvasImageStripView(
        { ...transform, centerX },
        dimensions,
        true
      );
      expect(next.centerX).toBe(1990);
      expect(getCanvasImageStripView(next, dimensions, true).position).toBe(
        0.995
      );
    }
  });

  it("maps open-strip navigation endpoints to the exact image edges", () => {
    const start = setCanvasImageStripPosition(transform, dimensions, 0, false);
    const end = setCanvasImageStripPosition(transform, dimensions, 1, false);
    expect(start.centerX).toBe(300);
    expect(end.centerX).toBe(1700);
    expect(getCanvasImageStripView(start, dimensions, false).position).toBe(0);
    expect(getCanvasImageStripView(end, dimensions, false).position).toBe(1);
  });

  it("uses the same station after crossing either loop endpoint", () => {
    expect(
      setCanvasImageStripPosition(transform, dimensions, 1.1, true).centerX
    ).toBeCloseTo(200);
    expect(
      setCanvasImageStripPosition(transform, dimensions, -0.9, true).centerX
    ).toBeCloseTo(200);
  });

  it("uses one cropped source interval away from a seam", () => {
    expect(getCanvasImageStripSlices(transform, dimensions, true)).toEqual([
      { sourceX: 700, sourceWidth: 600, x: 0, width: 600 },
    ]);
  });

  it("covers the viewport continuously with tail and head source crops at a loop seam", () => {
    expect(
      getCanvasImageStripSlices({ ...transform, centerX: 10 }, dimensions, true)
    ).toEqual([
      { sourceX: 1710, sourceWidth: 290, x: 0, width: 290 },
      { sourceX: 0, sourceWidth: 310, x: 290, width: 310 },
    ]);
    const atZero = getCanvasImageStripSlices(
      { ...transform, centerX: 0 },
      dimensions,
      true
    );
    const atEnd = getCanvasImageStripSlices(
      { ...transform, centerX: 2000 },
      dimensions,
      true
    );
    expect(atZero).toEqual(atEnd);
  });

  it("does not expose wrapped content in an open strip", () => {
    expect(
      getCanvasImageStripSlices(
        { ...transform, centerX: 10 },
        dimensions,
        false
      )
    ).toEqual([{ sourceX: 0, sourceWidth: 310, x: 290, width: 310 }]);
  });

  it("allows a native-scale small image without forcing fit upsampling", () => {
    const small = { ...dimensions, sourceWidth: 100, sourceHeight: 100 };
    const next = constrainCanvasImageStripView(
      { scale: 1, centerX: 50, centerY: 50 },
      small,
      false
    );
    expect(next.scale).toBe(1);
    expect(getCanvasImageStripSlices(next, small, false)).toEqual([
      { sourceX: 0, sourceWidth: 100, x: 250, width: 100 },
    ]);
  });
});
