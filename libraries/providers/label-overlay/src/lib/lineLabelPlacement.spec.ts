import { SVG_LINE_LABEL_ROTATION_MODE, type SvgLine } from "@carma-commons/svg";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_LINE_LABEL_OFFSET_PX,
  resolveOverlayLineLabelPlacement,
} from "./lineLabelPlacement";

const createSvgLine = (
  startX: number,
  startY: number,
  endX: number,
  endY: number
): SvgLine => ({
  start: { x: startX, y: startY },
  end: { x: endX, y: endY },
});

describe("resolveOverlayLineLabelPlacement", () => {
  it("orients the label toward the outside reference point using the shared default offset", () => {
    const placement = resolveOverlayLineLabelPlacement({
      svgLine: createSvgLine(0, 0, 10, 0),
      options: {
        getLabelOutsideReferencePoint: () => ({ x: 5, y: 20 }),
      },
    });

    expect(placement).toMatchObject({
      angleDeg: 0,
      lineLengthPx: 10,
      midX: 5,
      midY: 0,
      normalY: 1,
      shouldFlip: false,
      textX: 5,
      textY: DEFAULT_LINE_LABEL_OFFSET_PX,
    });
    expect(placement?.normalX).toBeCloseTo(0);
  });

  it("keeps the previous side while the reference point remains inside the hysteresis band", () => {
    const placement = resolveOverlayLineLabelPlacement({
      svgLine: createSvgLine(0, 0, 10, 0),
      options: {
        getLabelOutsideReferencePoint: () => ({ x: 5, y: 1 }),
      },
      previousShouldFlip: true,
      sideSwitchThresholdPx: 1.5,
    });

    expect(placement).toMatchObject({
      normalX: 0,
      normalY: -1,
      shouldFlip: true,
      textX: 5,
      textY: -DEFAULT_LINE_LABEL_OFFSET_PX,
    });
  });

  it("applies clockwise rotation and flipped baseline offset for vertical labels", () => {
    const placement = resolveOverlayLineLabelPlacement({
      svgLine: createSvgLine(0, 0, 0, 10),
      options: {
        labelOffsetPx: 8,
        labelFlippedBaselineOffsetPx: 6,
        labelRotationMode: SVG_LINE_LABEL_ROTATION_MODE.CLOCKWISE,
        getLabelOutsideReferencePoint: () => ({ x: 20, y: 5 }),
      },
    });

    expect(placement).toMatchObject({
      angleDeg: 90,
      normalX: 1,
      shouldFlip: true,
      textX: 2,
      textY: 5,
    });
    expect(placement?.normalY).toBeCloseTo(0);
  });
});
