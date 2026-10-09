import type { Vector3 } from "three";
import { formatLengthMeters, type CssPixelPosition } from "@carma-units";
import {
  buildDistanceTriangleLineLabelReferences,
  ecefDistance,
  ecefFromGeographicCoordinate,
  type DistanceTriangleLineLabelOutsideSigns,
  type DistanceTriangleLineLabelReferences,
} from "@carma-mapping/annotations/core";

import type { AnnotationsRuntimeFormatOptions } from "../config/annotations-runtime-format-options";
import type { AnnotationGeographicCoordinate } from "../store";
import type { AnnotationEngine } from "../engine";
import {
  buildAuxiliaryPoint,
  createAnnotationGeometryScratch,
  annotationOverlayDefaults,
  resolveDistanceTriangleComponentLabelVisibility,
  type AnnotationGeometryScratch,
} from "./authoring-visual-runtime";

type ScreenPointLike = {
  x: number;
  y: number;
};

type SegmentGuideFrameSegment = {
  startECEF: Vector3;
  endECEF: Vector3;
  startScreen: ScreenPointLike | null;
  endScreen: ScreenPointLike | null;
  labelText: string | null;
  outsideReferencePoint: ScreenPointLike | null;
};

export type SegmentGuideFrame = {
  direct: SegmentGuideFrameSegment;
  vertical: SegmentGuideFrameSegment | null;
  horizontal: SegmentGuideFrameSegment | null;
  nextOutsideSigns: DistanceTriangleLineLabelOutsideSigns | undefined;
};

const toScreenPoint = (
  engine: AnnotationEngine,
  coordinateECEF: Vector3,
  result?: ScreenPointLike
): ScreenPointLike | null => {
  const screenPosition = engine.worldToScreen(coordinateECEF, result);

  if (!screenPosition) {
    return null;
  }

  return {
    x: screenPosition.x,
    y: screenPosition.y,
  };
};

const toCssPixelPosition = (point: ScreenPointLike): CssPixelPosition =>
  ({
    x: point.x as CssPixelPosition["x"],
    y: point.y as CssPixelPosition["y"],
  } as CssPixelPosition);

const resolveComponentSegment = ({
  startECEF,
  endECEF,
  startScreen,
  endScreen,
  labelText,
  outsideReferencePoint,
}: {
  startECEF: Vector3;
  endECEF: Vector3;
  startScreen: ScreenPointLike | null;
  endScreen: ScreenPointLike | null;
  labelText: string | null;
  outsideReferencePoint: ScreenPointLike | null;
}): SegmentGuideFrameSegment | null =>
  ecefDistance(startECEF, endECEF) >
  annotationOverlayDefaults.geometryEpsilonMeters
    ? {
        startECEF,
        endECEF,
        startScreen,
        endScreen,
        labelText,
        outsideReferencePoint,
      }
    : null;

export const resolveSegmentGuideFrame = ({
  engine,
  anchorCoordinate,
  hoverCoordinate,
  hoverPointECEF,
  hoverScreenPosition,
  formatOptions,
  previousOutsideSigns,
  scratch = createAnnotationGeometryScratch(),
}: {
  engine: AnnotationEngine;
  anchorCoordinate: AnnotationGeographicCoordinate | null;
  hoverCoordinate: AnnotationGeographicCoordinate | null;
  hoverPointECEF?: Vector3 | null;
  hoverScreenPosition?: ScreenPointLike | null;
  formatOptions: AnnotationsRuntimeFormatOptions;
  previousOutsideSigns?: DistanceTriangleLineLabelOutsideSigns;
  scratch?: AnnotationGeometryScratch;
}): SegmentGuideFrame | null => {
  if (!anchorCoordinate || !hoverCoordinate) {
    return null;
  }

  const anchorPointECEF = ecefFromGeographicCoordinate(anchorCoordinate);
  const effectiveHoverPointECEF =
    hoverPointECEF ?? ecefFromGeographicCoordinate(hoverCoordinate);
  if (
    ecefDistance(anchorPointECEF, effectiveHoverPointECEF) <=
    annotationOverlayDefaults.geometryEpsilonMeters
  ) {
    return null;
  }

  const auxiliaryPoint = buildAuxiliaryPoint({
    engine,
    anchorPointECEF,
    targetPointECEF: effectiveHoverPointECEF,
    scratch,
  });
  if (!auxiliaryPoint) {
    return null;
  }

  const anchorScreenPosition = toScreenPoint(engine, anchorPointECEF);
  const effectiveHoverScreenPosition =
    hoverScreenPosition ?? toScreenPoint(engine, effectiveHoverPointECEF);
  const auxiliaryScreenPosition = toScreenPoint(
    engine,
    auxiliaryPoint,
    scratch.auxiliaryScreen
  );

  const labelReferences: DistanceTriangleLineLabelReferences | null =
    anchorScreenPosition &&
    effectiveHoverScreenPosition &&
    auxiliaryScreenPosition
      ? buildDistanceTriangleLineLabelReferences({
          anchor: toCssPixelPosition(anchorScreenPosition),
          target: toCssPixelPosition(effectiveHoverScreenPosition),
          aux: toCssPixelPosition(auxiliaryScreenPosition),
          anchorAltitudeMeters: anchorCoordinate.altitude,
          targetAltitudeMeters: hoverCoordinate.altitude,
          previousOutsideSigns,
        })
      : null;

  const directLabelText = formatLengthMeters(
    ecefDistance(anchorPointECEF, effectiveHoverPointECEF),
    formatOptions.lengthMeters
  );
  const verticalLabelText = formatLengthMeters(
    ecefDistance(anchorPointECEF, auxiliaryPoint),
    formatOptions.lengthMeters
  );
  const horizontalLabelText = formatLengthMeters(
    ecefDistance(auxiliaryPoint, effectiveHoverPointECEF),
    formatOptions.lengthMeters
  );
  const componentLabelVisibility =
    resolveDistanceTriangleComponentLabelVisibility({
      directLabelText,
      verticalLabelText,
      horizontalLabelText,
    });

  return {
    direct: {
      startECEF: anchorPointECEF,
      endECEF: effectiveHoverPointECEF,
      startScreen: anchorScreenPosition,
      endScreen: effectiveHoverScreenPosition,
      labelText: directLabelText,
      outsideReferencePoint:
        labelReferences?.directOutsideReferencePoint ?? null,
    },
    vertical: resolveComponentSegment({
      startECEF: anchorPointECEF,
      endECEF: auxiliaryPoint,
      startScreen: anchorScreenPosition,
      endScreen: auxiliaryScreenPosition,
      labelText: componentLabelVisibility.showVerticalLabel
        ? verticalLabelText
        : null,
      outsideReferencePoint:
        labelReferences?.verticalOutsideReferencePoint ?? null,
    }),
    horizontal: resolveComponentSegment({
      startECEF: auxiliaryPoint,
      endECEF: effectiveHoverPointECEF,
      startScreen: auxiliaryScreenPosition,
      endScreen: effectiveHoverScreenPosition,
      labelText: componentLabelVisibility.showHorizontalLabel
        ? horizontalLabelText
        : null,
      outsideReferencePoint:
        labelReferences?.horizontalOutsideReferencePoint ?? null,
    }),
    nextOutsideSigns: labelReferences?.nextOutsideSigns,
  };
};
