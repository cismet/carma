import { getArcPointsInSpannedPlane } from "@carma-commons/math";
import { ecefFromGeographicCoordinate } from "@carma-geo/proj";
import { Vector3 } from "three";

import {
  distanceVisualizationDefaults,
  type AnnotationEngine,
} from "@carma-mapping/annotations/core";
import { createAnnotationGeometryScratch } from "../../interaction/authoring-geometry";
import type { LiveAnnotationAnchors } from "../../interaction/live-annotation-anchors";
import type { SceneMarkerModel } from "../scene-markers/scene-marker-models";
import {
  resolveDotSceneStyle,
  resolveInsertTickSceneStyles,
} from "../scene-markers/scene-marker-styles";
import {
  annotationEdgeDefaults,
  distanceTriangleVisualDefaults,
} from "./edge-defaults";
import { resolveDistanceTriangleComponentEndpointsECEF } from "./edge-geometry";
import type { EdgeSceneLine, EdgeSegment } from "./edge-models";

/**
 * The edge handles drawn by the engine: the insert tick at every targeted
 * edge midpoint and the right-angle corner handle of a distance triangle
 * (arc and dot), placed before every frame. Their overlay counterparts keep
 * only the hit areas.
 */

const HIDDEN: readonly Vector3[] = [];

const insertTickStyles = resolveInsertTickSceneStyles(
  annotationEdgeDefaults.midpointMarker
);

/** One tick per edge across its midpoint; hover from the overlay hit area. */
export const buildInsertTickSceneMarkers = (
  segments: readonly EdgeSegment[],
  liveAnchors: LiveAnnotationAnchors,
  hoveredEdgeIds: ReadonlySet<string>
): SceneMarkerModel[] =>
  segments.map((edge) => {
    const storedStart = ecefFromGeographicCoordinate(edge.startCoordinate);
    const storedEnd = ecefFromGeographicCoordinate(edge.endCoordinate);
    const midpoint = new Vector3();
    const across = new Vector3();
    return {
      id: `${edge.id}-insert-tick`,
      ...insertTickStyles,
      place: () => {
        const start =
          (edge.startNodeId && liveAnchors.get(edge.startNodeId)) ||
          storedStart;
        const end =
          (edge.endNodeId && liveAnchors.get(edge.endNodeId)) || storedEnd;
        return {
          positionECEF: midpoint.addVectors(start, end).multiplyScalar(0.5),
          acrossECEF: across.subVectors(end, start),
          hovered: hoveredEdgeIds.has(edge.id),
        };
      },
    };
  });

export type DistanceCornerHandleGeometry = {
  /** The right-angle arc at the corner; null for a degenerate triangle. */
  arc: Vector3[] | null;
  dot: Vector3;
};

/**
 * The corner handle as the overlay lays it out: an arc of
 * `targetRadiusPx` around the auxiliary corner in the triangle's plane with
 * its dot halfway to the arc's middle, or only a dot halfway along the
 * direct line when a leg has no length. Null without a direct line.
 */
export const resolveDistanceCornerHandleGeometry = (
  {
    anchorECEF,
    auxiliaryECEF,
    targetECEF,
  }: { anchorECEF: Vector3; auxiliaryECEF: Vector3; targetECEF: Vector3 },
  pixelsPerMeter: number
): DistanceCornerHandleGeometry | null => {
  const epsilon = distanceVisualizationDefaults.referenceLineEpsilonMeters;
  if (
    anchorECEF.distanceTo(auxiliaryECEF) <= epsilon ||
    auxiliaryECEF.distanceTo(targetECEF) <= epsilon
  ) {
    return anchorECEF.distanceTo(targetECEF) <= epsilon
      ? null
      : {
          arc: null,
          dot: new Vector3()
            .addVectors(anchorECEF, targetECEF)
            .multiplyScalar(0.5),
        };
  }
  if (!(pixelsPerMeter > 0)) return null;
  const { targetRadiusPx, segments } =
    distanceTriangleVisualDefaults.cornerOverlay;
  const arc = getArcPointsInSpannedPlane(
    auxiliaryECEF,
    anchorECEF,
    targetECEF,
    targetRadiusPx / pixelsPerMeter,
    segments
  );
  const arcMiddle = arc?.[Math.floor(arc.length / 2)];
  if (!arc || arc.length < 2 || !arcMiddle) return null;
  return {
    arc,
    dot: new Vector3().addVectors(auxiliaryECEF, arcMiddle).multiplyScalar(0.5),
  };
};

/** The corner handles of the distance triangles that show their components. */
export const buildDistanceCornerSceneModels = (
  engine: AnnotationEngine,
  segments: readonly EdgeSegment[],
  liveAnchors: LiveAnnotationAnchors
): { lines: EdgeSceneLine[]; markers: SceneMarkerModel[] } => {
  const { color, strokeWidthPx } = distanceTriangleVisualDefaults.cornerOverlay;
  const dotStyle = resolveDotSceneStyle(
    2 * annotationEdgeDefaults.distanceTriangle.cornerDotRadiusPx,
    color
  );
  const corners = segments
    .filter(
      (edge) =>
        edge.distanceTriangleOverlay !== undefined &&
        edge.distanceTriangleOverlay.showComponents !== false
    )
    .map((edge) => {
      const scratch = createAnnotationGeometryScratch();
      let frameKey: number | null = null;
      let geometry: DistanceCornerHandleGeometry | null = null;
      // the arc and the dot read one geometry per frame
      const resolve = () => {
        const nextFrameKey = engine.getFrameKey();
        if (nextFrameKey === null || nextFrameKey !== frameKey) {
          frameKey = nextFrameKey;
          const endpoints = resolveDistanceTriangleComponentEndpointsECEF(
            edge,
            liveAnchors,
            scratch
          );
          geometry = endpoints
            ? resolveDistanceCornerHandleGeometry(
                endpoints,
                engine.getScreenPixelsPerMeterAt(endpoints.auxiliaryECEF)
              )
            : null;
        }
        return geometry;
      };
      return { edge, resolve };
    });
  return {
    lines: corners.map(({ edge, resolve }) => {
      const storedECEF = ecefFromGeographicCoordinate(edge.startCoordinate);
      return {
        id: `${edge.id}-corner-arc`,
        start: storedECEF,
        end: storedECEF,
        stroke: color,
        strokeWidth: strokeWidthPx,
        occludedDashed: true,
        ruler: false,
        halo: true,
        followsView: true,
        recompute: () => resolve()?.arc ?? HIDDEN,
      };
    }),
    markers: corners.map(({ edge, resolve }) => ({
      id: `${edge.id}-corner-dot`,
      style: dotStyle,
      place: () => {
        const dot = resolve()?.dot;
        return dot ? { positionECEF: dot } : null;
      },
    })),
  };
};
