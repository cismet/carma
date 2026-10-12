import type { AnnotationsRuntimeFormatOptions } from "../../config/annotations-runtime-format-options";
import type { AnnotationEngine } from "@carma-mapping/annotations/core";
import { hideLineLabels } from "../../interaction/authoring-visual-runtime";
import type { LiveAnnotationAnchors } from "../../interaction/live-annotation-anchors";
import type { SecondaryLineLabelConflictCandidate } from "../secondary-line-label-conflict-resolution";
import {
  hideDistanceTriangleCornerHandle,
  updateDistanceTriangleCornerHandle,
  type DistanceTriangleCornerHandle,
} from "./distance-triangle-corner-handle";
import type { DistanceTriangleLabelHandle } from "./edge-label-handles";
import {
  resolveDistanceTriangleOverlayScreenData,
  resolveOverlayZIndexAtWorldPosition,
  resolveOverlayZIndexBetweenWorldPositions,
} from "./edge-geometry";
import {
  resolveDistanceTriangleAnnotationId,
  type EdgeSegment,
} from "./edge-models";

/**
 * Positions the three line labels and the corner handle of one distance
 * triangle for the current frame; the labels join the shared collision pass.
 */
export const updateDistanceTriangleOverlay = ({
  engine,
  edge,
  labelHandle,
  cornerHandle,
  formatOptions,
  liveAnchors,
  candidates,
  cornerClickable,
  onCornerClick,
}: {
  engine: AnnotationEngine;
  edge: EdgeSegment;
  labelHandle: DistanceTriangleLabelHandle;
  cornerHandle: DistanceTriangleCornerHandle | undefined;
  formatOptions: AnnotationsRuntimeFormatOptions;
  liveAnchors: LiveAnnotationAnchors;
  candidates: SecondaryLineLabelConflictCandidate[];
  cornerClickable: boolean;
  onCornerClick?: (annotationId: string) => void;
}) => {
  const screenData = resolveDistanceTriangleOverlayScreenData({
    engine,
    edge,
    scratch: labelHandle.scratch,
    previousOutsideSigns: labelHandle.previousOutsideSigns,
    formatOptions,
    liveAnchors,
  });
  if (!screenData) {
    hideLineLabels(labelHandle.lineLabels);
    if (cornerHandle) {
      hideDistanceTriangleCornerHandle(cornerHandle);
    }
    labelHandle.previousOutsideSigns = undefined;
    return;
  }

  labelHandle.previousOutsideSigns = screenData.nextOutsideSigns;

  const directOverlayZIndex = resolveOverlayZIndexBetweenWorldPositions(
    engine,
    screenData.anchorPointECEF,
    screenData.targetPointECEF
  );
  const verticalOverlayZIndex = resolveOverlayZIndexBetweenWorldPositions(
    engine,
    screenData.anchorPointECEF,
    screenData.auxiliaryPointECEF
  );
  const horizontalOverlayZIndex = resolveOverlayZIndexBetweenWorldPositions(
    engine,
    screenData.auxiliaryPointECEF,
    screenData.targetPointECEF
  );
  const cornerOverlayZIndex = resolveOverlayZIndexAtWorldPosition(
    engine,
    screenData.auxiliaryPointECEF
  );
  const annotationId = resolveDistanceTriangleAnnotationId(edge);
  const directLengthMeters = screenData.anchorPointECEF.distanceTo(
    screenData.targetPointECEF
  );
  const verticalLengthMeters = screenData.anchorPointECEF.distanceTo(
    screenData.auxiliaryPointECEF
  );
  const horizontalLengthMeters = screenData.auxiliaryPointECEF.distanceTo(
    screenData.targetPointECEF
  );

  labelHandle.lineLabels.direct.style.zIndex = `${directOverlayZIndex}`;
  candidates.push({
    element: labelHandle.lineLabels.direct,
    zIndex: directOverlayZIndex,
    annotationId,
    metricValueMeters: directLengthMeters,
    text: screenData.directLabelText,
    start: screenData.anchorScreenPosition,
    end: screenData.targetScreenPosition,
    outsideReferencePoint: screenData.directOutsideReferencePoint,
  });

  if (screenData.showVerticalLabel && screenData.verticalLabelText) {
    labelHandle.lineLabels.vertical.style.zIndex = `${verticalOverlayZIndex}`;
    candidates.push({
      element: labelHandle.lineLabels.vertical,
      zIndex: verticalOverlayZIndex,
      annotationId,
      metricValueMeters: verticalLengthMeters,
      text: screenData.verticalLabelText,
      start: screenData.anchorScreenPosition,
      end: screenData.auxiliaryScreenPosition,
      outsideReferencePoint: screenData.verticalOutsideReferencePoint,
      flipReadingDirection: true,
    });
  } else {
    labelHandle.lineLabels.vertical.style.display = "none";
  }

  if (screenData.showHorizontalLabel && screenData.horizontalLabelText) {
    labelHandle.lineLabels.horizontal.style.zIndex = `${horizontalOverlayZIndex}`;
    candidates.push({
      element: labelHandle.lineLabels.horizontal,
      zIndex: horizontalOverlayZIndex,
      annotationId,
      metricValueMeters: horizontalLengthMeters,
      text: screenData.horizontalLabelText,
      start: screenData.auxiliaryScreenPosition,
      end: screenData.targetScreenPosition,
      outsideReferencePoint: screenData.horizontalOutsideReferencePoint,
    });
  } else {
    labelHandle.lineLabels.horizontal.style.display = "none";
  }

  if (!cornerHandle) {
    return;
  }
  cornerHandle.root.style.zIndex = `${cornerOverlayZIndex}`;

  updateDistanceTriangleCornerHandle({
    engine,
    cornerHandle,
    screenData,
    lengths: {
      directLengthMeters,
      verticalLengthMeters,
      horizontalLengthMeters,
    },
    clickable: cornerClickable,
    onClick: onCornerClick
      ? () => onCornerClick(resolveDistanceTriangleAnnotationId(edge))
      : undefined,
  });
};
