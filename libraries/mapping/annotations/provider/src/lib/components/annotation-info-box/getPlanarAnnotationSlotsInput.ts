import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_POLYLINE,
  type AnnotationEntry,
  type DerivedPolylinePath,
  type PlanarMeasurementGroup,
  type PlanarPolylineGroup,
  type PlanarPolygonGroup,
  LINEAR_SEGMENT_LINE_MODE_COMPONENTS,
  type LinearSegmentLineMode,
} from "@carma-mapping/annotations/core";
import type {
  AnnotationSlotActions,
  PolylineSummary,
  PolygonPolylineAnnotationSlotsInput,
} from "./annotationInfoBoxSlots.types";

type GetPlanarMeasurementSlotsInputParams = {
  polylineMeasurements: ReadonlyArray<PlanarPolylineGroup>;
  groundPolygons: ReadonlyArray<PlanarPolygonGroup>;
  planarPolygons: ReadonlyArray<PlanarPolygonGroup>;
  verticalPolygons: ReadonlyArray<PlanarPolygonGroup>;
  polylinePaths: ReadonlyArray<DerivedPolylinePath>;
  annotations: ReadonlyArray<AnnotationEntry>;
  fallbackPolylineSegmentLineMode: LinearSegmentLineMode;
  focusedPlanarMeasurementId: string | null;
  activePlanarMeasurementId: string | null;
  actions: AnnotationSlotActions;
};

export type PlanarMeasurementSlotsInputResult = {
  slotsInput: PolygonPolylineAnnotationSlotsInput | null;
  planarGroup: PlanarMeasurementGroup | null;
};

const getPlanarKind = (
  group: PlanarMeasurementGroup
): PolygonPolylineAnnotationSlotsInput["kind"] => group.type;

const hasDisplayableActiveMetrics = (
  group: PlanarMeasurementGroup | null
): boolean => {
  if (!group) return false;
  const requiredVertexCount = group.type === ANNOTATION_TYPE_POLYLINE ? 2 : 3;
  return group.nodeIds.length >= requiredVertexCount;
};

const getPolylineSummary = (
  polyline: DerivedPolylinePath | null
): PolylineSummary | null => {
  if (!polyline || polyline.segmentLengthsMeters.length === 0) {
    return null;
  }

  const segmentCount = polyline.segmentLengthsMeters.length;
  const meanSegmentLengthMeters = polyline.totalLengthMeters / segmentCount;
  const heights = polyline.nodeHeightsMeters;

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
  polylineMeasurements,
  groundPolygons,
  planarPolygons,
  verticalPolygons,
  polylinePaths,
  annotations,
  fallbackPolylineSegmentLineMode,
  focusedPlanarMeasurementId,
  activePlanarMeasurementId,
  actions,
}: GetPlanarMeasurementSlotsInputParams): PlanarMeasurementSlotsInputResult => {
  const planarPolygonGroups = [
    ...polylineMeasurements,
    ...groundPolygons,
    ...planarPolygons,
    ...verticalPolygons,
  ];
  const activePlanarGroup =
    (activePlanarMeasurementId
      ? planarPolygonGroups.find(
          (group) => group.id === activePlanarMeasurementId
        )
      : null) ?? null;
  const selectedPlanarGroup =
    (focusedPlanarMeasurementId
      ? planarPolygonGroups.find(
          (group) => group.id === focusedPlanarMeasurementId
        )
      : null) ?? null;
  const planarGroup = hasDisplayableActiveMetrics(activePlanarGroup)
    ? activePlanarGroup
    : selectedPlanarGroup;

  if (!planarGroup) {
    return {
      slotsInput: null,
      planarGroup: null,
    };
  }

  const sameKindGroups =
    getPlanarKind(planarGroup) === ANNOTATION_TYPE_POLYLINE
      ? polylineMeasurements
      : getPlanarKind(planarGroup) === ANNOTATION_TYPE_AREA_GROUND
      ? groundPolygons
      : getPlanarKind(planarGroup) === ANNOTATION_TYPE_AREA_PLANAR
      ? planarPolygons
      : verticalPolygons;
  const order =
    Math.max(
      0,
      sameKindGroups.findIndex((group) => group.id === planarGroup.id)
    ) + 1;
  const planarKind = getPlanarKind(planarGroup);
  const polyline =
    planarKind === ANNOTATION_TYPE_POLYLINE
      ? polylinePaths.find((entry) => entry.id === planarGroup.id) ?? null
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
    planarGroup.nodeIds.length > 0 &&
    planarGroup.nodeIds.every((nodeId) =>
      Boolean(annotationLockedById.get(nodeId))
    );

  return {
    planarGroup,
    slotsInput: {
      kind: planarKind,
      measurementId: planarGroup.id,
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
