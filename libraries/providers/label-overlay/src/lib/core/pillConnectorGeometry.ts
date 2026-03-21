import type { CssPixelPosition } from "@carma/units/types";

import type { PointLabelAttach } from "./pointLabelAttach";

const GEOMETRY_EPSILON = 1e-6;

export const estimatePillCapRadiusPx = (fontSizePx: number): number =>
  Number.isFinite(fontSizePx) && fontSizePx > 0 ? fontSizePx * 0.95 : 10;

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
