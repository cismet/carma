import { useMemo } from "react";

import { Cartesian3 } from "@carma/cesium";
import {
  ANNOTATION_TYPE_POLYLINE,
  ANNOTATION_TYPE_AREA_VERTICAL,
  type CandidateConnectionPreview,
  POLYGON_PREVIEW_STROKE,
  POLYGON_PREVIEW_STROKE_WIDTH_PX,
  buildGroundPolygonPreviewGroups,
  buildPlanarPolygonPreviewGroups,
  buildPolylinePreviewEdgeSegments,
  buildPolylinePreviewMeasurements,
  buildVerticalPolygonPreviewGroups,
  type NodeChainAnnotation,
  type PointAnnotationEntry,
} from "@carma-mapping/annotations/core";
import type { AnnotationPointMarkerBadge } from "../point/usePointMarkerBadges";

import type { EdgeSceneLineRenderModel } from "./visualization.types";
import type { PolygonAreaBadge } from "../labels";

const toPolygonAreaBadgeByGroupId = (
  nodeChainAnnotations: readonly NodeChainAnnotation[],
  pointMarkerBadgeByPointId: Readonly<
    Record<string, AnnotationPointMarkerBadge>
  >
): Readonly<Record<string, PolygonAreaBadge>> => {
  const byGroupId: Record<string, PolygonAreaBadge> = {};

  nodeChainAnnotations.forEach((group) => {
    const firstNodeId = group.nodeIds[0] ?? null;
    if (!firstNodeId) return;

    const badge = pointMarkerBadgeByPointId[firstNodeId];
    const badgeText = badge?.text?.trim();
    if (!badgeText) return;

    byGroupId[group.id] = {
      text: badgeText,
      backgroundColor: badge?.backgroundColor,
      textColor: badge?.textColor,
    };
  });

  return byGroupId;
};

export type NodeChainPreviewModelsOptions = {
  enabled: boolean;
  pointsById: ReadonlyMap<string, PointAnnotationEntry>;
  focusedNodeChainAnnotationId: string | null;
  activeNodeChainAnnotationId: string | null;
  pointMarkerBadgeByPointId: Readonly<
    Record<string, AnnotationPointMarkerBadge>
  >;
  candidateConnectionPreview: CandidateConnectionPreview | null;
};

export type NodeChainPreviewModels = {
  focusedPolygonGroupId: string | null;
  polylineMeasurements: ReturnType<typeof buildPolylinePreviewMeasurements>;
  verticalPreviewEdges: readonly EdgeSceneLineRenderModel[];
  polygonAreaBadgeByGroupId: Readonly<Record<string, PolygonAreaBadge>>;
  groundPolygonPreviewGroups: ReturnType<
    typeof buildGroundPolygonPreviewGroups
  >;
  verticalPolygonPreviewGroups: ReturnType<
    typeof buildVerticalPolygonPreviewGroups
  >;
  planarPolygonPreviewGroups: ReturnType<
    typeof buildPlanarPolygonPreviewGroups
  >;
  polygonClosurePreviewEdges: readonly EdgeSceneLineRenderModel[];
};

