import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_LABEL,
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_POLYLINE,
  SELECT_TOOL_TYPE,
  isDistancePointEntry,
  isPointMeasurementEntry,
  type AnnotationPointEntry,
  type AnnotationToolType,
  type DistancePointEntry,
  type NodeChainAnnotation,
  type PointMeasurementEntry,
} from "@carma-mapping/annotations/core";

import type { AnnotationInfoBoxEntryPayload } from "./annotationInfoBoxSlots.types";

type ResolveAnnotationInfoBoxSubjectParams = {
  activeToolType: AnnotationToolType;
  pointEntries: ReadonlyArray<AnnotationPointEntry>;
  polylineAnnotations: ReadonlyArray<NodeChainAnnotation>;
  groundPolygons: ReadonlyArray<NodeChainAnnotation>;
  planarPolygons: ReadonlyArray<NodeChainAnnotation>;
  verticalPolygons: ReadonlyArray<NodeChainAnnotation>;
  primarySelectedAnnotationId: string | null;
  currentEditingAnnotationId: string | null;
  openChainPointId: string | null;
  pendingLabelPlacementAnnotationId: string | null;
  activeNodeChainAnnotationId: string | null;
  focusedNodeChainAnnotationId: string | null;
};

type ResolvedAnnotationInfoBoxPayloadBase = Pick<
  AnnotationInfoBoxEntryPayload,
  "kind" | "annotationId" | "pointAnnotation" | "nodeChainAnnotation"
>;

type PointEntryBuckets = {
  pointMeasurements: ReadonlyArray<PointMeasurementEntry>;
  labelMeasurements: ReadonlyArray<PointMeasurementEntry>;
  standaloneDistanceMeasurements: ReadonlyArray<DistancePointEntry>;
};

type NodeChainCollections = Pick<
  ResolveAnnotationInfoBoxSubjectParams,
  | "polylineAnnotations"
  | "groundPolygons"
  | "planarPolygons"
  | "verticalPolygons"
>;

const EMPTY_SUBJECT: ResolvedAnnotationInfoBoxPayloadBase = {
  kind: "unsupported",
  annotationId: null,
  pointAnnotation: null,
  nodeChainAnnotation: null,
};

const getAllNodeChainAnnotations = ({
  polylineAnnotations,
  groundPolygons,
  planarPolygons,
  verticalPolygons,
}: NodeChainCollections): ReadonlyArray<NodeChainAnnotation> => [
  ...polylineAnnotations,
  ...groundPolygons,
  ...planarPolygons,
  ...verticalPolygons,
];

const getNodeChainGroupsForKind = (
  kind: AnnotationToolType,
  collections: NodeChainCollections
): ReadonlyArray<NodeChainAnnotation> => {
  if (kind === ANNOTATION_TYPE_POLYLINE) {
    return collections.polylineAnnotations;
  }

  if (kind === ANNOTATION_TYPE_AREA_GROUND) {
    return collections.groundPolygons;
  }

  if (kind === ANNOTATION_TYPE_AREA_PLANAR) {
    return collections.planarPolygons;
  }

  if (kind === ANNOTATION_TYPE_AREA_VERTICAL) {
    return collections.verticalPolygons;
  }

  return [];
};

const hasDisplayableNodeChainMetrics = (
  annotation: NodeChainAnnotation | null
): boolean => {
  if (!annotation) {
    return false;
  }

  return (
    annotation.nodeIds.length >=
    (annotation.type === ANNOTATION_TYPE_POLYLINE ? 2 : 3)
  );
};

const findById = <TEntry extends { id: string }>(
  entries: ReadonlyArray<TEntry>,
  id: string | null
): TEntry | null =>
  id ? entries.find((entry) => entry.id === id) ?? null : null;

const getLastEntry = <TEntry>(entries: ReadonlyArray<TEntry>): TEntry | null =>
  entries[entries.length - 1] ?? null;

