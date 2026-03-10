import { useMemo } from "react";

import { Cartesian3, Color } from "@carma/cesium";
import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
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
  type PlanarMeasurementGroup,
  type PlanarPolygonGroup,
  type PointAnnotationEntry,
} from "@carma-mapping/annotations/core";
import type { AnnotationPointMarkerBadge } from "../../base";

import type {
  EdgeSceneLineRenderModel,
  PolygonPrimitiveRenderModel,
} from "../annotationVisualization.types";
import type { PolygonAreaBadge } from "../area/labels";

const POLYGON_FILL_ALPHA = 0.25;
const POLYGON_FILL_SELECTED_ALPHA = 0.35;

const POLYGON_FILL_RGB_BY_MEASUREMENT_TYPE = {
  [ANNOTATION_TYPE_AREA_VERTICAL]: [0.44, 0.66, 1.0],
  [ANNOTATION_TYPE_AREA_GROUND]: [0.42, 0.74, 0.48],
  [ANNOTATION_TYPE_AREA_PLANAR]: [0.94, 0.87, 0.57],
} as const;

const getPolygonFillColor = (
  type:
    | typeof ANNOTATION_TYPE_AREA_VERTICAL
    | typeof ANNOTATION_TYPE_AREA_GROUND
    | typeof ANNOTATION_TYPE_AREA_PLANAR,
  isSelected: boolean
) => {
  const [red, green, blue] = POLYGON_FILL_RGB_BY_MEASUREMENT_TYPE[type];
  return new Color(
    red,
    green,
    blue,
    isSelected ? POLYGON_FILL_SELECTED_ALPHA : POLYGON_FILL_ALPHA
  );
};

