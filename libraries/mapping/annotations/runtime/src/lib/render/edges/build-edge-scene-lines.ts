import { ecefFromGeographicCoordinate } from "@carma-geo/proj";
import { formatLengthMeters } from "@carma-units";

import type { AnnotationsRuntimeFormatOptions } from "../../config/annotations-runtime-format-options";
import {
  isValidAnnotationEngine,
  type AnnotationEngine,
} from "@carma-mapping/annotations/core";
import { annotationOverlayDefaults } from "../../config/annotation-overlay-defaults";
import {
  createAnnotationGeometryScratch,
  resolveDistanceTriangleComponentLabelVisibility,
} from "../../interaction/authoring-geometry";
import type { LiveAnnotationAnchors } from "../../interaction/live-annotation-anchors";
import {
  edgeSegmentHasLiveAnchor,
  resolveDistanceTriangleComponentEndpointsECEF,
} from "./edge-geometry";
import type { EdgeSceneLine, EdgeSegment } from "./edge-models";

export const buildEdgeSceneLines = ({
  edgeSegments,
  engine,
  formatOptions,
  liveAnchors,
  occludedLinesInScene,
}: {
  edgeSegments: readonly EdgeSegment[];
  engine: AnnotationEngine | null;
  formatOptions: AnnotationsRuntimeFormatOptions;
  liveAnchors: LiveAnnotationAnchors;
  occludedLinesInScene: boolean;
}): readonly EdgeSceneLine[] =>
  edgeSegments.flatMap((edge) => {
    const directLine: EdgeSceneLine = {
      id: edge.id,
      start: ecefFromGeographicCoordinate(edge.startCoordinate),
      end: ecefFromGeographicCoordinate(edge.endCoordinate),
      stroke: edge.stroke,
      strokeWidth: edge.strokeWidth,
      occludedDashed: occludedLinesInScene && edge.overlayDashed === true,
      ruler: edge.ruler === true,
      rulerStartMeters: edge.rulerStartMeters,
      startNodeId: edge.startNodeId,
      endNodeId: edge.endNodeId,
    };

    if (
      !isValidAnnotationEngine(engine) ||
      !edge.distanceTriangleOverlay ||
      edge.distanceTriangleOverlay.showComponents === false
    ) {
      return [directLine];
    }

    // The legs exist by geometry alone: a screen projection at build time
    // would drop them for measurements off screen or not yet projectable.
    const componentScratch = createAnnotationGeometryScratch();
    const endpoints = resolveDistanceTriangleComponentEndpointsECEF(
      edge,
      liveAnchors,
      componentScratch
    );
    if (!endpoints) {
      return [directLine];
    }
    const legLabelText = (meters: number) =>
      meters > annotationOverlayDefaults.geometryEpsilonMeters
        ? formatLengthMeters(meters, formatOptions.lengthMeters)
        : null;
    const verticalLabelText = legLabelText(
      endpoints.anchorECEF.distanceTo(endpoints.auxiliaryECEF)
    );
    const horizontalLabelText = legLabelText(
      endpoints.auxiliaryECEF.distanceTo(endpoints.targetECEF)
    );
    const legVisibility = resolveDistanceTriangleComponentLabelVisibility({
      directLabelText: formatLengthMeters(
        endpoints.anchorECEF.distanceTo(endpoints.targetECEF),
        formatOptions.lengthMeters
      ),
      verticalLabelText,
      horizontalLabelText,
    });
    const screenData = {
      anchorPointECEF: endpoints.anchorECEF,
      auxiliaryPointECEF: endpoints.auxiliaryECEF,
      targetPointECEF: endpoints.targetECEF,
      verticalLabelText,
      horizontalLabelText,
      showVerticalLabel: legVisibility.showVerticalLabel,
      showHorizontalLabel: legVisibility.showHorizontalLabel,
    };

    const componentLines: EdgeSceneLine[] = [];

    if (screenData.showVerticalLabel && screenData.verticalLabelText) {
      // Persistent scratch so the per-frame recompute does not allocate.
      const verticalRecomputeScratch = createAnnotationGeometryScratch();
      componentLines.push({
        id: `${edge.id}-vertical`,
        halo: true,
        start: screenData.anchorPointECEF,
        end: screenData.auxiliaryPointECEF,
        stroke: annotationOverlayDefaults.verticalLineColor,
        strokeWidth: edge.strokeWidth,
        occludedDashed: occludedLinesInScene,
        ruler: edge.ruler === true,
        recompute: (currentLiveAnchors) => {
          if (!edgeSegmentHasLiveAnchor(edge, currentLiveAnchors)) {
            return null;
          }
          const endpoints = resolveDistanceTriangleComponentEndpointsECEF(
            edge,
            currentLiveAnchors,
            verticalRecomputeScratch
          );
          return endpoints
            ? [endpoints.anchorECEF, endpoints.auxiliaryECEF]
            : null;
        },
      });
    }

    if (screenData.showHorizontalLabel && screenData.horizontalLabelText) {
      const horizontalRecomputeScratch = createAnnotationGeometryScratch();
      componentLines.push({
        id: `${edge.id}-horizontal`,
        halo: true,
        start: screenData.auxiliaryPointECEF,
        end: screenData.targetPointECEF,
        stroke: annotationOverlayDefaults.horizontalLineColor,
        strokeWidth: edge.strokeWidth,
        occludedDashed: occludedLinesInScene,
        ruler: edge.ruler === true,
        recompute: (currentLiveAnchors) => {
          if (!edgeSegmentHasLiveAnchor(edge, currentLiveAnchors)) {
            return null;
          }
          const endpoints = resolveDistanceTriangleComponentEndpointsECEF(
            edge,
            currentLiveAnchors,
            horizontalRecomputeScratch
          );
          return endpoints
            ? [endpoints.auxiliaryECEF, endpoints.targetECEF]
            : null;
        },
      });
    }

    return [directLine, ...componentLines];
  });