const splitPointEntries = (
  pointEntries: ReadonlyArray<AnnotationPointEntry>,
  nodeChainAnnotations: ReadonlyArray<NodeChainAnnotation>
): PointEntryBuckets => {
  const nodeChainNodeIdSet = new Set(
    nodeChainAnnotations
      .filter((annotation) => annotation.type !== ANNOTATION_TYPE_DISTANCE)
      .flatMap((annotation) => annotation.nodeIds)
  );

  return {
    pointMeasurements: pointEntries.filter(
      (entry): entry is PointMeasurementEntry =>
        isPointMeasurementEntry(entry) && !entry.auxiliaryLabelAnchor
    ),
    labelMeasurements: pointEntries.filter(
      (entry): entry is PointMeasurementEntry =>
        isPointMeasurementEntry(entry) && Boolean(entry.auxiliaryLabelAnchor)
    ),
    standaloneDistanceMeasurements: pointEntries.filter(
      (entry): entry is DistancePointEntry =>
        isDistancePointEntry(entry) &&
        !entry.auxiliaryLabelAnchor &&
        !nodeChainNodeIdSet.has(entry.id)
    ),
  };
};

const resolveSelectedSubject = ({
  selectedNodeChainAnnotation,
  selectedLabelMeasurement,
  selectedDistanceMeasurement,
  selectedPointMeasurement,
}: {
  selectedNodeChainAnnotation: NodeChainAnnotation | null;
  selectedLabelMeasurement: PointMeasurementEntry | null;
  selectedDistanceMeasurement: DistancePointEntry | null;
  selectedPointMeasurement: PointMeasurementEntry | null;
}): ResolvedAnnotationInfoBoxPayloadBase => {
  if (selectedNodeChainAnnotation) {
    return {
      kind: selectedNodeChainAnnotation.type,
      annotationId: selectedNodeChainAnnotation.id,
      pointAnnotation: null,
      nodeChainAnnotation: selectedNodeChainAnnotation,
    };
  }

  if (selectedLabelMeasurement) {
    return {
      kind: ANNOTATION_TYPE_LABEL,
      annotationId: selectedLabelMeasurement.id,
      pointAnnotation: selectedLabelMeasurement,
      nodeChainAnnotation: null,
    };
  }

  if (selectedDistanceMeasurement) {
    return {
      kind: ANNOTATION_TYPE_DISTANCE,
      annotationId: selectedDistanceMeasurement.id,
      pointAnnotation: selectedDistanceMeasurement,
      nodeChainAnnotation: null,
    };
  }

  if (selectedPointMeasurement) {
    return {
      kind: ANNOTATION_TYPE_POINT,
      annotationId: selectedPointMeasurement.id,
      pointAnnotation: selectedPointMeasurement,
      nodeChainAnnotation: null,
    };
  }

  return EMPTY_SUBJECT;
};

const resolvePointSubject = ({
  kind,
  currentAnnotation,
  selectedAnnotation,
  lastAnnotation,
}: {
  kind:
    | typeof ANNOTATION_TYPE_POINT
    | typeof ANNOTATION_TYPE_DISTANCE
    | typeof ANNOTATION_TYPE_LABEL;
  currentAnnotation: AnnotationPointEntry | null;
  selectedAnnotation: AnnotationPointEntry | null;
  lastAnnotation: AnnotationPointEntry | null;
}): ResolvedAnnotationInfoBoxPayloadBase => {
  const pointAnnotation =
    currentAnnotation ?? selectedAnnotation ?? lastAnnotation;

  return {
    kind,
    annotationId: pointAnnotation?.id ?? null,
    pointAnnotation,
    nodeChainAnnotation: null,
  };
};

const resolveNodeChainSubject = ({
  activeToolType,
  activeNodeChainAnnotation,
  selectedNodeChainAnnotation,
  collections,
}: {
  activeToolType:
    | typeof ANNOTATION_TYPE_POLYLINE
    | typeof ANNOTATION_TYPE_AREA_GROUND
    | typeof ANNOTATION_TYPE_AREA_PLANAR
    | typeof ANNOTATION_TYPE_AREA_VERTICAL;
  activeNodeChainAnnotation: NodeChainAnnotation | null;
  selectedNodeChainAnnotation: NodeChainAnnotation | null;
  collections: NodeChainCollections;
}): ResolvedAnnotationInfoBoxPayloadBase => {
  const sameKindGroups = getNodeChainGroupsForKind(activeToolType, collections);
  const activeSameKindAnnotation =
    activeNodeChainAnnotation?.type === activeToolType
      ? activeNodeChainAnnotation
      : null;
  const selectedSameKindAnnotation =
    selectedNodeChainAnnotation?.type === activeToolType
      ? selectedNodeChainAnnotation
      : null;
  const fallbackAnnotation =
    [...sameKindGroups]
      .reverse()
      .find((annotation) => hasDisplayableNodeChainMetrics(annotation)) ?? null;
  const nodeChainAnnotation = hasDisplayableNodeChainMetrics(
    activeSameKindAnnotation
  )
    ? activeSameKindAnnotation
    : hasDisplayableNodeChainMetrics(selectedSameKindAnnotation)
    ? selectedSameKindAnnotation
    : fallbackAnnotation;

  return {
    kind: activeToolType,
    annotationId: nodeChainAnnotation?.id ?? null,
    pointAnnotation: null,
    nodeChainAnnotation,
  };
};

