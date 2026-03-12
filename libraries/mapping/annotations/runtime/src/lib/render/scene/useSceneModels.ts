import { useMemo } from "react";

import {
  buildEdgeRelationRenderContext,
  type CandidateConnectionPreview,
  type NodeChainAnnotation,
  type PointAnnotationEntry,
  type PointDistanceRelation,
} from "@carma-mapping/annotations/core";
import { useCesiumViewProjector } from "@carma-mapping/annotations/cesium";
import type { Scene } from "@carma/cesium";

import { buildEdgeSceneLineRenderModels } from "../edge/buildEdgeSceneLineRenderModels";
import type { AnnotationPointMarkerBadge } from "../point/usePointMarkerBadges";
import { usePointIndex } from "../point/usePointIndex";
import { generateToolPrimitives } from "./generators";
import { useNodeChainPreviewModels } from "./useNodeChainPreviewModels";

export type SceneModelsOptions = {
  scene: Scene;
  visiblePointEntries: PointAnnotationEntry[];
  visiblePolygonAnnotationsForRendering: NodeChainAnnotation[];
  focusedNodeChainAnnotationId: string | null;
  activeNodeChainAnnotationId: string | null;
  pointMarkerBadgeByPointId: Readonly<
    Record<string, AnnotationPointMarkerBadge>
  >;
  candidateConnectionPreview: CandidateConnectionPreview | null;
  effectiveDistanceRelationsForRendering: PointDistanceRelation[];
  showMeasurementGeometry: boolean;
};

export const useSceneModels = ({
  scene,
  visiblePointEntries,
  visiblePolygonAnnotationsForRendering,
  focusedNodeChainAnnotationId,
  activeNodeChainAnnotationId,
  pointMarkerBadgeByPointId,
  candidateConnectionPreview,
  effectiveDistanceRelationsForRendering,
  showMeasurementGeometry,
}: SceneModelsOptions) => {
  const { points, pointsById } = usePointIndex(visiblePointEntries);
  const viewProjector = useCesiumViewProjector(scene);
  const nodeChainPreviewModels = useNodeChainPreviewModels(
    visiblePolygonAnnotationsForRendering,
    {
      enabled: showMeasurementGeometry,
      pointsById,
      focusedNodeChainAnnotationId,
      activeNodeChainAnnotationId,
      pointMarkerBadgeByPointId,
      candidateConnectionPreview,
    }
  );

  // Central interpretation point: annotation/tool data -> render primitives.
  const toolPrimitives = useMemo(
    () =>
      generateToolPrimitives({
        showMeasurementGeometry,
        candidateConnectionPreview,
        effectiveDistanceRelationsForRendering,
        activeNodeChainAnnotationId,
        visiblePolygonAnnotationsForRendering,
        nodeChainPreviewModels,
      }),
    [
      activeNodeChainAnnotationId,
      candidateConnectionPreview,
      effectiveDistanceRelationsForRendering,
      nodeChainPreviewModels,
      showMeasurementGeometry,
      visiblePolygonAnnotationsForRendering,
    ]
  );
  const edgeRelationRenderContext = useMemo(
    () =>
      buildEdgeRelationRenderContext({
        nodeChainAnnotations: visiblePolygonAnnotationsForRendering,
        focusedNodeChainAnnotationId,
        activeNodeChainAnnotationId,
        pointsById,
      }),
    [
      activeNodeChainAnnotationId,
      focusedNodeChainAnnotationId,
      pointsById,
      visiblePolygonAnnotationsForRendering,
    ]
  );

  const edgeSceneLines = useMemo(
    () =>
      buildEdgeSceneLineRenderModels({
        pointsById,
        distanceRelations: toolPrimitives.distanceRelations,
        previewEdges: toolPrimitives.previewEdges,
      }),
    [pointsById, toolPrimitives.distanceRelations, toolPrimitives.previewEdges]
  );

  return {
    points,
    viewProjector,
    toolPrimitivesByType: toolPrimitives.byToolType,
    edgeRelationRenderContext,
    edgeSceneLines,
    previewEdges: toolPrimitives.previewEdges,
    distanceRelations: toolPrimitives.distanceRelations,
    polylineMeasurements: toolPrimitives.polylineMeasurements,
    focusedPolygonGroupId: toolPrimitives.focusedPolygonGroupId,
    polygonAreaBadgeByGroupId: toolPrimitives.polygonAreaBadgeByGroupId,
    groundPolygonPreviewGroups: toolPrimitives.groundPolygonPreviewGroups,
    verticalPolygonPreviewGroups: toolPrimitives.verticalPolygonPreviewGroups,
    planarPolygonPreviewGroups: toolPrimitives.planarPolygonPreviewGroups,
    groundPolygonPrimitives: toolPrimitives.groundPolygonPrimitives,
    verticalPolygonPrimitives: toolPrimitives.verticalPolygonPrimitives,
    planarPolygonPrimitives: toolPrimitives.planarPolygonPrimitives,
  };
};
