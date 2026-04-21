import {
  Cartesian2,
  Cartesian3,
  SceneTransforms,
  defined,
} from "@carma-cesium";
import { formatLengthMeters } from "@carma-units";
import { cartesian3FromGeographicCoordinate } from "@carma-mapping/engines/cesium/core";

import type { AnnotationsRuntimeFormatOptions } from "../config/annotations-runtime-format-options";
import type { CesiumGeographicCoordinate } from "../store";
import type { Scene } from "@carma-cesium";
import {
  buildAuxiliaryPoint,
  buildPreviewDistanceTriangleLabelReferences,
  createPreviewSegmentScratch,
  previewControllerDefaults,
  resolvePreviewDistanceTriangleComponentLabelVisibility,
  type PreviewDistanceTriangleLabelReferences,
  type PreviewSegmentScratch,
} from "./authoring-visual-runtime";

type ScreenPointLike = {
  x: number;
  y: number;
};

type SegmentGuideFrameSegment = {
  startECEF: Cartesian3;
  endECEF: Cartesian3;
  startScreen: ScreenPointLike | null;
  endScreen: ScreenPointLike | null;
  labelText: string | null;
  outsideReferencePoint: ScreenPointLike | null;
};

export type SegmentGuideFrame = {
  direct: SegmentGuideFrameSegment;
  vertical: SegmentGuideFrameSegment | null;
  horizontal: SegmentGuideFrameSegment | null;
  nextVerticalOutsideSign: -1 | 1 | undefined;
};

const toScreenPoint = (
  scene: Scene,
  coordinateECEF: Cartesian3,
  result?: Cartesian2
): ScreenPointLike | null => {
  const screenPosition = SceneTransforms.worldToWindowCoordinates(
    scene,
    coordinateECEF,
    result
  );

  if (!defined(screenPosition)) {
    return null;
  }

  return {
    x: screenPosition.x,
    y: screenPosition.y,
  };
};

const resolveComponentSegment = ({
  startECEF,
  endECEF,
  startScreen,
  endScreen,
  labelText,
  outsideReferencePoint,
}: {
  startECEF: Cartesian3;
  endECEF: Cartesian3;
  startScreen: ScreenPointLike | null;
  endScreen: ScreenPointLike | null;
  labelText: string | null;
  outsideReferencePoint: ScreenPointLike | null;
}): SegmentGuideFrameSegment | null =>
  Cartesian3.distance(startECEF, endECEF) >
  previewControllerDefaults.geometryEpsilonMeters
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
  scene,
  anchorCoordinate,
  hoverCoordinate,
  hoverPointECEF,
  hoverScreenPosition,
  formatOptions,
  previousVerticalOutsideSign,
  scratch = createPreviewSegmentScratch(),
}: {
  scene: Scene;
  anchorCoordinate: CesiumGeographicCoordinate | null;
  hoverCoordinate: CesiumGeographicCoordinate | null;
  hoverPointECEF?: Cartesian3 | null;
  hoverScreenPosition?: ScreenPointLike | null;
  formatOptions: AnnotationsRuntimeFormatOptions;
  previousVerticalOutsideSign?: -1 | 1;
  scratch?: PreviewSegmentScratch;
}): SegmentGuideFrame | null => {
  if (!anchorCoordinate || !hoverCoordinate) {
    return null;
  }

  const anchorPointECEF = cartesian3FromGeographicCoordinate(anchorCoordinate);
  const effectiveHoverPointECEF =
    hoverPointECEF ?? cartesian3FromGeographicCoordinate(hoverCoordinate);
  if (
    Cartesian3.distance(anchorPointECEF, effectiveHoverPointECEF) <=
    previewControllerDefaults.geometryEpsilonMeters
  ) {
    return null;
  }

  const auxiliaryPoint = buildAuxiliaryPoint({
    scene,
    anchorPointECEF,
    targetPointECEF: effectiveHoverPointECEF,
    scratch,
  });
  if (!auxiliaryPoint) {
    return null;
  }

  const anchorScreenPosition = toScreenPoint(scene, anchorPointECEF);
  const effectiveHoverScreenPosition =
    hoverScreenPosition ?? toScreenPoint(scene, effectiveHoverPointECEF);
  const auxiliaryScreenPosition = toScreenPoint(
    scene,
    auxiliaryPoint,
    scratch.auxiliaryScreen
  );

  const labelReferences: PreviewDistanceTriangleLabelReferences | null =
    anchorScreenPosition &&
    effectiveHoverScreenPosition &&
    auxiliaryScreenPosition
      ? buildPreviewDistanceTriangleLabelReferences({
          anchor: anchorScreenPosition,
          target: effectiveHoverScreenPosition,
          aux: auxiliaryScreenPosition,
          anchorAltitudeMeters: anchorCoordinate.altitude,
          targetAltitudeMeters: hoverCoordinate.altitude,
          previousVerticalOutsideSign,
        })
      : null;

  const directLabelText = formatLengthMeters(
    Cartesian3.distance(anchorPointECEF, effectiveHoverPointECEF),
    formatOptions.lengthMeters
  );
  const verticalLabelText = formatLengthMeters(
    Cartesian3.distance(anchorPointECEF, auxiliaryPoint),
    formatOptions.lengthMeters
  );
  const horizontalLabelText = formatLengthMeters(
    Cartesian3.distance(auxiliaryPoint, effectiveHoverPointECEF),
    formatOptions.lengthMeters
  );
  const componentLabelVisibility =
    resolvePreviewDistanceTriangleComponentLabelVisibility({
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
    nextVerticalOutsideSign: labelReferences?.nextVerticalOutsideSign,
  };
};