export const resolveAnnotationInfoBoxSubject = ({
  activeToolType,
  pointEntries,
  polylineAnnotations,
  groundPolygons,
  planarPolygons,
  verticalPolygons,
  primarySelectedAnnotationId,
  currentEditingAnnotationId,
  openChainPointId,
  pendingLabelPlacementAnnotationId,
  activeNodeChainAnnotationId,
  focusedNodeChainAnnotationId,
}: ResolveAnnotationInfoBoxSubjectParams): ResolvedAnnotationInfoBoxPayloadBase => {
  const nodeChainCollections: NodeChainCollections = {
    polylineAnnotations,
    groundPolygons,
    planarPolygons,
    verticalPolygons,
  };
  const allNodeChainAnnotations =
    getAllNodeChainAnnotations(nodeChainCollections);
  const {
    pointMeasurements,
    labelMeasurements,
    standaloneDistanceMeasurements,
  } = splitPointEntries(pointEntries, allNodeChainAnnotations);
  const selectedNodeChainAnnotation = findById(
    allNodeChainAnnotations,
    focusedNodeChainAnnotationId
  );
  const activeNodeChainAnnotation = findById(
    allNodeChainAnnotations,
    activeNodeChainAnnotationId
  );
  const selectedPointMeasurement = findById(
    pointMeasurements,
    primarySelectedAnnotationId
  );
  const selectedLabelMeasurement = findById(
    labelMeasurements,
    primarySelectedAnnotationId
  );
  const selectedDistanceMeasurement = findById(
    standaloneDistanceMeasurements,
    primarySelectedAnnotationId
  );

  if (activeToolType === SELECT_TOOL_TYPE) {
    return resolveSelectedSubject({
      selectedNodeChainAnnotation,
      selectedLabelMeasurement,
      selectedDistanceMeasurement,
      selectedPointMeasurement,
    });
  }

  if (activeToolType === ANNOTATION_TYPE_POINT) {
    return resolvePointSubject({
      kind: ANNOTATION_TYPE_POINT,
      currentAnnotation: findById(
        pointMeasurements,
        currentEditingAnnotationId
      ),
      selectedAnnotation: selectedPointMeasurement,
      lastAnnotation: getLastEntry(pointMeasurements),
    });
  }

  if (activeToolType === ANNOTATION_TYPE_DISTANCE) {
    return resolvePointSubject({
      kind: ANNOTATION_TYPE_DISTANCE,
      currentAnnotation:
        findById(standaloneDistanceMeasurements, openChainPointId) ??
        findById(standaloneDistanceMeasurements, currentEditingAnnotationId),
      selectedAnnotation: selectedDistanceMeasurement,
      lastAnnotation: getLastEntry(standaloneDistanceMeasurements),
    });
  }

  if (activeToolType === ANNOTATION_TYPE_LABEL) {
    return resolvePointSubject({
      kind: ANNOTATION_TYPE_LABEL,
      currentAnnotation:
        findById(labelMeasurements, pendingLabelPlacementAnnotationId) ??
        findById(labelMeasurements, currentEditingAnnotationId),
      selectedAnnotation: selectedLabelMeasurement,
      lastAnnotation: getLastEntry(labelMeasurements),
    });
  }

  if (
    activeToolType === ANNOTATION_TYPE_POLYLINE ||
    activeToolType === ANNOTATION_TYPE_AREA_GROUND ||
    activeToolType === ANNOTATION_TYPE_AREA_PLANAR ||
    activeToolType === ANNOTATION_TYPE_AREA_VERTICAL
  ) {
    return resolveNodeChainSubject({
      activeToolType,
      activeNodeChainAnnotation,
      selectedNodeChainAnnotation,
      collections: nodeChainCollections,
    });
  }

  return EMPTY_SUBJECT;
};
