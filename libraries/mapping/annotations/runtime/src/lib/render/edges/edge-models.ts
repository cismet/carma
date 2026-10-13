import { ecefFromGeographicCoordinate } from "@carma-geo/proj";
import type { Vector3 } from "three";

import { annotationVisualDefaults } from "../../config/annotation-visual-defaults";
import type { LiveAnnotationAnchors } from "../../interaction/live-annotation-anchors";
import type {
  RuntimeDistanceTriangleOverlayRenderModel,
  RuntimeEdgeRenderModel,
} from "../annotation-render-models";

export type EdgeSceneLine = {
  id: string;
  start: Vector3;
  end: Vector3;
  stroke: string;
  strokeWidth: number;
  /** The engine draws the depth-occluded part itself instead of the SVG trace. */
  occludedDashed: boolean;
  /** World-scale dashes at the engine's grid pitch, counting metres along the line. */
  ruler: boolean;
  /** Metres of the chain before this line, so the ruler counts on. */
  rulerStartMeters?: number;
  /** A darkening halo beside the line; off for the legs of a distance. */
  halo?: boolean;
  /** Node ids of the endpoints, so live drag anchors can move them per frame. */
  startNodeId?: string;
  endNodeId?: string;
  /**
   * Re-derives the line from the live drag anchors (height legs of a
   * distance triangle depend on both edge endpoints): two endpoints or a
   * polyline, empty to hide it; null keeps the base.
   */
  recompute?: (liveAnchors: LiveAnnotationAnchors) => readonly Vector3[] | null;
  /** Recompute before every frame, not only during a drag (screen-sized lines). */
  followsView?: true;
  /** A MapLibre batch of disjoint pairs; legacy engine lines keep polylines. */
  segmentPairs?: boolean;
};

export type EdgeSegment = {
  id: string;
  annotationId?: string;
  startNodeId?: string;
  endNodeId?: string;
  startCoordinate: RuntimeEdgeRenderModel["coordinates"][number];
  endCoordinate: RuntimeEdgeRenderModel["coordinates"][number];
  stroke: string;
  strokeWidth: number;
  overlayDashPattern: string;
  overlayDashed?: true;
  ruler?: true;
  /** Length of the chain before this segment, so its ruler counts on. */
  rulerStartMeters?: number;
  showSegmentLengthLabels?: true;
  distanceTriangleOverlay?: RuntimeDistanceTriangleOverlayRenderModel;
};

export const resolveDistanceTriangleAnnotationId = (edge: EdgeSegment) =>
  edge.distanceTriangleOverlay?.annotationId ?? edge.id;

export const buildEdgeSegments = (
  edges: readonly RuntimeEdgeRenderModel[]
): readonly EdgeSegment[] =>
  edges.flatMap((edge) => {
    const segments: EdgeSegment[] = [];
    const strokeWidth = Number.isFinite(edge.strokeWidth)
      ? edge.strokeWidth
      : annotationVisualDefaults.sizes.edgeStrokeWidth;
    const overlayDashPattern =
      edge.overlayDashPattern ??
      annotationVisualDefaults.patterns.edgeDashPattern;

    let chainMeters = 0;
    for (let index = 0; index < edge.coordinates.length - 1; index += 1) {
      const startCoordinate = edge.coordinates[index];
      const endCoordinate = edge.coordinates[index + 1];

      if (!startCoordinate || !endCoordinate) {
        continue;
      }
      const rulerStartMeters = chainMeters;
      chainMeters += ecefFromGeographicCoordinate(startCoordinate).distanceTo(
        ecefFromGeographicCoordinate(endCoordinate)
      );

      const startNodeId = edge.nodeIds?.[index];
      const endNodeId =
        edge.nodeIds?.[index + 1] ??
        (edge.nodeIds &&
        edge.coordinates.length === edge.nodeIds.length + 1 &&
        index === edge.nodeIds.length - 1
          ? edge.nodeIds[0]
          : undefined);

      segments.push({
        id: `${edge.id}-${index}`,
        annotationId: edge.annotationId,
        startNodeId,
        endNodeId,
        startCoordinate,
        endCoordinate,
        stroke: edge.stroke,
        strokeWidth,
        overlayDashPattern,
        ...(edge.overlayDashed ? { overlayDashed: true as const } : {}),
        ...(edge.ruler ? { ruler: true as const, rulerStartMeters } : {}),
        ...(edge.showSegmentLengthLabels
          ? { showSegmentLengthLabels: true as const }
          : {}),
        distanceTriangleOverlay:
          index === 0 ? edge.distanceTriangleOverlay : undefined,
      });
    }

    return segments;
  });
