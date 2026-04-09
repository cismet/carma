import type { CssPixelPosition } from "@carma-units";

import type { PointLabelAttach } from "./pointLabelAttach";
const GEOMETRY_EPSILON = 1e-6;

export const DEFAULT_PILL_LABEL_HEIGHT_EM = 2;

export const resolvePillLabelHeightPx = (
  fontSizePx: number,
  labelHeightEm: number = DEFAULT_PILL_LABEL_HEIGHT_EM
): number =>
  Number.isFinite(fontSizePx) && fontSizePx > 0
    ? fontSizePx * labelHeightEm
    : 10 * labelHeightEm;

export const estimatePillCapRadiusPx = (
  fontSizePx: number,
  labelHeightEm: number = DEFAULT_PILL_LABEL_HEIGHT_EM
): number => resolvePillLabelHeightPx(fontSizePx, labelHeightEm) / 2;

export const resolvePillCapCenterPoint = (
  attach: PointLabelAttach,
  connectorPoint: CssPixelPosition,
  capRadiusPx: number
): CssPixelPosition => {
  if (attach === "left") {
    return {
      x: connectorPoint.x + capRadiusPx,
      y: connectorPoint.y,
    } as CssPixelPosition;
  }

  if (attach === "right") {
    return {
      x: connectorPoint.x - capRadiusPx,
      y: connectorPoint.y,
    } as CssPixelPosition;
  }

  return connectorPoint;
};

export const resolveSegmentEndOutsideCircle = (
  startPoint: CssPixelPosition,
  circleCenter: CssPixelPosition,
  circleRadiusPx: number
): CssPixelPosition => {
  if (!(circleRadiusPx > 0)) {
    return circleCenter;
  }

  const dx = circleCenter.x - startPoint.x;
  const dy = circleCenter.y - startPoint.y;
  const distancePx = Math.hypot(dx, dy);

  if (!(distancePx > GEOMETRY_EPSILON)) {
    return startPoint;
  }

  const clippedDistancePx = Math.max(0, distancePx - circleRadiusPx);
  const scale = clippedDistancePx / distancePx;

  return {
    x: startPoint.x + dx * scale,
    y: startPoint.y + dy * scale,
  } as CssPixelPosition;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const resolveHorizontalCapsuleSpine = (
  attach: PointLabelAttach,
  capsuleWidthPx: number,
  capsuleHeightPx: number
): { leftX: number; rightX: number; radiusPx: number } => {
  const radiusPx = Math.max(0, capsuleHeightPx / 2);
  const straightSectionWidthPx = Math.max(0, capsuleWidthPx - 2 * radiusPx);

  if (attach === "left") {
    return {
      leftX: 0,
      rightX: straightSectionWidthPx,
      radiusPx,
    };
  }

  if (attach === "right") {
    return {
      leftX: -straightSectionWidthPx,
      rightX: 0,
      radiusPx,
    };
  }

  return {
    leftX: -straightSectionWidthPx / 2,
    rightX: straightSectionWidthPx / 2,
    radiusPx,
  };
};

const isInsideHorizontalCapsule = (
  point: CssPixelPosition,
  attach: PointLabelAttach,
  capsuleWidthPx: number,
  capsuleHeightPx: number
): boolean => {
  const { leftX, rightX, radiusPx } = resolveHorizontalCapsuleSpine(
    attach,
    capsuleWidthPx,
    capsuleHeightPx
  );

  if (!(radiusPx > 0)) {
    return false;
  }

  const closestSpineX = clamp(point.x, leftX, rightX);
  const dx = point.x - closestSpineX;
  return dx * dx + point.y * point.y <= radiusPx * radiusPx + GEOMETRY_EPSILON;
};

export const resolveSegmentEndOutsideHorizontalCapsule = (
  startPoint: CssPixelPosition,
  capsuleAnchorPoint: CssPixelPosition,
  capsuleAttach: PointLabelAttach,
  capsuleWidthPx: number,
  capsuleHeightPx: number
): CssPixelPosition => {
  if (!(capsuleWidthPx > 0) || !(capsuleHeightPx > 0)) {
    return capsuleAnchorPoint;
  }

  const localStartPoint = {
    x: startPoint.x - capsuleAnchorPoint.x,
    y: startPoint.y - capsuleAnchorPoint.y,
  } as CssPixelPosition;
  const distancePx = Math.hypot(localStartPoint.x, localStartPoint.y);

  if (!(distancePx > GEOMETRY_EPSILON)) {
    return startPoint;
  }

  if (
    isInsideHorizontalCapsule(
      localStartPoint,
      capsuleAttach,
      capsuleWidthPx,
      capsuleHeightPx
    )
  ) {
    return startPoint;
  }

  const dx = localStartPoint.x / distancePx;
  const dy = localStartPoint.y / distancePx;
  let lowPx = 0;
  let highPx = distancePx;

  for (let iteration = 0; iteration < 24; iteration += 1) {
    const midPx = (lowPx + highPx) / 2;
    const candidatePoint = {
      x: dx * midPx,
      y: dy * midPx,
    } as CssPixelPosition;

    if (
      isInsideHorizontalCapsule(
        candidatePoint,
        capsuleAttach,
        capsuleWidthPx,
        capsuleHeightPx
      )
    ) {
      lowPx = midPx;
    } else {
      highPx = midPx;
    }
  }

  return {
    x: capsuleAnchorPoint.x + dx * lowPx,
    y: capsuleAnchorPoint.y + dy * lowPx,
  } as CssPixelPosition;
};
