import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_POLYLINE,
  type AnnotationEntry,
  type PlanarPolygonGroup,
  LINEAR_SEGMENT_LINE_MODE_COMPONENTS,
  type LinearSegmentLineMode,
} from "@carma-mapping/annotations/core";
import type { DerivedPolylinePath } from "../../context/types/derivedPolylinePath";
import type {
  AnnotationSlotActions,
  PolylineSummary,
  PolygonPolylineAnnotationSlotsInput,
} from "./annotationInfoBoxSlots.types";

type GetPlanarMeasurementSlotsInputParams = {
  polylineGroups: ReadonlyArray<PlanarPolygonGroup>;
  areaPolygonGroups: ReadonlyArray<PlanarPolygonGroup>;
  planarSurfacePolygonGroups: ReadonlyArray<PlanarPolygonGroup>;
  verticalPolygonGroups: ReadonlyArray<PlanarPolygonGroup>;
  polylines: ReadonlyArray<DerivedPolylinePath>;
  annotations: ReadonlyArray<AnnotationEntry>;
  fallbackPolylineSegmentLineMode: LinearSegmentLineMode;
  selectedPlanarPolygonGroupId: string | null;
  activePlanarPolygonGroupId: string | null;
  actions: AnnotationSlotActions;
};

export type PlanarMeasurementSlotsInputResult = {
  slotsInput: PolygonPolylineAnnotationSlotsInput | null;
  planarGroup: PlanarPolygonGroup | null;
};

const getPlanarKind = (
  group: PlanarPolygonGroup
): PolygonPolylineAnnotationSlotsInput["kind"] => group.measurementKind;

const getPolylineSummary = (
  polyline: DerivedPolylinePath | null
): PolylineSummary | null => {
  if (!polyline || polyline.segmentLengthsMeters.length === 0) {
    return null;
  }

  const segmentCount = polyline.segmentLengthsMeters.length;
  const meanSegmentLengthMeters = polyline.totalLengthMeters / segmentCount;
  const heights = polyline.vertexHeightsMeters;

  let ascentMeters = 0;
  let descentMeters = 0;
  for (let index = 1; index < heights.length; index += 1) {
    const delta = heights[index] - heights[index - 1];
    if (!Number.isFinite(delta) || Math.abs(delta) <= 1e-9) continue;
    if (delta > 0) {
      ascentMeters += delta;
    } else {
      descentMeters += Math.abs(delta);
    }
  }
  const startEndElevationDeltaMeters =
    heights.length >= 2 ? heights[heights.length - 1] - heights[0] : 0;

  return {
    segmentCount,
    meanSegmentLengthMeters,
    totalAbsoluteElevationChangeMeters: ascentMeters + descentMeters,
    startEndElevationDeltaMeters,
    ascentMeters,
    descentMeters,
  };
};

export const getPlanarAnnotationSlotsInput = ({
  polylineGroups,
  areaPolygonGroups,
  planarSurfacePolygonGroups,
  verticalPolygonGroups,
  polylines,
  annotations,
  fallbackPolylineSegmentLineMode,
  selectedPlanarPolygonGroupId,
  activePlanarPolygonGroupId,
  actions,
}: GetPlanarMeasurementSlotsInputParams): PlanarMeasurementSlotsInputResult => {
  const planarPolygonGroups = [
    ...polylineGroups,
    ...areaPolygonGroups,
    ...planarSurfacePolygonGroups,
    ...verticalPolygonGroups,
  ];
  const focusedGroupId =
    activePlanarPolygonGroupId ?? selectedPlanarPolygonGroupId;
  const planarGroup =
    (focusedGroupId
      ? planarPolygonGroups.find((group) => group.id === focusedGroupId)
      : null) ?? null;

  if (!planarGroup) {
    return {
      slotsInput: null,
      planarGroup: null,
    };
  }

  const sameKindGroups =
    getPlanarKind(planarGroup) === ANNOTATION_TYPE_POLYLINE
      ? polylineGroups
      : getPlanarKind(planarGroup) === ANNOTATION_TYPE_AREA_GROUND
      ? areaPolygonGroups
      : getPlanarKind(planarGroup) === ANNOTATION_TYPE_AREA_PLANAR
      ? planarSurfacePolygonGroups
      : verticalPolygonGroups;
  const order =
    Math.max(
      0,
      sameKindGroups.findIndex((group) => group.id === planarGroup.id)
    ) + 1;
  const planarKind = getPlanarKind(planarGroup);
  const polyline =
    planarKind === ANNOTATION_TYPE_POLYLINE
      ? polylines.find((entry) => entry.id === planarGroup.id) ?? null
      : null;
  const segmentLineMode =
    planarKind === ANNOTATION_TYPE_POLYLINE
      ? planarGroup.segmentLineMode ??
        fallbackPolylineSegmentLineMode ??
        LINEAR_SEGMENT_LINE_MODE_COMPONENTS
      : null;
  const annotationLockedById = new Map(
    annotations.map((entry) => [entry.id, Boolean(entry.locked)] as const)
  );
  const isLocked =
    planarGroup.vertexPointIds.length > 0 &&
    planarGroup.vertexPointIds.every((vertexId) =>
      Boolean(annotationLockedById.get(vertexId))
    );

  return {
    planarGroup,
    slotsInput: {
      kind: planarKind,
      groupId: planarGroup.id,
      name: planarGroup.name,
      order,
      totalLengthMeters:
        planarGroup.perimeterMeters ?? polyline?.totalLengthMeters ?? 0,
      areaSquareMeters: planarGroup.areaSquareMeters,
      bearingDeg: planarGroup.bearingDeg,
      verticalityDeg: planarGroup.verticalityDeg,
      segmentLineMode,
      polylineSummary: getPolylineSummary(polyline),
      hidden: Boolean(planarGroup.hidden),
      locked: isLocked,
      actions,
    },
  };
};
