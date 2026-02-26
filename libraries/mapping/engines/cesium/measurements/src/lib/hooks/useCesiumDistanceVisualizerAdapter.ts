import { useMemo } from "react";

import { type Scene } from "@carma/cesium";

import {
  isPointMeasurementEntry,
  type MeasurementCollection,
  type PlanarPolygonGroup,
  type PointDistanceRelation,
  type PointMeasurementEntry,
  type ReferenceLineLabelKind,
} from "../types/MeasurementTypes";
import { useMeasurementFamilyPartition } from "./measurementFamilyPartition";
import { useCesiumDistanceRelationsVisualizer } from "./useCesiumDistanceVisualizer";
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

  const { distanceModel } = useMeasurementFamilyPartition({
    planarPolygonGroups,
    points,
    pointMarkerBadgeByPointId,
    selectedPlanarPolygonGroupId,
    activePlanarPolygonGroupId,
    livePreviewDistanceLine,
  });

  useCesiumDistanceRelationsVisualizer({
    scene,
    points,
    distanceRelations: enabled ? distanceRelations : [],
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
  });
};
