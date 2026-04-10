import {
  SVG_LINE_LABEL_ROTATION_MODE,
  type SvgLine,
  type SvgLineLabelRotationMode,
} from "@carma-commons/svg";
import type { CssPixelPosition } from "@carma-units";

const MIN_LINE_LENGTH_PX = 0.0001;

export const DEFAULT_LINE_LABEL_OFFSET_PX = 10;

export type LineLabelPlacementOptions = {
  labelOffsetPx?: number;
  labelFlippedBaselineOffsetPx?: number;
  labelRotationMode?: SvgLineLabelRotationMode;
  getLabelOutsideReferencePoint?: () => CssPixelPosition | null;
  getLabelInsideReferencePoint?: () => CssPixelPosition | null;
};

export type ResolvedLineLabelPlacement = {
  lineLengthPx: number;
  shouldFlip: boolean;
  angleDeg: number;
  midX: number;
  midY: number;
  normalX: number;
  normalY: number;
  textX: number;
  textY: number;
};

const normalizeAngleDeg = (angleDeg: number): number => {
  const normalizedAngleDeg = angleDeg % 360;
  return normalizedAngleDeg < 0 ? normalizedAngleDeg + 360 : normalizedAngleDeg;
};

const resolveReadableLineLabelAngleDeg = ({
  dx,
  dy,
  lineLengthPx,
  normalX,
  normalY,
}: {
  dx: number;
  dy: number;
  lineLengthPx: number;
  normalX: number;
  normalY: number;
}) => {
  const rawAngleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const lineUnitX = dx / lineLengthPx;
  const lineUnitY = dy / lineLengthPx;
  const crossProduct = lineUnitX * normalY - lineUnitY * normalX;
  const sideAdjustedAngle = crossProduct >= 0 ? rawAngleDeg : rawAngleDeg + 180;
  const normalizedAngleDeg = normalizeAngleDeg(sideAdjustedAngle);

  return normalizedAngleDeg > 90 && normalizedAngleDeg < 270
    ? normalizeAngleDeg(normalizedAngleDeg + 180)
    : normalizedAngleDeg;
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
  const dx = svgLine.end.x - svgLine.start.x;
  const dy = svgLine.end.y - svgLine.start.y;
  const lineLengthPx = Math.hypot(dx, dy);
  if (lineLengthPx <= MIN_LINE_LENGTH_PX) {
    return null;
  }

  const midX = (svgLine.start.x + svgLine.end.x) * 0.5;
  const midY = (svgLine.start.y + svgLine.end.y) * 0.5;
  let normalX = -dy / lineLengthPx;
  let normalY = dx / lineLengthPx;
  let shouldFlip = previousShouldFlip;
  const sideReferencePoint =
    options?.getLabelOutsideReferencePoint?.() ??
    options?.getLabelInsideReferencePoint?.() ??
    null;

  if (sideReferencePoint) {
    const refDx = sideReferencePoint.x - midX;
    const refDy = sideReferencePoint.y - midY;
    const dotWithNormal = refDx * normalX + refDy * normalY;

    if (dotWithNormal > sideSwitchThresholdPx) {
      shouldFlip = false;
    } else if (dotWithNormal < -sideSwitchThresholdPx) {
      shouldFlip = true;
    }
  }

  if (shouldFlip) {
    normalX = -normalX;
    normalY = -normalY;
  }

  const angleDeg =
    options?.labelRotationMode === SVG_LINE_LABEL_ROTATION_MODE.CLOCKWISE
      ? normalizeAngleDeg((Math.atan2(dy, dx) * 180) / Math.PI)
      : resolveReadableLineLabelAngleDeg({
          dx,
          dy,
          lineLengthPx,
          normalX,
          normalY,
        });
  const labelOffsetPx = options?.labelOffsetPx ?? DEFAULT_LINE_LABEL_OFFSET_PX;
  const flippedBaselineOffsetPx = shouldFlip
    ? options?.labelFlippedBaselineOffsetPx ?? 0
    : 0;
  const angleRad = (angleDeg * Math.PI) / 180;
  const baselineOffsetX = -Math.sin(angleRad) * flippedBaselineOffsetPx;
  const baselineOffsetY = Math.cos(angleRad) * flippedBaselineOffsetPx;

  return {
    lineLengthPx,
    shouldFlip,
    angleDeg,
    midX,
    midY,
    normalX,
    normalY,
    textX: midX + normalX * labelOffsetPx + baselineOffsetX,
    textY: midY + normalY * labelOffsetPx + baselineOffsetY,
  };
};
