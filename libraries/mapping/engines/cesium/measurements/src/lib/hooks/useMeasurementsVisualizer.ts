import { useMemo } from "react";

import { type Scene } from "@carma/cesium";

import {
  useCesiumGroundPolygonAreaVisualizer,
  useCesiumPlanarPolygonAreaVisualizer,
  useCesiumVerticalPolygonAreaVisualizer,
} from "./useCesiumAreaVisualizers";
import {
  useCesiumDistanceRelationsVisualizer,
  type CesiumDistanceRelationsVisualizerHookOptions,
  type CesiumDistanceRelationsVisualizerOptions,
  type CesiumDistanceVisualizerOptions,
} from "./useCesiumDistanceVisualizer";
import { buildDistanceRelationRenderContext } from "./measurementVisualizationContext";
import {
  useCesiumPolylineVisualizer,
  type CesiumPolylineVisualizerOptions,
} from "./useCesiumPolylineVisualizer";
import {
  buildPolygonPreviewGroupsBySurface,
  buildPolylinePreviewMeasurements,
  type GroundPolygonPreviewGroup,
  type PlanarPolygonPreviewGroup,
  type VerticalPolygonPreviewGroup,
} from "./measurementPreviewVisuals";
import { type PointMeasurementEntry } from "../types/MeasurementTypes";

export type MeasurementsDistanceVisualizerOptions = Omit<
  CesiumDistanceRelationsVisualizerOptions,
  "distanceRelationRenderContext"
>;
export type MeasurementsPolygonVisualizerOptions = Pick<
  CesiumDistanceVisualizerOptions,
  | "planarPolygonGroups"
  | "facadeRectanglePreviewOppositeByGroupId"
  | "selectedPlanarPolygonGroupId"
  | "activePlanarPolygonGroupId"
  | "pointMarkerBadgeByPointId"
  | "livePreviewDistanceLine"
  | "onPlanarPolygonClick"
>;
export type MeasurementsPolylineVisualizerOptions =
  CesiumPolylineVisualizerOptions;
type MeasurementsAreaVisualizerCommonData = {
  scene: Scene | null;
  focusedPolygonGroupId: string | null;
  activePlanarPolygonGroupId: string | null;
  polygonAreaBadgeByGroupId: Readonly<
    Record<
      string,
      {
        text: string;
        backgroundColor?: string;
        textColor?: string;
      }
    >
  >;
};
export type MeasurementsGroundAreaVisualizerData =
  MeasurementsAreaVisualizerCommonData & {
    groundPolygonPreviewGroups: GroundPolygonPreviewGroup[];
  };
export type MeasurementsVerticalAreaVisualizerData =
  MeasurementsAreaVisualizerCommonData & {
    verticalPolygonPreviewGroups: VerticalPolygonPreviewGroup[];
  };
export type MeasurementsPlanarAreaVisualizerData =
  MeasurementsAreaVisualizerCommonData & {
    planarPolygonPreviewGroups: PlanarPolygonPreviewGroup[];
  };
export type MeasurementsVisualizerOptions =
  MeasurementsDistanceVisualizerOptions & MeasurementsPolygonVisualizerOptions;

export const useMeasurementsVisualizer = (
  scene: Scene | null,
  points: PointMeasurementEntry[],
  options: MeasurementsVisualizerOptions
) => {
  const {
    planarPolygonGroups = [],
    pointMarkerBadgeByPointId,
    facadeRectanglePreviewOppositeByGroupId,
    selectedPlanarPolygonGroupId = null,
    activePlanarPolygonGroupId = null,
    livePreviewDistanceLine = null,
  } = options;

  const pointsById = useMemo(() => {
    const map = new Map<string, PointMeasurementEntry>();
    points.forEach((point) => {
      map.set(point.id, point);
    });
    return map;
  }, [points]);

  const polygonAreaBadgeByGroupId = useMemo(() => {
    const byGroupId: Record<
      string,
      {
        text: string;
        backgroundColor?: string;
        textColor?: string;
      }
    > = {};
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

  const {
    groundPolygonPreviewGroups,
    verticalPolygonPreviewGroups,
    planarPolygonPreviewGroups,
  } = useMemo(
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

  const focusedPolygonGroupId =
    selectedPlanarPolygonGroupId ?? activePlanarPolygonGroupId;
  const polylineMeasurements = useMemo(
    () =>
      buildPolylinePreviewMeasurements({
        planarPolygonGroups,
        pointsById,
        facadeRectanglePreviewOppositeByGroupId,
      }),
    [facadeRectanglePreviewOppositeByGroupId, planarPolygonGroups, pointsById]
  );
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
  const areaCommonData: MeasurementsAreaVisualizerCommonData = {
    scene,
    focusedPolygonGroupId,
    activePlanarPolygonGroupId,
    polygonAreaBadgeByGroupId,
  };
  const groundAreaVisualizerData: MeasurementsGroundAreaVisualizerData = {
    ...areaCommonData,
    groundPolygonPreviewGroups,
  };
  const verticalAreaVisualizerData: MeasurementsVerticalAreaVisualizerData = {
    ...areaCommonData,
    verticalPolygonPreviewGroups,
  };
  const planarAreaVisualizerData: MeasurementsPlanarAreaVisualizerData = {
    ...areaCommonData,
    planarPolygonPreviewGroups,
  };
  const polylineVisualizerOptions: MeasurementsPolylineVisualizerOptions = {
    scene,
    polylineMeasurements,
  };
  const distanceVisualizerOptions: CesiumDistanceRelationsVisualizerHookOptions =
    {
      scene,
      points,
      distanceRelations: options.distanceRelations,
      onDistanceLineLabelToggle: options.onDistanceLineLabelToggle,
      onDistanceLineClick: options.onDistanceLineClick,
      onDistanceRelationMidpointClick: options.onDistanceRelationMidpointClick,
      lineLabelMinDistancePx: options.lineLabelMinDistancePx,
      onDistanceRelationCornerClick: options.onDistanceRelationCornerClick,
      cumulativeDistanceByRelationId: options.cumulativeDistanceByRelationId,
      pointMarkerBadgeByPointId,
      livePreviewDistanceLine,
      distanceRelationRenderContext,
    };

  useCesiumGroundPolygonAreaVisualizer(groundAreaVisualizerData);

  useCesiumVerticalPolygonAreaVisualizer(verticalAreaVisualizerData);

  useCesiumPlanarPolygonAreaVisualizer(planarAreaVisualizerData);

  useCesiumPolylineVisualizer(polylineVisualizerOptions);
  useCesiumDistanceRelationsVisualizer(distanceVisualizerOptions);
};

export default useMeasurementsVisualizer;
