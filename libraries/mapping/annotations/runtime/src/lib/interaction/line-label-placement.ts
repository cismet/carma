import {
  clampUnitRangeRatio,
  type CssPixels,
  type Ratio,
  type Radians,
} from "@carma-units";
import { SVG_LINE_LABEL_ROTATION_MODE } from "@carma-commons/svg";
import {
  resolveOverlayLineLabelPlacement,
  type LineLabelPlacementOptions,
} from "@carma-providers/label-overlay";

import {
  annotationLineLabelDefaults,
  annotationLineLabelPlacementDefaults,
} from "../config/annotation-line-label-options";
import { annotationOverlayDefaults } from "../config/annotation-overlay-defaults";
import type { AnnotationScreenPosition } from "../engine";
import { toCssPixelPosition } from "./css-pixel-position";

export type AnnotationLineLabelKind = "direct" | "vertical" | "horizontal";
type AnnotationLineLabelAnchor = "center" | "left" | "right";

export type AnnotationLineLabelPlacement = {
  x: CssPixels;
  y: CssPixels;
  angleRad: Radians;
  anchor: AnnotationLineLabelAnchor;
  anchorRatio: Ratio;
  isShortEdge: boolean;
  shouldFlip: boolean;
  normalX: number;
  normalY: number;
};

const ANNOTATION_LINE_LABEL_PLACEMENT_OPTIONS_BY_KIND: Record<
  AnnotationLineLabelKind,
  LineLabelPlacementOptions
> = Object.freeze({
  direct: {
    labelOffsetPx: annotationOverlayDefaults.lineLabelOffsetPx,
  },
  vertical: {
    labelOffsetPx: annotationOverlayDefaults.lineLabelOffsetPx,
    labelFlippedBaselineOffsetPx:
      annotationLineLabelPlacementDefaults.verticalFlippedBaselineOffsetPx,
    labelRotationMode: SVG_LINE_LABEL_ROTATION_MODE.CLOCKWISE,
  },
  horizontal: {
    labelOffsetPx: annotationOverlayDefaults.lineLabelOffsetPx,
  },
});

const resolveAnnotationLineLabelPlacementOptions = ({
  kind,
  outsideReferencePoint,
  anchorRatio,
}: {
  kind: AnnotationLineLabelKind;
  outsideReferencePoint?: AnnotationScreenPosition | null;
  anchorRatio?: number;
}): LineLabelPlacementOptions => ({
  ...ANNOTATION_LINE_LABEL_PLACEMENT_OPTIONS_BY_KIND[kind],
  anchorRatio:
    anchorRatio === undefined ? undefined : clampUnitRangeRatio(anchorRatio),
  getLabelOutsideReferencePoint: outsideReferencePoint
    ? () => toCssPixelPosition(outsideReferencePoint)
    : undefined,
});

export const resolveAnnotationLineLabelTransform = ({
  x,
  y,
  angleRad,
  anchor,
}: AnnotationLineLabelPlacement) =>
  `translate(${Math.round(x)}px, ${Math.round(y)}px) ${
    anchor === "left"
      ? "translate(0%, -50%)"
      : anchor === "right"
      ? "translate(-100%, -50%)"
      : "translate(-50%, -50%)"
  } rotate(${angleRad}rad)`;

export const resolveLabelOffsetPosition = ({
  start,
  end,
  kind,
  outsideReferencePoint,
  shortEdgeOffsetPx = annotationLineLabelDefaults.layout.shortEdgeOffsetPx,
  useShortEdgeRules = true,
  previousShouldFlip = false,
  anchorRatio,
}: {
  start: AnnotationScreenPosition;
  end: AnnotationScreenPosition;
  kind: AnnotationLineLabelKind;
  outsideReferencePoint?: AnnotationScreenPosition | null;
  shortEdgeOffsetPx?: number;
  useShortEdgeRules?: boolean;
  previousShouldFlip?: boolean;
  anchorRatio?: number;
}): AnnotationLineLabelPlacement | null => {
  const sharedPlacement = resolveOverlayLineLabelPlacement({
    svgLine: { start: toCssPixelPosition(start), end: toCssPixelPosition(end) },
    options: resolveAnnotationLineLabelPlacementOptions({
      kind,
      outsideReferencePoint,
      anchorRatio,
    }),
    previousShouldFlip,
    sideSwitchThresholdPx:
      annotationLineLabelPlacementDefaults.sideHysteresisPx,
  });
  if (!sharedPlacement) {
    return null;
  }

  if (
    useShortEdgeRules &&
    sharedPlacement.lineLengthPx <
      annotationOverlayDefaults.lineLabelMinLengthPx
  ) {
    const labelIsPlacedRightOfSegment = sharedPlacement.normalX >= 0;

    return {
      x: (sharedPlacement.midX +
        sharedPlacement.normalX * shortEdgeOffsetPx) as CssPixels,
      y: (sharedPlacement.midY +
        sharedPlacement.normalY * shortEdgeOffsetPx) as CssPixels,
      angleRad: 0 as Radians,
      anchor: labelIsPlacedRightOfSegment ? "left" : "right",
      anchorRatio: sharedPlacement.anchorRatio,
      isShortEdge: true,
      shouldFlip: sharedPlacement.shouldFlip,
      normalX: sharedPlacement.normalX,
      normalY: sharedPlacement.normalY,
    };
  }

  return {
    x: sharedPlacement.textX,
    y: sharedPlacement.textY,
    angleRad: sharedPlacement.angleRad,
    anchor: "center",
    anchorRatio: sharedPlacement.anchorRatio,
    isShortEdge: false,
    shouldFlip: sharedPlacement.shouldFlip,
    normalX: sharedPlacement.normalX,
    normalY: sharedPlacement.normalY,
  };
};