const toPolygonAreaBadgeByGroupId = (
  planarPolygonGroups: readonly PlanarMeasurementGroup[],
  pointMarkerBadgeByPointId: Readonly<
    Record<string, AnnotationPointMarkerBadge>
  >
): Readonly<Record<string, PolygonAreaBadge>> => {
  const byGroupId: Record<string, PolygonAreaBadge> = {};

  planarPolygonGroups.forEach((group) => {
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

const toGroundPolygonPrimitives = (
  enabled: boolean,
  focusedPolygonGroupId: string | null,
  polygonPreviewGroups: ReturnType<typeof buildGroundPolygonPreviewGroups>
): readonly PolygonPrimitiveRenderModel[] =>
  (enabled ? polygonPreviewGroups : []).map(({ group, vertexPoints }) => ({
    id: group.id,
    vertexPoints,
    fillColor: getPolygonFillColor(
      group.type as typeof ANNOTATION_TYPE_AREA_GROUND,
      group.id === focusedPolygonGroupId
    ),
  }));

const toCoplanarPolygonPrimitives = (
  enabled: boolean,
  focusedPolygonGroupId: string | null,
  polygonPreviewGroups:
    | ReturnType<typeof buildVerticalPolygonPreviewGroups>
    | ReturnType<typeof buildPlanarPolygonPreviewGroups>,
  type:
    | typeof ANNOTATION_TYPE_AREA_VERTICAL
    | typeof ANNOTATION_TYPE_AREA_PLANAR
): readonly PolygonPrimitiveRenderModel[] =>
  (enabled ? polygonPreviewGroups : []).map(({ group, vertexPoints }) => ({
    id: group.id,
    vertexPoints,
    fillColor: getPolygonFillColor(type, group.id === focusedPolygonGroupId),
  }));

export type PlanarMeasurementPreviewModelsOptions = {
  enabled: boolean;
  pointsById: ReadonlyMap<string, PointAnnotationEntry>;
  focusedPlanarMeasurementId: string | null;
  activePlanarMeasurementId: string | null;
  pointMarkerBadgeByPointId: Readonly<
    Record<string, AnnotationPointMarkerBadge>
  >;
  candidateConnectionPreview: CandidateConnectionPreview | null;
};

export const usePlanarMeasurementPreviewModels = (
  planarPolygonGroups: readonly PlanarMeasurementGroup[],
  {
    enabled,
    pointsById,
    focusedPlanarMeasurementId,
    activePlanarMeasurementId,
    pointMarkerBadgeByPointId,
    candidateConnectionPreview,
  }: PlanarMeasurementPreviewModelsOptions
) => {
  const verticalRectanglePreviewOppositeByGroupId = useMemo(() => {
    if (!enabled || !candidateConnectionPreview) {
      return undefined;
    }

    const target = candidateConnectionPreview.targetPointECEF;
    if (!target) {
      return undefined;
    }

    const activeGroup = activePlanarMeasurementId
      ? planarPolygonGroups.find(
          (group) => group.id === activePlanarMeasurementId
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
    activePlanarMeasurementId,
    enabled,
    candidateConnectionPreview,
    planarPolygonGroups,
  ]);

  const polylineMeasurements = useMemo(
    () =>
      buildPolylinePreviewMeasurements({
        planarPolygonGroups: [...planarPolygonGroups],
        pointsById,
        verticalRectanglePreviewOppositeByGroupId,
      }),
    [verticalRectanglePreviewOppositeByGroupId, planarPolygonGroups, pointsById]
  );

  const polygonAreaBadgeByGroupId = useMemo(
    () =>
      toPolygonAreaBadgeByGroupId(
        planarPolygonGroups,
        pointMarkerBadgeByPointId
      ),
    [planarPolygonGroups, pointMarkerBadgeByPointId]
  );

  const focusedPolygonGroupId =
    focusedPlanarMeasurementId ?? activePlanarMeasurementId;

  const groundPolygonPreviewGroups = useMemo(
    () =>
      buildGroundPolygonPreviewGroups({
        planarPolygonGroups: [...planarPolygonGroups],
        pointsById,
        verticalRectanglePreviewOppositeByGroupId,
        activePlanarMeasurementId,
        candidateConnection: candidateConnectionPreview,
      }),
    [
      activePlanarMeasurementId,
      verticalRectanglePreviewOppositeByGroupId,
      candidateConnectionPreview,
      planarPolygonGroups,
      pointsById,
    ]
  );

  const verticalPolygonPreviewGroups = useMemo(
    () =>
      buildVerticalPolygonPreviewGroups({
        planarPolygonGroups: [...planarPolygonGroups],
        pointsById,
        verticalRectanglePreviewOppositeByGroupId,
        activePlanarMeasurementId,
        candidateConnection: candidateConnectionPreview,
      }),
    [
      activePlanarMeasurementId,
      verticalRectanglePreviewOppositeByGroupId,
      candidateConnectionPreview,
      planarPolygonGroups,
      pointsById,
    ]
  );

  const planarPolygonPreviewGroups = useMemo(
    () =>
      buildPlanarPolygonPreviewGroups({
        planarPolygonGroups: [...planarPolygonGroups],
        pointsById,
        verticalRectanglePreviewOppositeByGroupId,
        activePlanarMeasurementId,
        candidateConnection: candidateConnectionPreview,
      }),
    [
      activePlanarMeasurementId,
      verticalRectanglePreviewOppositeByGroupId,
      candidateConnectionPreview,
      planarPolygonGroups,
      pointsById,
    ]
  );

  const groundPolygonPrimitives = useMemo(
    () =>
      toGroundPolygonPrimitives(
        enabled,
        focusedPolygonGroupId,
        groundPolygonPreviewGroups
      ),
    [enabled, focusedPolygonGroupId, groundPolygonPreviewGroups]
  );

  const verticalPolygonPrimitives = useMemo(
    () =>
      toCoplanarPolygonPrimitives(
        enabled,
        focusedPolygonGroupId,
        verticalPolygonPreviewGroups,
        ANNOTATION_TYPE_AREA_VERTICAL
      ),
    [enabled, focusedPolygonGroupId, verticalPolygonPreviewGroups]
  );

  const planarPolygonPrimitives = useMemo(
    () =>
      toCoplanarPolygonPrimitives(
        enabled,
        focusedPolygonGroupId,
        planarPolygonPreviewGroups,
        ANNOTATION_TYPE_AREA_PLANAR
      ),
    [enabled, focusedPolygonGroupId, planarPolygonPreviewGroups]
  );

  const polygonClosurePreviewEdges = useMemo<
    readonly EdgeSceneLineRenderModel[]
  >(() => {
    if (!enabled || !candidateConnectionPreview || !activePlanarMeasurementId) {
      return [];
    }

    const activeGroup =
      planarPolygonGroups.find(
        (group) => group.id === activePlanarMeasurementId
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
    activePlanarMeasurementId,
    enabled,
    candidateConnectionPreview,
    planarPolygonGroups,
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
    groundPolygonPrimitives,
    verticalPolygonPrimitives,
    planarPolygonPrimitives,
    polygonClosurePreviewEdges,
  };
};
