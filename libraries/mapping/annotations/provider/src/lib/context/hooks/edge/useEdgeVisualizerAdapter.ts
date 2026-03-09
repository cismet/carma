import { useMemo } from "react";

import { type Scene } from "@carma/cesium";
import {
  type AnnotationPointMarkerBadge,
  type PlanarPolygonGroup,
  type PointAnnotationEntry,
  type PointDistanceRelation,
  type ReferenceLineLabelKind,
} from "@carma-mapping/annotations/core";
import { useCesiumEdgeVisualizer } from "@carma-mapping/annotations/cesium";

import type {
  EdgeCandidateLine,
  EdgeSceneLineRenderModel,
  TransientEdgeSegment,
} from "../annotationVisualization.types";
import { useEdgeComponentOverlayVisualizer } from "./overlay/useEdgeComponentOverlayVisualizer";
import {
  buildEdgeSceneLineRenderModels,
  type EdgeSceneLineStyleOverrides,
} from "./buildEdgeSceneLineRenderModels";
import { buildEdgeRelationRenderContext } from "./useEdgeRelationRenderContext";

export type EdgeVisualizerMeasurements = {
  relations: readonly PointDistanceRelation[];
  planarPolygonGroups: readonly PlanarPolygonGroup[];
  selectedPlanarPolygonGroupId: string | null;
  activePlanarPolygonGroupId: string | null;
  cumulativeDistanceByRelationId: Readonly<Record<string, number>>;
  pointMarkerBadgeByPointId: Readonly<
    Record<string, AnnotationPointMarkerBadge>
  >;
};

export type EdgeVisualizerInteractions = {
  onLineLabelToggle: (relationId: string, kind: ReferenceLineLabelKind) => void;
  onLineClick: (relationId: string, kind: ReferenceLineLabelKind) => void;
  onMidpointClick: (relationId: string) => void;
  onCornerClick: (relationId: string) => void;
};

export type EdgeVisualizerDisplay = {
  enabled?: boolean;
  lineLabelMinDistancePx?: number;
  renderOverlays?: boolean;
  renderSceneLines?: boolean;
  sceneLineStyles?: EdgeSceneLineStyleOverrides;
};

export type EdgeVisualizerAdapterOptions = {
  scene: Scene | null;
  points: readonly PointAnnotationEntry[];
  pointsById: ReadonlyMap<string, PointAnnotationEntry>;
  measurements: EdgeVisualizerMeasurements;
  interactions: EdgeVisualizerInteractions;
  candidateEdge?: EdgeCandidateLine;
  transientEdges?: readonly TransientEdgeSegment[];
  display?: EdgeVisualizerDisplay;
};

export const useEdgeVisualizerAdapter = ({
  scene,
  points,
  pointsById,
  measurements,
  interactions,
  candidateEdge = null,
  transientEdges = [],
  display,
}: EdgeVisualizerAdapterOptions) => {
  const {
    relations,
    planarPolygonGroups,
    selectedPlanarPolygonGroupId,
    activePlanarPolygonGroupId,
    cumulativeDistanceByRelationId,
    pointMarkerBadgeByPointId,
  } = measurements;
  const { onLineLabelToggle, onLineClick, onMidpointClick, onCornerClick } =
    interactions;
  const {
    enabled = true,
    lineLabelMinDistancePx,
    renderOverlays = true,
    renderSceneLines = true,
    sceneLineStyles,
  } = display ?? {};

  const edgeRelationRenderContext = useMemo(
    () =>
      buildEdgeRelationRenderContext({
        planarPolygonGroups,
        selectedPlanarPolygonGroupId,
        activePlanarPolygonGroupId,
        pointsById,
      }),
    [
      activePlanarPolygonGroupId,
      planarPolygonGroups,
      pointsById,
      selectedPlanarPolygonGroupId,
    ]
  );

  const edgeSceneLines = useMemo<readonly EdgeSceneLineRenderModel[]>(
    () =>
      buildEdgeSceneLineRenderModels({
        pointsById,
        distanceRelations: enabled ? relations : [],
        candidateEdgeLine: enabled ? candidateEdge : null,
        transientEdges: enabled ? transientEdges : [],
        styles: sceneLineStyles,
      }),
    [
      enabled,
      candidateEdge,
      pointsById,
      relations,
      sceneLineStyles,
      transientEdges,
    ]
  );

  useEdgeComponentOverlayVisualizer(scene, points, {
    distanceRelations: enabled ? [...relations] : [],
    onDistanceLineLabelToggle: onLineLabelToggle,
    onDistanceLineClick: onLineClick,
    onDistanceRelationMidpointClick: onMidpointClick,
    onDistanceRelationCornerClick: onCornerClick,
    lineLabelMinDistancePx,
    cumulativeDistanceByRelationId,
    pointMarkerBadgeByPointId,
    transientEdges: enabled ? transientEdges : [],
    candidateEdgeLine: enabled ? candidateEdge : null,
    distanceRelationRenderContext: edgeRelationRenderContext,
    enabled: enabled && renderOverlays,
  });

  useCesiumEdgeVisualizer(scene, edgeSceneLines, {
    enabled: enabled && renderSceneLines,
  });
};
