import { useMemo } from "react";

import { Cartesian3, Color } from "@carma/cesium";
import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_POLYLINE,
  ANNOTATION_TYPE_AREA_VERTICAL,
  POLYGON_PREVIEW_STROKE,
  POLYGON_PREVIEW_STROKE_WIDTH_PX,
  type AnnotationPointMarkerBadge,
  buildGroundPolygonPreviewGroups,
  buildPlanarPolygonPreviewGroups,
  buildPolylinePreviewEdgeSegments,
  buildPolylinePreviewMeasurements,
  buildVerticalPolygonPreviewGroups,
  type PlanarPolygonGroup,
  type PointAnnotationEntry,
} from "@carma-mapping/annotations/core";

import type {
  CoplanarPolygonPrimitiveRenderModel,
  EdgeCandidateLine,
  GroundPolygonPrimitiveRenderModel,
  TransientEdgeSegment,
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
  measurementKind:
    | typeof ANNOTATION_TYPE_AREA_VERTICAL
    | typeof ANNOTATION_TYPE_AREA_GROUND
    | typeof ANNOTATION_TYPE_AREA_PLANAR,
  isSelected: boolean
) => {
  const [red, green, blue] =
    POLYGON_FILL_RGB_BY_MEASUREMENT_TYPE[measurementKind];
  return new Color(
    red,
    green,
    blue,
    isSelected ? POLYGON_FILL_SELECTED_ALPHA : POLYGON_FILL_ALPHA
  );
};

