import { useMemo } from "react";

import { Cartesian3, type Scene } from "@carma/cesium";
import {
  ANNOTATION_TYPE_AREA_VERTICAL,
  buildGroundPolygonPreviewGroups,
  isPointAnnotationEntry,
  buildPlanarPolygonPreviewGroups,
  buildPolylinePreviewMeasurements,
  buildVerticalPolygonPreviewGroups,
  type PolygonAreaBadge,
  type AnnotationCollection,
  type PlanarPolygonGroup,
  type PointDistanceRelation,
  type PointAnnotationEntry,
  type ReferenceLineLabelKind,
} from "@carma-mapping/annotations/core";

import {
  type PointMarkerBadge,
  useCesiumGroundAreaVisualizer,
  useCesiumPlanarAreaVisualizer,
  useCesiumVerticalAreaVisualizer,
  useCesiumPolylineVisualizer,
} from "@carma-mapping/annotations/cesium";
import { buildDistanceRelationRenderContext } from "./annotationVisualizationContext";
import { useDistanceVisualizer } from "./useDistanceVisualizer";

type DistanceLivePreviewLine = {
  anchorPointECEF: PointAnnotationEntry["geometryECEF"];
  targetPointECEF: PointAnnotationEntry["geometryECEF"];
  showDirectLine: boolean;
  showVerticalLine: boolean;
  showHorizontalLine: boolean;
} | null;

export type DistanceVisualizerAdapterOptions = {
  scene: Scene | null;
  enabled: boolean;
  annotations: AnnotationCollection;
  distanceRelations: PointDistanceRelation[];
  planarPolygonGroups: PlanarPolygonGroup[];
  selectedPlanarPolygonGroupId: string | null;
  activePlanarPolygonGroupId: string | null;
  onDistanceLineLabelToggle: (
    relationId: string,
    kind: ReferenceLineLabelKind
  ) => void;
  onDistanceLineClick: (
    relationId: string,
    kind: ReferenceLineLabelKind
  ) => void;
  onDistanceRelationMidpointClick: (relationId: string) => void;
  onDistanceRelationCornerClick: (relationId: string) => void;
  cumulativeDistanceByRelationId: Readonly<Record<string, number>>;
  pointMarkerBadgeByPointId: Readonly<Record<string, PointMarkerBadge>>;
  livePreviewDistanceLine: DistanceLivePreviewLine;
  lineLabelMinDistancePx?: number;
};