export const useNodeChainPreviewModels = (
  nodeChainAnnotations: readonly NodeChainAnnotation[],
  {
    enabled,
    pointsById,
    focusedNodeChainAnnotationId,
    activeNodeChainAnnotationId,
    pointMarkerBadgeByPointId,
    candidateConnectionPreview,
  }: NodeChainPreviewModelsOptions
): NodeChainPreviewModels => {
  const verticalRectanglePreviewOppositeByGroupId = useMemo(() => {
    if (!enabled || !candidateConnectionPreview) {
      return undefined;
    }

    const target = candidateConnectionPreview.targetPointECEF;
    if (!target) {
      return undefined;
    }

    const activeGroup = activeNodeChainAnnotationId
      ? nodeChainAnnotations.find(
          (group) => group.id === activeNodeChainAnnotationId
        )
      : null;
    if (!activeGroup || activeGroup.closed) {
      return undefined;
    }
    if (activeGroup.type !== ANNOTATION_TYPE_AREA_VERTICAL) {
      return undefined;
    }
    if (activeGroup.nodeIds.length !== 1) {
      return undefined;
    }

    return {
      [activeGroup.id]: Cartesian3.clone(target),
    };
  }, [
    activeNodeChainAnnotationId,
    enabled,
    candidateConnectionPreview,
    nodeChainAnnotations,
  ]);

  const polylineMeasurements = useMemo(
    () =>
      buildPolylinePreviewMeasurements({
        nodeChainAnnotations: [...nodeChainAnnotations],
        pointsById,
        verticalRectanglePreviewOppositeByGroupId,
      }),
    [
      verticalRectanglePreviewOppositeByGroupId,
      nodeChainAnnotations,
      pointsById,
    ]
  );

  const polygonAreaBadgeByGroupId = useMemo(
    () =>
      toPolygonAreaBadgeByGroupId(
        nodeChainAnnotations,
        pointMarkerBadgeByPointId
      ),
    [nodeChainAnnotations, pointMarkerBadgeByPointId]
  );

  const focusedPolygonGroupId =
    focusedNodeChainAnnotationId ?? activeNodeChainAnnotationId;

  const groundPolygonPreviewGroups = useMemo(
    () =>
      buildGroundPolygonPreviewGroups({
        nodeChainAnnotations: [...nodeChainAnnotations],
        pointsById,
        verticalRectanglePreviewOppositeByGroupId,
        activeNodeChainAnnotationId: activeNodeChainAnnotationId,
        candidateConnection: candidateConnectionPreview,
      }),
    [
      activeNodeChainAnnotationId,
      verticalRectanglePreviewOppositeByGroupId,
      candidateConnectionPreview,
      nodeChainAnnotations,
      pointsById,
    ]
  );

  const verticalPolygonPreviewGroups = useMemo(
    () =>
      buildVerticalPolygonPreviewGroups({
        nodeChainAnnotations: [...nodeChainAnnotations],
        pointsById,
        verticalRectanglePreviewOppositeByGroupId,
        activeNodeChainAnnotationId: activeNodeChainAnnotationId,
        candidateConnection: candidateConnectionPreview,
      }),
    [
      activeNodeChainAnnotationId,
      verticalRectanglePreviewOppositeByGroupId,
      candidateConnectionPreview,
      nodeChainAnnotations,
      pointsById,
    ]
  );

  const planarPolygonPreviewGroups = useMemo(
    () =>
      buildPlanarPolygonPreviewGroups({
        nodeChainAnnotations: [...nodeChainAnnotations],
        pointsById,
        verticalRectanglePreviewOppositeByGroupId,
        activeNodeChainAnnotationId: activeNodeChainAnnotationId,
        candidateConnection: candidateConnectionPreview,
      }),
    [
      activeNodeChainAnnotationId,
      verticalRectanglePreviewOppositeByGroupId,
      candidateConnectionPreview,
      nodeChainAnnotations,
      pointsById,
    ]
  );

  const polygonClosurePreviewEdges = useMemo<
    readonly EdgeSceneLineRenderModel[]
  >(() => {
    if (
      !enabled ||
      !candidateConnectionPreview ||
      !activeNodeChainAnnotationId
    ) {
      return [];
    }

    const activeGroup =
      nodeChainAnnotations.find(
        (group) => group.id === activeNodeChainAnnotationId
      ) ?? null;
    if (!activeGroup || activeGroup.closed) {
      return [];
    }
    if (activeGroup.type === ANNOTATION_TYPE_POLYLINE) {
      return [];
    }
    if (activeGroup.nodeIds.length < 2) {
      return [];
    }

    const firstNodeId = activeGroup.nodeIds[0] ?? null;
    const firstNodePosition = firstNodeId
      ? pointsById.get(firstNodeId)?.geometryECEF
      : null;
    const previewTarget = candidateConnectionPreview.targetPointECEF;
    if (!firstNodePosition || !previewTarget) {
      return [];
    }
    if (Cartesian3.distanceSquared(firstNodePosition, previewTarget) <= 1e-6) {
      return [];
    }

    return [
      {
        id: `${activeGroup.id}:preview-closure`,
        start: Cartesian3.clone(previewTarget),
        end: Cartesian3.clone(firstNodePosition),
        stroke: POLYGON_PREVIEW_STROKE,
        strokeWidth: POLYGON_PREVIEW_STROKE_WIDTH_PX,
        dashed: false,
      },
    ];
  }, [
    activeNodeChainAnnotationId,
    enabled,
    candidateConnectionPreview,
    nodeChainAnnotations,
    pointsById,
  ]);

  const verticalPreviewEdges = useMemo<readonly EdgeSceneLineRenderModel[]>(
    () =>
      buildPolylinePreviewEdgeSegments(polylineMeasurements).map((segment) => ({
        id: segment.id,
        start: Cartesian3.clone(segment.start),
        end: Cartesian3.clone(segment.end),
        stroke: POLYGON_PREVIEW_STROKE,
        strokeWidth: POLYGON_PREVIEW_STROKE_WIDTH_PX,
        dashed: false,
      })),
    [polylineMeasurements]
  );

  return {
    focusedPolygonGroupId,
    polylineMeasurements,
    verticalPreviewEdges,
    polygonAreaBadgeByGroupId,
    groundPolygonPreviewGroups,
    verticalPolygonPreviewGroups,
    planarPolygonPreviewGroups,
    polygonClosurePreviewEdges,
  };
};