const toPolygonAreaBadgeByGroupId = (
  planarPolygonGroups: readonly PlanarPolygonGroup[],
  pointMarkerBadgeByPointId: Readonly<
    Record<string, AnnotationPointMarkerBadge>
  >
): Readonly<Record<string, PolygonAreaBadge>> => {
  const byGroupId: Record<string, PolygonAreaBadge> = {};

  planarPolygonGroups.forEach((group) => {
    const firstVertexPointId = group.vertexPointIds[0] ?? null;
    if (!firstVertexPointId) return;

    const badge = pointMarkerBadgeByPointId[firstVertexPointId];
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
): readonly GroundPolygonPrimitiveRenderModel[] =>
  (enabled ? polygonPreviewGroups : []).map(({ group, vertexPoints }) => ({
    id: group.id,
    vertexPoints,
    fillColor: getPolygonFillColor(
      group.measurementKind as typeof ANNOTATION_TYPE_AREA_GROUND,
      group.id === focusedPolygonGroupId
    ),
  }));

const toCoplanarPolygonPrimitives = (
  enabled: boolean,
  focusedPolygonGroupId: string | null,
  polygonPreviewGroups:
    | ReturnType<typeof buildVerticalPolygonPreviewGroups>
    | ReturnType<typeof buildPlanarPolygonPreviewGroups>,
  measurementKind:
    | typeof ANNOTATION_TYPE_AREA_VERTICAL
    | typeof ANNOTATION_TYPE_AREA_PLANAR
): readonly CoplanarPolygonPrimitiveRenderModel[] =>
  (enabled ? polygonPreviewGroups : []).map(({ group, vertexPoints }) => ({
    id: group.id,
    vertexPoints,
    fillColor: getPolygonFillColor(
      measurementKind,
      group.id === focusedPolygonGroupId
    ),
  }));

export type PlanarMeasurementPreviewModelsOptions = {
  enabled: boolean;
  planarPolygonGroups: readonly PlanarPolygonGroup[];
  pointsById: ReadonlyMap<string, PointAnnotationEntry>;
  selectedPlanarPolygonGroupId: string | null;
  activePlanarPolygonGroupId: string | null;
  pointMarkerBadgeByPointId: Readonly<
    Record<string, AnnotationPointMarkerBadge>
  >;
  candidateEdgeLine: EdgeCandidateLine;
};

export const usePlanarMeasurementPreviewModels = ({
  enabled,
  planarPolygonGroups,
  pointsById,
  selectedPlanarPolygonGroupId,
  activePlanarPolygonGroupId,
  pointMarkerBadgeByPointId,
  candidateEdgeLine,
}: PlanarMeasurementPreviewModelsOptions) => {
  const facadeRectanglePreviewOppositeByGroupId = useMemo(() => {
    if (!enabled || !candidateEdgeLine) {
      return undefined;
    }

    const target = candidateEdgeLine.targetPointECEF;
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
    candidateEdgeLine,
    planarPolygonGroups,
  ]);

  const polylineMeasurements = useMemo(
    () =>
      buildPolylinePreviewMeasurements({
        planarPolygonGroups: [...planarPolygonGroups],
        pointsById,
        facadeRectanglePreviewOppositeByGroupId,
      }),
    [facadeRectanglePreviewOppositeByGroupId, planarPolygonGroups, pointsById]
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
    selectedPlanarPolygonGroupId ?? activePlanarPolygonGroupId;

  const groundPolygonPreviewGroups = useMemo(
    () =>
      buildGroundPolygonPreviewGroups({
        planarPolygonGroups: [...planarPolygonGroups],
        pointsById,
        facadeRectanglePreviewOppositeByGroupId,
        activePlanarPolygonGroupId,
        candidateEdgeLine: candidateEdgeLine,
      }),
    [
      activePlanarPolygonGroupId,
      facadeRectanglePreviewOppositeByGroupId,
      candidateEdgeLine,
      planarPolygonGroups,
      pointsById,
    ]
  );

  const verticalPolygonPreviewGroups = useMemo(
    () =>
      buildVerticalPolygonPreviewGroups({
        planarPolygonGroups: [...planarPolygonGroups],
        pointsById,
        facadeRectanglePreviewOppositeByGroupId,
        activePlanarPolygonGroupId,
        candidateEdgeLine: candidateEdgeLine,
      }),
    [
      activePlanarPolygonGroupId,
      facadeRectanglePreviewOppositeByGroupId,
      candidateEdgeLine,
      planarPolygonGroups,
      pointsById,
    ]
  );

  const planarPolygonPreviewGroups = useMemo(
    () =>
      buildPlanarPolygonPreviewGroups({
        planarPolygonGroups: [...planarPolygonGroups],
        pointsById,
        facadeRectanglePreviewOppositeByGroupId,
        activePlanarPolygonGroupId,
        candidateEdgeLine: candidateEdgeLine,
      }),
    [
      activePlanarPolygonGroupId,
      facadeRectanglePreviewOppositeByGroupId,
      candidateEdgeLine,
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
    readonly TransientEdgeSegment[]
  >(() => {
    if (!enabled || !candidateEdgeLine || !activePlanarPolygonGroupId) {
      return [];
    }

    const activeGroup =
      planarPolygonGroups.find(
        (group) => group.id === activePlanarPolygonGroupId
      ) ?? null;
    if (!activeGroup || activeGroup.closed) {
      return [];
    }
    if (activeGroup.measurementKind === ANNOTATION_TYPE_POLYLINE) {
      return [];
    }
    if (activeGroup.vertexPointIds.length < 2) {
      return [];
    }

    const firstVertexId = activeGroup.vertexPointIds[0] ?? null;
    const firstVertex = firstVertexId
      ? pointsById.get(firstVertexId)?.geometryECEF
      : null;
    const previewTarget = candidateEdgeLine.targetPointECEF;
    if (!firstVertex || !previewTarget) {
      return [];
    }
    if (Cartesian3.distanceSquared(firstVertex, previewTarget) <= 1e-6) {
      return [];
    }

    return [
      {
        id: `${activeGroup.id}:preview-closure`,
        start: Cartesian3.clone(previewTarget),
        end: Cartesian3.clone(firstVertex),
        stroke: POLYGON_PREVIEW_STROKE,
        strokeWidth: POLYGON_PREVIEW_STROKE_WIDTH_PX,
        dashed: false,
      },
    ];
  }, [
    activePlanarPolygonGroupId,
    enabled,
    candidateEdgeLine,
    planarPolygonGroups,
    pointsById,
  ]);

  const facadePreviewEdges = useMemo<readonly TransientEdgeSegment[]>(
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
    facadePreviewEdges,
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
