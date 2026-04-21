import {
  addPoint2d,
  dotPoint2d,
  getSegmentFrame2d,
  scalePoint2d,
  subtractPoint2d,
} from "@carma-commons/math";
import {
  SVG_LINE_LABEL_ROTATION_MODE,
  type SvgLine,
  type SvgLineLabelRotationMode,
} from "@carma-commons/svg";
import {
  clampUnitRangeRatio,
  PI,
  PI_OVER_TWO,
  type CssPixels,
  type CssPixelPosition,
  type Ratio,
  type Radians,
  zeroToTwoPi,
} from "@carma-units";

const overlayLineLabelPlacementDefaults = Object.freeze({
  minLineLengthPx: 0.0001,
  offsetPx: 10,
});

export type LineLabelPlacementOptions = {
  labelOffsetPx?: number;
  labelFlippedBaselineOffsetPx?: number;
  labelRotationMode?: SvgLineLabelRotationMode;
  getLabelOutsideReferencePoint?: () => CssPixelPosition | null;
  getLabelInsideReferencePoint?: () => CssPixelPosition | null;
  anchorRatio?: number;
};

export type ResolvedLineLabelPlacement = {
  lineLengthPx: CssPixels;
  shouldFlip: boolean;
  angleRad: Radians;
  anchorRatio: Ratio;
  anchorX: CssPixels;
  anchorY: CssPixels;
  midX: CssPixels;
  midY: CssPixels;
  normalX: number;
  normalY: number;
  textX: CssPixels;
  textY: CssPixels;
};

const toCssPixels = (value: number): CssPixels => value as CssPixels;

const clampLineLabelAnchorRatio = (value: number): Ratio =>
  clampUnitRangeRatio(value);

const resolveReadableLineLabelAngleRad = ({
  dx,
  dy,
  lineLengthPx,
  normalX,
  normalY,
}: {
  dx: number;
  dy: number;
  lineLengthPx: CssPixels;
  normalX: number;
  normalY: number;
}): Radians => {
  const rawAngleRad = Math.atan2(dy, dx) as Radians;
  const lineUnitX = dx / lineLengthPx;
  const lineUnitY = dy / lineLengthPx;
  const crossProduct = lineUnitX * normalY - lineUnitY * normalX;
  const sideAdjustedAngleRad =
    crossProduct >= 0 ? rawAngleRad : ((rawAngleRad + PI) as Radians);
  const uprightAngleRad =
    sideAdjustedAngleRad > PI_OVER_TWO &&
    sideAdjustedAngleRad < ((PI + PI_OVER_TWO) as Radians)
      ? ((sideAdjustedAngleRad - PI) as Radians)
      : sideAdjustedAngleRad < -PI_OVER_TWO
      ? ((sideAdjustedAngleRad + PI) as Radians)
      : sideAdjustedAngleRad;

  return zeroToTwoPi(uprightAngleRad);
};

export const resolveOverlayLineLabelPlacement = ({
  svgLine,
  options,
  previousShouldFlip = false,
  sideSwitchThresholdPx = 0,
}: {
  svgLine: SvgLine;
  options?: LineLabelPlacementOptions;
  previousShouldFlip?: boolean;
  sideSwitchThresholdPx?: number;
}): ResolvedLineLabelPlacement | null => {
  const segmentFrame = getSegmentFrame2d({
    start: svgLine.start,
    end: svgLine.end,
    epsilon: overlayLineLabelPlacementDefaults.minLineLengthPx,
  });
  if (!segmentFrame) {
    return null;
  }

  const anchorRatio = clampLineLabelAnchorRatio(options?.anchorRatio ?? 0.5);
  const anchorPoint = addPoint2d(
    svgLine.start,
    scalePoint2d(segmentFrame.delta, anchorRatio)
  );
  const anchorX = toCssPixels(anchorPoint.x);
  const anchorY = toCssPixels(anchorPoint.y);
  const midX = anchorX;
  const midY = anchorY;
  let labelNormal = segmentFrame.leftUnitNormal;
  let shouldFlip = previousShouldFlip;
  const sideReferencePoint =
    options?.getLabelOutsideReferencePoint?.() ??
    options?.getLabelInsideReferencePoint?.() ??
    null;

  if (sideReferencePoint) {
    const sideReferenceOffset = subtractPoint2d(
      sideReferencePoint,
      anchorPoint
    );
    const dotWithNormal = dotPoint2d(sideReferenceOffset, labelNormal);

    if (dotWithNormal > sideSwitchThresholdPx) {
      shouldFlip = false;
    } else if (dotWithNormal < -sideSwitchThresholdPx) {
      shouldFlip = true;
    }
  }

  if (shouldFlip) {
    labelNormal = scalePoint2d(labelNormal, -1);
  }

  const angleRad =
    options?.labelRotationMode === SVG_LINE_LABEL_ROTATION_MODE.CLOCKWISE
      ? zeroToTwoPi(
          Math.atan2(segmentFrame.delta.y, segmentFrame.delta.x) as Radians
        )
      : resolveReadableLineLabelAngleRad({
          dx: segmentFrame.delta.x,
          dy: segmentFrame.delta.y,
          lineLengthPx: segmentFrame.length as CssPixels,
          normalX: labelNormal.x,
          normalY: labelNormal.y,
        });
  const labelOffsetPx =
    options?.labelOffsetPx ?? overlayLineLabelPlacementDefaults.offsetPx;
  const flippedBaselineOffsetPx = shouldFlip
    ? options?.labelFlippedBaselineOffsetPx ?? 0
    : 0;
  const labelOffset = scalePoint2d(labelNormal, labelOffsetPx);
  const baselineOffset = {
    x: -Math.sin(angleRad) * flippedBaselineOffsetPx,
    y: Math.cos(angleRad) * flippedBaselineOffsetPx,
  };
  const textOffset = addPoint2d(labelOffset, baselineOffset);
  const textPoint = addPoint2d(anchorPoint, textOffset);

  return {
    lineLengthPx: segmentFrame.length as CssPixels,
    shouldFlip,
    angleRad,
    anchorRatio,
    anchorX,
    anchorY,
    midX,
    midY,
    normalX: labelNormal.x,
    normalY: labelNormal.y,
    textX: toCssPixels(textPoint.x),
    textY: toCssPixels(textPoint.y),
  };
};
