import type { Vector3 } from "three";
import type { CssPixelPosition } from "@carma-units";

import type {
  AnnotationEngine,
  AnnotationScreenPosition,
} from "@carma-mapping/annotations/core";

/** Brands an engine screen position, which is in CSS pixels. */
export const toCssPixelPosition = ({
  x,
  y,
}: AnnotationScreenPosition): CssPixelPosition => ({
  x: x as CssPixelPosition["x"],
  y: y as CssPixelPosition["y"],
});

export const worldToCssPixelPosition = (
  engine: AnnotationEngine,
  positionECEF: Vector3
): CssPixelPosition | null => {
  const screenPosition = engine.worldToScreen(positionECEF);
  return screenPosition ? toCssPixelPosition(screenPosition) : null;
};
