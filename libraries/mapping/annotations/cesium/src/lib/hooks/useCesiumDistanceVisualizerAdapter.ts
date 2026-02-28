import { useMemo } from "react";

import { Cartesian3, type Scene } from "@carma/cesium";

import {
  isPointAnnotationEntry,
  type AnnotationCollection,
  type PlanarPolygonGroup,
  type PointDistanceRelation,
  type PointAnnotationEntry,
  type ReferenceLineLabelKind,
} from "../types/AnnotationTypes";
import { useAreaPreviewSharedModel } from "./useAreaPreviewSharedModel";
import { useDistancePreviewModel } from "./useDistancePreviewModel";
import { useGroundAreaPreviewModel } from "./useGroundAreaPreviewModel";
import { usePlanarAreaPreviewModel } from "./usePlanarAreaPreviewModel";
import { usePolylinePreviewModel } from "./usePolylinePreviewModel";
import { useVerticalAreaPreviewModel } from "./useVerticalAreaPreviewModel";
import { useDistanceVisualizer } from "./useDistanceVisualizer";
import { useCesiumGroundAreaVisualizer } from "./useCesiumGroundAreaVisualizer";
import { useCesiumPlanarAreaVisualizer } from "./useCesiumPlanarAreaVisualizer";
import { useCesiumVerticalAreaVisualizer } from "./useCesiumVerticalAreaVisualizer";
import { useCesiumPolylineVisualizer } from "./useCesiumPolylineVisualizer";
import { type PointMarkerBadge } from "./useCesiumPointLabels";

type DistanceLivePreviewLine = {
  anchorPointECEF: PointAnnotationEntry["geometryECEF"];
  targetPointECEF: PointAnnotationEntry["geometryECEF"];
  showDirectLine: boolean;
  showVerticalLine: boolean;
  showHorizontalLine: boolean;
} | null;

export type CesiumDistanceVisualizerAdapterOptions = {
  scene: Scene | null;
  enabled: boolean;
  measurements: AnnotationCollection;
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

export const useCesiumDistanceVisualizerAdapter = ({
  scene,
  enabled,
  measurements,
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
}: CesiumDistanceVisualizerAdapterOptions) => {
  const points = useMemo(
    () => measurements.filter(isPointAnnotationEntry),
    [measurements]
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
    if ((activeGroup.surfaceType ?? "roof") !== "facade") {
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

  const { distanceRelationRenderContext } = useDistancePreviewModel({
    planarPolygonGroups,
    selectedPlanarPolygonGroupId,
    activePlanarPolygonGroupId,
    pointsById,
  });

  const { polylineMeasurements } = usePolylinePreviewModel({
    planarPolygonGroups,
    pointsById,
    facadeRectanglePreviewOppositeByGroupId,
  });

  const { focusedPolygonGroupId, polygonAreaBadgeByGroupId } =
    useAreaPreviewSharedModel({
      planarPolygonGroups,
      pointMarkerBadgeByPointId,
      selectedPlanarPolygonGroupId,
      activePlanarPolygonGroupId,
    });

  const { groundPolygonPreviewGroups } = useGroundAreaPreviewModel({
    planarPolygonGroups,
    pointsById,
    facadeRectanglePreviewOppositeByGroupId,
    activePlanarPolygonGroupId,
    livePreviewDistanceLine,
  });

  const { verticalPolygonPreviewGroups } = useVerticalAreaPreviewModel({
    planarPolygonGroups,
    pointsById,
    facadeRectanglePreviewOppositeByGroupId,
    activePlanarPolygonGroupId,
    livePreviewDistanceLine,
  });

  const { planarPolygonPreviewGroups } = usePlanarAreaPreviewModel({
    planarPolygonGroups,
    pointsById,
    facadeRectanglePreviewOppositeByGroupId,
    activePlanarPolygonGroupId,
    livePreviewDistanceLine,
  });

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
