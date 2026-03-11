import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_POLYLINE,
  type AnnotationEntry,
  type DerivedPolylinePath,
  type NodeChainAnnotation,
  LINEAR_SEGMENT_LINE_MODE_COMPONENTS,
  type LinearSegmentLineMode,
} from "@carma-mapping/annotations/core";
import type {
  AnnotationSlotActions,
  PolylineSummary,
  PolygonPolylineAnnotationSlotsInput,
} from "./annotationInfoBoxSlots.types";

type GetNodeChainAnnotationSlotsInputParams = {
  polylineMeasurements: ReadonlyArray<NodeChainAnnotation>;
  groundPolygons: ReadonlyArray<NodeChainAnnotation>;
  planarPolygons: ReadonlyArray<NodeChainAnnotation>;
  verticalPolygons: ReadonlyArray<NodeChainAnnotation>;
  polylinePaths: ReadonlyArray<DerivedPolylinePath>;
  annotations: ReadonlyArray<AnnotationEntry>;
  fallbackPolylineSegmentLineMode: LinearSegmentLineMode;
  focusedNodeChainAnnotationId: string | null;
  activeNodeChainAnnotationId: string | null;
  actions: AnnotationSlotActions;
};

export type NodeChainAnnotationSlotsInputResult = {
  slotsInput: PolygonPolylineAnnotationSlotsInput | null;
  nodeChainAnnotation: NodeChainAnnotation | null;
};

const getNodeChainKind = (
  group: NodeChainAnnotation
): PolygonPolylineAnnotationSlotsInput["kind"] => group.type;

const hasDisplayableActiveMetrics = (
  group: NodeChainAnnotation | null
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

export const getNodeChainAnnotationSlotsInput = ({
  polylineMeasurements,
  groundPolygons,
  planarPolygons,
  verticalPolygons,
  polylinePaths,
  annotations,
  fallbackPolylineSegmentLineMode,
  focusedNodeChainAnnotationId,
  activeNodeChainAnnotationId,
  actions,
}: GetNodeChainAnnotationSlotsInputParams): NodeChainAnnotationSlotsInputResult => {
  const nodeChainAnnotations = [
    ...polylineMeasurements,
    ...groundPolygons,
    ...planarPolygons,
    ...verticalPolygons,
  ];
  const activeNodeChainAnnotation =
    (activeNodeChainAnnotationId
      ? nodeChainAnnotations.find(
          (group) => group.id === activeNodeChainAnnotationId
        )
      : null) ?? null;
  const selectedNodeChainAnnotation =
    (focusedNodeChainAnnotationId
      ? nodeChainAnnotations.find(
          (group) => group.id === focusedNodeChainAnnotationId
        )
      : null) ?? null;
  const nodeChainAnnotation = hasDisplayableActiveMetrics(
    activeNodeChainAnnotation
  )
    ? activeNodeChainAnnotation
    : selectedNodeChainAnnotation;

  if (!nodeChainAnnotation) {
    return {
      slotsInput: null,
      nodeChainAnnotation: null,
    };
  }

  const sameKindGroups =
    getNodeChainKind(nodeChainAnnotation) === ANNOTATION_TYPE_POLYLINE
      ? polylineMeasurements
      : getNodeChainKind(nodeChainAnnotation) === ANNOTATION_TYPE_AREA_GROUND
      ? groundPolygons
      : getNodeChainKind(nodeChainAnnotation) === ANNOTATION_TYPE_AREA_PLANAR
      ? planarPolygons
      : verticalPolygons;
  const order =
    Math.max(
      0,
      sameKindGroups.findIndex((group) => group.id === nodeChainAnnotation.id)
    ) + 1;
  const annotationKind = getNodeChainKind(nodeChainAnnotation);
  const polyline =
    annotationKind === ANNOTATION_TYPE_POLYLINE
      ? polylinePaths.find((entry) => entry.id === nodeChainAnnotation.id) ??
        null
      : null;
  const segmentLineMode =
    annotationKind === ANNOTATION_TYPE_POLYLINE
      ? nodeChainAnnotation.segmentLineMode ??
        fallbackPolylineSegmentLineMode ??
        LINEAR_SEGMENT_LINE_MODE_COMPONENTS
      : null;
  const annotationLockedById = new Map(
    annotations.map((entry) => [entry.id, Boolean(entry.locked)] as const)
  );
  const isLocked =
    nodeChainAnnotation.nodeIds.length > 0 &&
    nodeChainAnnotation.nodeIds.every((nodeId) =>
      Boolean(annotationLockedById.get(nodeId))
    );

  return {
    nodeChainAnnotation,
    slotsInput: {
      kind: annotationKind,
      measurementId: nodeChainAnnotation.id,
      name: nodeChainAnnotation.name,
      order,
      totalLengthMeters:
        nodeChainAnnotation.perimeterMeters ?? polyline?.totalLengthMeters ?? 0,
      areaSquareMeters: nodeChainAnnotation.areaSquareMeters,
      bearingDeg: nodeChainAnnotation.bearingDeg,
      verticalityDeg: nodeChainAnnotation.verticalityDeg,
      segmentLineMode,
      polylineSummary: getPolylineSummary(polyline),
      hidden: Boolean(nodeChainAnnotation.hidden),
      locked: isLocked,
      actions,
    },
  };
};
