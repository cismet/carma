import { useMemo } from "react";

import {
  type PointMeasurementEntry,
  type PlanarPolygonGroup,
} from "../types/MeasurementTypes";
import { buildDistanceRelationRenderContext } from "./measurementVisualizationContext";
import {
  buildPolygonPreviewGroupsBySurface,
  buildPolylinePreviewMeasurements,
} from "./measurementPreviewVisuals";

type PointMarkerBadge = {
  text: string;
  backgroundColor?: string;
  textColor?: string;
};

type DistanceLivePreviewLine = {
  anchorPointECEF: PointMeasurementEntry["geometryECEF"];
  targetPointECEF: PointMeasurementEntry["geometryECEF"];
  showDirectLine: boolean;
  showVerticalLine: boolean;
  showHorizontalLine: boolean;
};

export type PolylineFamilyRenderModel = {
  focusedPolygonGroupId: string | null;
  polygonAreaBadgeByGroupId: Readonly<Record<string, PointMarkerBadge>>;
  polylineMeasurements: ReturnType<typeof buildPolylinePreviewMeasurements>;
};

export type DistanceFamilyRenderModel = {
  pointMarkerBadgeByPointId?: Readonly<Record<string, PointMarkerBadge>>;
  livePreviewDistanceLine: DistanceLivePreviewLine | null;
  distanceRelationRenderContext: ReturnType<
    typeof buildDistanceRelationRenderContext
  >;
};

type PolygonPreviewGroupsBySurface = ReturnType<
  typeof buildPolygonPreviewGroupsBySurface
>;

export type AreaFamilyRenderModel = {
  focusedPolygonGroupId: string | null;
  polygonAreaBadgeByGroupId: Readonly<Record<string, PointMarkerBadge>>;
} & PolygonPreviewGroupsBySurface;

export const useMeasurementFamilyPartition = ({
  planarPolygonGroups,
  points,
  pointMarkerBadgeByPointId,
  selectedPlanarPolygonGroupId,
  activePlanarPolygonGroupId,
  facadeRectanglePreviewOppositeByGroupId,
  livePreviewDistanceLine,
}: {
  planarPolygonGroups: PlanarPolygonGroup[];
  points: PointMeasurementEntry[];
  pointMarkerBadgeByPointId?: Readonly<Record<string, PointMarkerBadge>>;
  selectedPlanarPolygonGroupId: string | null;
  activePlanarPolygonGroupId: string | null;
  facadeRectanglePreviewOppositeByGroupId?: Readonly<
    Record<string, PointMeasurementEntry["geometryECEF"]>
  >;
  livePreviewDistanceLine: DistanceLivePreviewLine | null;
}) => {
  const pointsById = useMemo(() => {
    const map = new Map<string, PointMeasurementEntry>();
    points.forEach((point) => {
      map.set(point.id, point);
    });
    return map;
  }, [points]);

  const polygonAreaBadgeByGroupId = useMemo(() => {
    const byGroupId: Record<string, PointMarkerBadge> = {};
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

  const polylineMeasurements = useMemo(
    () =>
      buildPolylinePreviewMeasurements({
        planarPolygonGroups,
        pointsById,
        facadeRectanglePreviewOppositeByGroupId,
      }),
    [facadeRectanglePreviewOppositeByGroupId, planarPolygonGroups, pointsById]
  );

  const focusedPolygonGroupId =
    selectedPlanarPolygonGroupId ?? activePlanarPolygonGroupId;

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

  const polylineModel: PolylineFamilyRenderModel = useMemo(
    () => ({
      focusedPolygonGroupId,
      polygonAreaBadgeByGroupId,
      polylineMeasurements,
    }),
    [focusedPolygonGroupId, polygonAreaBadgeByGroupId, polylineMeasurements]
  );

  const distanceModel: DistanceFamilyRenderModel = useMemo(
    () => ({
      pointMarkerBadgeByPointId,
      livePreviewDistanceLine,
      distanceRelationRenderContext,
    }),
    [
      pointMarkerBadgeByPointId,
      livePreviewDistanceLine,
      distanceRelationRenderContext,
    ]
  );

  const polygonPreviewGroupsBySurface = useMemo(
    () =>
      buildPolygonPreviewGroupsBySurface({
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

  const areaModel: AreaFamilyRenderModel = useMemo(
    () => ({
      focusedPolygonGroupId,
      polygonAreaBadgeByGroupId,
      ...polygonPreviewGroupsBySurface,
    }),
    [
      focusedPolygonGroupId,
      polygonAreaBadgeByGroupId,
      polygonPreviewGroupsBySurface,
    ]
  );

  return {
    pointsById,
    polylineModel,
    distanceModel,
    areaModel,
  };
};
