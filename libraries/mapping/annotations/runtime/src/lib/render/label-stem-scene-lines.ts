import { Vector3 } from "three";
import type { PointLabelStemSegment } from "@carma-providers/label-overlay";
import type { CssPixelPosition } from "@carma-units";

import type {
  AnnotationEngine,
  AnnotationSceneLineStyle,
} from "@carma-mapping/annotations/core";

/**
 * The connector from a node to its label pill as a scene line, looking like
 * the overlay stem it replaces: drawn over the scene, 1px in the label's line
 * colour and opacity, solid while the node shows and dashed as a whole while
 * the node is hidden.
 */
export const LABEL_STEM_SCENE_DEFAULTS = Object.freeze({
  /** The overlay draws its stem 1px wide. */
  widthPx: 1,
  /** The dash of a 1px dashed CSS border. */
  occludedDash: Object.freeze({ dashPx: 3, gapPx: 3 }),
});

/** What a scene stem takes from its label's layout this frame. */
export type LabelStemLayout = {
  anchorECEF: Vector3;
  segment: PointLabelStemSegment;
  /** The label's anchor occlusion verdict; the whole stem follows it. */
  isOccluded: boolean;
  /** The label's opacity, which the stem shares. */
  opacity: number;
};

/** Where the view ray through `screen` meets the plane through `anchor` facing the camera. */
const resolveOnAnchorPlane = (
  engine: AnnotationEngine,
  screen: { x: number; y: number },
  anchorECEF: Vector3,
  planeNormal: Vector3
) => {
  const ray = engine.getPickRay(screen);
  if (!ray) return null;
  const facing = ray.direction.dot(planeNormal);
  if (!(Math.abs(facing) > 1e-9)) return null;
  const distance =
    new Vector3().subVectors(anchorECEF, ray.origin).dot(planeNormal) / facing;
  return distance > 0
    ? ray.origin.clone().addScaledVector(ray.direction, distance)
    : null;
};

/** The stem's ends at the anchor's depth, where they project onto the overlay's segment. */
export const resolveLabelStemPositionsECEF = (
  engine: AnnotationEngine,
  anchorECEF: Vector3,
  segment: PointLabelStemSegment
): [Vector3, Vector3] | null => {
  const anchorScreen = engine.worldToScreen(anchorECEF);
  const anchorRay = anchorScreen ? engine.getPickRay(anchorScreen) : null;
  if (!anchorScreen || !anchorRay) return null;
  const onPlane = (offset: CssPixelPosition) =>
    resolveOnAnchorPlane(
      engine,
      { x: anchorScreen.x + offset.x, y: anchorScreen.y + offset.y },
      anchorECEF,
      anchorRay.direction
    );
  const start = onPlane(segment.start);
  const end = onPlane(segment.end);
  return start && end ? [start, end] : null;
};

export const resolveLabelStemSceneStyle = (
  color: string,
  { isOccluded, opacity }: Pick<LabelStemLayout, "isOccluded" | "opacity">
): AnnotationSceneLineStyle => ({
  color,
  width: LABEL_STEM_SCENE_DEFAULTS.widthPx,
  overlay: true,
  halo: false,
  opacity,
  ...(isOccluded ? { dash: LABEL_STEM_SCENE_DEFAULTS.occludedDash } : {}),
});
