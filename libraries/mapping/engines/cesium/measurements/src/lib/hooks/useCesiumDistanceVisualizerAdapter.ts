import { useMemo } from "react";

import { Cartesian3, type Scene } from "@carma/cesium";

import {
  isPointMeasurementEntry,
  type MeasurementCollection,
  type PlanarPolygonGroup,
  type PointDistanceRelation,
  type PointMeasurementEntry,
  type ReferenceLineLabelKind,
} from "../types/MeasurementTypes";
import { useMeasurementFamilyPartition } from "./measurementFamilyPartition";
import useCesiumDistanceVisualizer from "./useCesiumDistanceVisualizer";
import { type PointMarkerBadge } from "./useCesiumPointLabels";

type DistanceLivePreviewLine = {
  anchorPointECEF: PointMeasurementEntry["geometryECEF"];
  targetPointECEF: PointMeasurementEntry["geometryECEF"];
  showDirectLine: boolean;
  showVerticalLine: boolean;
  showHorizontalLine: boolean;
} | null;

export type CesiumDistanceVisualizerAdapterOptions = {
  scene: Scene | null;
  enabled: boolean;
  measurements: MeasurementCollection;
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
    () => measurements.filter(isPointMeasurementEntry),
    [measurements]
  );

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

  const { distanceModel } = useMeasurementFamilyPartition({
    planarPolygonGroups,
    points,
    pointMarkerBadgeByPointId,
    selectedPlanarPolygonGroupId,
    activePlanarPolygonGroupId,
    facadeRectanglePreviewOppositeByGroupId,
    livePreviewDistanceLine,
  });

  useCesiumDistanceVisualizer(scene, points, {
    distanceRelations: enabled ? distanceRelations : [],
    planarPolygonGroups: enabled ? planarPolygonGroups : [],
    facadeRectanglePreviewOppositeByGroupId,
    selectedPlanarPolygonGroupId,
    activePlanarPolygonGroupId,
    onDistanceLineLabelToggle,
    onDistanceLineClick,
    onDistanceRelationMidpointClick,
    onDistanceRelationCornerClick,
    lineLabelMinDistancePx,
    cumulativeDistanceByRelationId,
    pointMarkerBadgeByPointId: distanceModel.pointMarkerBadgeByPointId,
    livePreviewDistanceLine: enabled
      ? distanceModel.livePreviewDistanceLine
      : null,
    distanceRelationRenderContext: distanceModel.distanceRelationRenderContext,
    renderAreaAndPolylineVisuals: enabled,
  });
};
