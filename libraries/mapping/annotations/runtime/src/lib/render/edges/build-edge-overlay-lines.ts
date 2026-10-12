import { createSvgLineVisualizers } from "@carma-commons/svg";
import type { LineVisualizerData } from "@carma-providers/label-overlay";

import type { AnnotationsRuntimeFormatOptions } from "../../config/annotations-runtime-format-options";
import {
  isValidAnnotationEngine,
  type AnnotationEngine,
} from "@carma-mapping/annotations/core";
import {
  annotationOverlayDefaults,
  createAnnotationGeometryScratch,
} from "../../interaction/authoring-visual-runtime";
import type { LiveAnnotationAnchors } from "../../interaction/live-annotation-anchors";
import {
  resolveDistanceTriangleOverlayScreenData,
  resolveEdgePointECEF,
  toCssPixelPosition,
} from "./edge-geometry";
import type { EdgeSegment } from "./edge-models";

export const buildEdgeOverlayLines = ({
  edgeSegments,
  engine,
  formatOptions,
  liveAnchors,
  occludedLinesInScene,
  surfaceKey,
  activeEditedNodeId,
  blockEdgeInteractions,
  onEdgeClick,
  onAnnotationSelect,
}: {
  edgeSegments: readonly EdgeSegment[];
  engine: AnnotationEngine | null;
  formatOptions: AnnotationsRuntimeFormatOptions;
  liveAnchors: LiveAnnotationAnchors;
  occludedLinesInScene: boolean;
  surfaceKey: string;
  activeEditedNodeId: string | null;
  blockEdgeInteractions: boolean;
  onEdgeClick?: (startNodeId: string, endNodeId: string) => boolean;
  onAnnotationSelect?: (annotationId: string) => void;
}): readonly LineVisualizerData[] =>
  edgeSegments.flatMap((edge) => {
    const referenceEdgeClickHandler =
      activeEditedNodeId && edge.startNodeId && edge.endNodeId && onEdgeClick
        ? () => onEdgeClick(edge.startNodeId!, edge.endNodeId!)
        : undefined;
    const selectionEdgeClickHandler =
      !blockEdgeInteractions &&
      onAnnotationSelect &&
      edge.distanceTriangleOverlay?.annotationId
        ? () => onAnnotationSelect(edge.distanceTriangleOverlay!.annotationId!)
        : undefined;
    const lineClickHandler =
      referenceEdgeClickHandler ?? selectionEdgeClickHandler;
    // The dashed overlay trace duplicates a scene line; the engine draws
    // the occluded part itself when it can.
    const baseLines =
      occludedLinesInScene && edge.overlayDashed
        ? []
        : createSvgLineVisualizers({
            id: `${surfaceKey}-runtime-edge-overlay-${edge.id}`,
            getSvgLine: () => {
              if (!isValidAnnotationEngine(engine)) {
                return null;
              }

              const start = engine.worldToScreen(
                resolveEdgePointECEF(
                  liveAnchors,
                  edge.startNodeId,
                  edge.startCoordinate
                )
              );
              const end = engine.worldToScreen(
                resolveEdgePointECEF(
                  liveAnchors,
                  edge.endNodeId,
                  edge.endCoordinate
                )
              );
              if (start === null || end === null) {
                return null;
              }

              return {
                start: toCssPixelPosition(start.x, start.y),
                end: toCssPixelPosition(end.x, end.y),
              };
            },
            stroke: edge.stroke,
            strokeWidth: edge.strokeWidth,
            dashed: edge.overlayDashed,
            dashPattern: edge.overlayDashPattern,
            hitTargetStrokeWidth: 10,
            onLineClick: lineClickHandler,
          });

    if (
      !edge.distanceTriangleOverlay ||
      !isValidAnnotationEngine(engine) ||
      occludedLinesInScene
    ) {
      return baseLines;
    }

    const componentScratch = createAnnotationGeometryScratch();
    const getScreenData = () =>
      resolveDistanceTriangleOverlayScreenData({
        engine,
        edge,
        scratch: componentScratch,
        formatOptions,
        liveAnchors,
      });

    return [
      ...baseLines,
      ...createSvgLineVisualizers({
        id: `${surfaceKey}-runtime-edge-overlay-${edge.id}-vertical`,
        getSvgLine: () => {
          const screenData = getScreenData();
          if (!screenData || !screenData.verticalLabelText) {
            return null;
          }

          return {
            start: screenData.anchorScreenPosition,
            end: screenData.auxiliaryScreenPosition,
          };
        },
        stroke: annotationOverlayDefaults.verticalLineColor,
        strokeWidth: edge.strokeWidth,
        dashed: true,
        dashPattern: edge.overlayDashPattern,
        hitTargetStrokeWidth: 8,
        onLineClick: lineClickHandler,
      }),
      ...createSvgLineVisualizers({
        id: `${surfaceKey}-runtime-edge-overlay-${edge.id}-horizontal`,
        getSvgLine: () => {
          const screenData = getScreenData();
          if (!screenData || !screenData.horizontalLabelText) {
            return null;
          }

          return {
            start: screenData.auxiliaryScreenPosition,
            end: screenData.targetScreenPosition,
          };
        },
        stroke: annotationOverlayDefaults.horizontalLineColor,
        strokeWidth: edge.strokeWidth,
        dashed: true,
        dashPattern: edge.overlayDashPattern,
        hitTargetStrokeWidth: 8,
        onLineClick: lineClickHandler,
      }),
    ];
  });
