import {
  distanceVisualizationDefaults,
  type DistanceTriangleLineLabelOutsideSigns,
  type AnnotationEngine,
} from "@carma-mapping/annotations/core";
import { formatLengthMeters } from "@carma-units";

import type { AnnotationsRuntimeFormatOptions } from "../../config/annotations-runtime-format-options";
import {
  createAnnotationGeometryScratch,
  type AnnotationGeometryScratch,
} from "../../interaction/authoring-geometry";
import {
  createLineLabel,
  createSegmentLineLabels,
  hideLineLabels,
  type AuthoringSegmentLineLabels,
} from "../../interaction/authoring-line-label";
import type { LiveAnnotationAnchors } from "../../interaction/live-annotation-anchors";

import type { PartialAnnotationLineLabelOptions } from "../../config/annotation-line-label-options";
import { annotationVisualDefaults } from "../../config/annotation-visual-defaults";
import type { SecondaryLineLabelConflictCandidate } from "../secondary-line-label-conflict-resolution";
import { resolveEdgePointECEF } from "./edge-geometry";
import { resolveOverlayZIndexBetweenWorldPositions } from "./edge-overlay-layout";
import { toCssPixelPosition } from "../../interaction/css-pixel-position";
import type { EdgeSegment } from "./edge-models";

export type DistanceTriangleLabelHandle = {
  lineLabels: AuthoringSegmentLineLabels;
  scratch: AnnotationGeometryScratch;
  previousOutsideSigns?: DistanceTriangleLineLabelOutsideSigns;
};

export type EdgeSegmentLabelHandle = {
  element: HTMLDivElement;
};

export const createDistanceTriangleLabelHandle = (
  overlayLayer: HTMLElement,
  lineLabelOptions?: PartialAnnotationLineLabelOptions
): DistanceTriangleLabelHandle => {
  const lineLabels = createSegmentLineLabels(lineLabelOptions);
  overlayLayer.append(
    lineLabels.direct,
    lineLabels.vertical,
    lineLabels.horizontal
  );

  return {
    lineLabels,
    scratch: createAnnotationGeometryScratch(),
  };
};

export const createEdgeSegmentLabelHandle = (
  overlayLayer: HTMLElement,
  lineLabelOptions?: PartialAnnotationLineLabelOptions
): EdgeSegmentLabelHandle => {
  const element = createLineLabel(
    annotationVisualDefaults.colors.componentLabelAccents.direct,
    lineLabelOptions
  );
  overlayLayer.appendChild(element);

  return {
    element,
  };
};

export const destroyDistanceTriangleLabelHandle = (
  handle: DistanceTriangleLabelHandle
) => {
  hideLineLabels(handle.lineLabels);
  handle.lineLabels.direct.remove();
  handle.lineLabels.vertical.remove();
  handle.lineLabels.horizontal.remove();
};

export const destroyEdgeSegmentLabelHandle = (
  handle: EdgeSegmentLabelHandle
) => {
  handle.element.style.display = "none";
  handle.element.remove();
};

export const destroyDistanceTriangleLabelHandles = (
  handles: Map<string, DistanceTriangleLabelHandle>
) => {
  handles.forEach((handle) => {
    destroyDistanceTriangleLabelHandle(handle);
  });
  handles.clear();
};

export const destroyEdgeSegmentLabelHandles = (
  handles: Map<string, EdgeSegmentLabelHandle>
) => {
  handles.forEach((handle) => {
    destroyEdgeSegmentLabelHandle(handle);
  });
  handles.clear();
};

export const updateEdgeSegmentLabel = ({
  engine,
  edge,
  labelHandle,
  formatOptions,
  liveAnchors,
  candidates,
}: {
  engine: AnnotationEngine;
  edge: EdgeSegment;
  labelHandle: EdgeSegmentLabelHandle;
  formatOptions: AnnotationsRuntimeFormatOptions;
  liveAnchors: LiveAnnotationAnchors;
  candidates: SecondaryLineLabelConflictCandidate[];
}) => {
  const startPointECEF = resolveEdgePointECEF(
    liveAnchors,
    edge.startNodeId,
    edge.startCoordinate
  );
  const endPointECEF = resolveEdgePointECEF(
    liveAnchors,
    edge.endNodeId,
    edge.endCoordinate
  );
  const startScreenPosition = engine.worldToScreen(startPointECEF);
  const endScreenPosition = engine.worldToScreen(endPointECEF);
  const segmentLengthMeters = startPointECEF.distanceTo(endPointECEF);

  if (
    startScreenPosition === null ||
    endScreenPosition === null ||
    segmentLengthMeters <=
      distanceVisualizationDefaults.referenceLineEpsilonMeters
  ) {
    labelHandle.element.style.display = "none";
    return;
  }

  const overlayZIndex = resolveOverlayZIndexBetweenWorldPositions(
    engine,
    startPointECEF,
    endPointECEF
  );
  labelHandle.element.style.zIndex = `${overlayZIndex}`;
  candidates.push({
    element: labelHandle.element,
    zIndex: overlayZIndex,
    annotationId: edge.annotationId ?? edge.id,
    metricValueMeters: segmentLengthMeters,
    text: formatLengthMeters(segmentLengthMeters, formatOptions.lengthMeters),
    start: toCssPixelPosition(startScreenPosition),
    end: toCssPixelPosition(endScreenPosition),
  });
};