export const useDistanceVisualizerAdapter = ({
  scene,
  enabled,
  annotations,
  distanceRelations,
  planarPolygonGroups,
  selectedPlanarPolygonGroupId,
  activePlanarPolygonGroupId,
  onDistanceLineLabelToggle,
  onDistanceLineClick,
  onDistanceRelationMidpointClick,
  onDistanceRelationCornerClick,
  cumulativeDistanceByRelationId,
  pointMarkerBadgeByPointId,
  livePreviewDistanceLine,
  lineLabelMinDistancePx,
}: DistanceVisualizerAdapterOptions) => {
  const points = useMemo(
    () => annotations.filter(isPointAnnotationEntry),
    [annotations]
  );
  const pointsById = useMemo(() => {
    const map = new Map<string, PointAnnotationEntry>();
    points.forEach((point) => {
      map.set(point.id, point);
    });
    return map;
  }, [points]);

  const facadeRectanglePreviewOppositeByGroupId = useMemo(() => {
    if (!enabled || !livePreviewDistanceLine) {
      return undefined;
    }
    const target = livePreviewDistanceLine.targetPointECEF;
    if (!target) {
      return undefined;
    }
    const activeGroup = activePlanarPolygonGroupId
      ? planarPolygonGroups.find(
          (group) => group.id === activePlanarPolygonGroupId
        )
      : null;
    if (!activeGroup || activeGroup.closed) {
      return undefined;
    }
    if (activeGroup.measurementKind !== ANNOTATION_TYPE_AREA_VERTICAL) {
      return undefined;
    }
    if (activeGroup.vertexPointIds.length !== 1) {
      return undefined;
    }
    return {
      [activeGroup.id]: Cartesian3.clone(target),
    };
  }, [
    activePlanarPolygonGroupId,
    enabled,
    livePreviewDistanceLine,
    planarPolygonGroups,
  ]);

  const distanceRelationRenderContext = useMemo(
    () =>
      buildDistanceRelationRenderContext({
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

  const polylineMeasurements = useMemo(
    () =>
      buildPolylinePreviewMeasurements({
        planarPolygonGroups,
        pointsById,
        facadeRectanglePreviewOppositeByGroupId,
      }),
    [facadeRectanglePreviewOppositeByGroupId, planarPolygonGroups, pointsById]
  );

  const polygonAreaBadgeByGroupId = useMemo(() => {
    const byGroupId: Record<string, PolygonAreaBadge> = {};
    planarPolygonGroups.forEach((group) => {
      const firstVertexPointId = group.vertexPointIds[0] ?? null;
      if (!firstVertexPointId) return;
      const badge = pointMarkerBadgeByPointId?.[firstVertexPointId];
      const badgeText = badge?.text?.trim();
      if (!badgeText) return;
      byGroupId[group.id] = {
        text: badgeText,
        backgroundColor: badge?.backgroundColor,
        textColor: badge?.textColor,
      };
    });
    return byGroupId;
  }, [planarPolygonGroups, pointMarkerBadgeByPointId]);

  const focusedPolygonGroupId =
    selectedPlanarPolygonGroupId ?? activePlanarPolygonGroupId;

  const groundPolygonPreviewGroups = useMemo(
    () =>
      buildGroundPolygonPreviewGroups({
        planarPolygonGroups,
        pointsById,
        facadeRectanglePreviewOppositeByGroupId,
        activePlanarPolygonGroupId,
        livePreviewDistanceLine,
      }),
    [
      activePlanarPolygonGroupId,
      facadeRectanglePreviewOppositeByGroupId,
      livePreviewDistanceLine,
      planarPolygonGroups,
      pointsById,
    ]
  );

  const verticalPolygonPreviewGroups = useMemo(
    () =>
      buildVerticalPolygonPreviewGroups({
        planarPolygonGroups,
        pointsById,
        facadeRectanglePreviewOppositeByGroupId,
        activePlanarPolygonGroupId,
        livePreviewDistanceLine,
      }),
    [
      activePlanarPolygonGroupId,
      facadeRectanglePreviewOppositeByGroupId,
      livePreviewDistanceLine,
      planarPolygonGroups,
      pointsById,
    ]
  );

  const planarPolygonPreviewGroups = useMemo(
    () =>
      buildPlanarPolygonPreviewGroups({
        planarPolygonGroups,
        pointsById,
        facadeRectanglePreviewOppositeByGroupId,
        activePlanarPolygonGroupId,
        livePreviewDistanceLine,
      }),
    [
      activePlanarPolygonGroupId,
      facadeRectanglePreviewOppositeByGroupId,
      livePreviewDistanceLine,
      planarPolygonGroups,
      pointsById,
    ]
  );

  useDistanceVisualizer({
    scene,
    points,
    distanceRelations: enabled ? distanceRelations : [],
    onDistanceLineLabelToggle,
    onDistanceLineClick,
    onDistanceRelationMidpointClick,
    onDistanceRelationCornerClick,
    lineLabelMinDistancePx,
    cumulativeDistanceByRelationId,
    pointMarkerBadgeByPointId,
    livePreviewDistanceLine: enabled ? livePreviewDistanceLine : null,
    distanceRelationRenderContext,
  });

  useCesiumPolylineVisualizer({
    scene,
    polylineMeasurements: enabled ? polylineMeasurements : [],
  });

  useCesiumGroundAreaVisualizer({
    scene,
    focusedPolygonGroupId,
    polygonAreaBadgeByGroupId,
    groundPolygonPreviewGroups: enabled ? groundPolygonPreviewGroups : [],
  });

  useCesiumVerticalAreaVisualizer({
    scene,
    focusedPolygonGroupId,
    polygonAreaBadgeByGroupId,
    verticalPolygonPreviewGroups: enabled ? verticalPolygonPreviewGroups : [],
  });

  useCesiumPlanarAreaVisualizer({
    scene,
    focusedPolygonGroupId,
    polygonAreaBadgeByGroupId,
    planarPolygonPreviewGroups: enabled ? planarPolygonPreviewGroups : [],
  });
};
