import { PI_OVER_THREE } from "@carma-units";
import { getAnnotationSurfaceAccentCssColor } from "@carma-mapping/annotations/core";
import {
  labelOverlayAffordanceDefaults,
  labelOverlayLayerDefaults,
  resolveOverlayMidpointTickMetrics,
} from "@carma-providers/label-overlay";

import { annotationVisualDefaults } from "../../config/annotation-visual-defaults";

export const annotationEdgeDefaults = Object.freeze({
  pointLabelCollisionSelector:
    '[data-pillbutton-root="true"], [data-point-label-content-root="true"]',
  svgNamespace: "http://www.w3.org/2000/svg",
  distanceTriangle: Object.freeze({
    cornerDotRadiusPx: 1.25 / 2,
  }),
  midpointMarker: Object.freeze({
    ...resolveOverlayMidpointTickMetrics({
      markerDiameterPx: annotationVisualDefaults.sizes.pointPixelSize,
      markerStrokeWidthPx: annotationVisualDefaults.sizes.pointOutlineWidth,
    }),
    tickColor: labelOverlayAffordanceDefaults.colors.surfaceStrong,
    minOverlayZIndex: labelOverlayLayerDefaults.zIndex.interactionHandleFloor,
  }),
});

export const distanceTriangleVisualDefaults = Object.freeze({
  cornerOverlay: Object.freeze({
    minBoxPx: 20,
    paddingPx: 6,
    targetRadiusPx: 20,
    segments: 20,
    strokeWidthPx: 1.25,
    color: getAnnotationSurfaceAccentCssColor(),
    straightHitTargetPx: 20,
    /** Vertical field of view assumed when the engine reports no pixel scale. */
    fallbackFovRad: PI_OVER_THREE,
  }),
});

export const resolveDistanceTriangleLabelLayerId = (surfaceKey: string) =>
  `annotation-overlay-distance-triangle-label-layer-${surfaceKey}`;
