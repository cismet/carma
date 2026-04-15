import { useCallback, useMemo } from "react";
import {
  buildOrderByIdFromEntryOrder,
  type PointMeasurementEntry,
  type NodeChainAnnotation,
  isPointAnnotationEntry,
  isPointMeasurementEntry,
  ANNOTATION_TYPES,
} from "@carma-mapping/annotations/core";
import { useDistanceAnnotationReadModel } from "../../annotation-entries/hooks/use-distance-annotation-read-model";
import { useNodeChainAnnotationReadModel } from "../../annotation-entries/hooks/use-node-chain-annotation-read-model";
import type { NodeChainBadgeKind } from "../../render/point/use-point-marker-badges";
import { usePointMarkerBadges } from "../../render/use-render";
import {
  useCollection,
  useEditingState,
  useSelectionState,
  useSettings,
  useAnnotationsStore,
  useStoreSelector,
  useTools,
} from "../../store";
import type { AnnotationInfoBoxPayload } from "./annotation-info.types";
import { AnnotationInfoBoxNavigation } from "./components";
import { getAnnotationInfoBoxSlots } from "./get-annotation-info-box-slots";
import type { AnnotationInfoBoxEntryPayload } from "./get-annotation-info-box-slots";
import { resolveAnnotationInfoBoxSubject } from "./resolve-annotation-info-box-subject";
import { useNavigationBindings } from "./use-navigation-bindings";
import { useSlotActions } from "./use-slot-actions";
const {
  DISTANCE: ANNOTATION_TYPE_DISTANCE,
  POLYLINE: ANNOTATION_TYPE_POLYLINE,
} = ANNOTATION_TYPES;

export const usePayload = (pixelWidth: number): AnnotationInfoBoxPayload => {
  const tools = useTools();
  const annotations = useCollection();
  const editing = useEditingState();
  const selection = useSelectionState();
  const settings = useSettings();
  const annotationsStore = useAnnotationsStore("usePayload");
  const distanceReadModel = useDistanceAnnotationReadModel();
  const nodeChainReadModel = useNodeChainAnnotationReadModel();
  const actions = useSlotActions();
  const pendingLabelPlacementAnnotationId = useStoreSelector(
    annotationsStore,
    (state) => state.pendingLabelPlacementAnnotationId
  );
  const pointEntries = useMemo(
    () => annotations.items.filter(isPointAnnotationEntry),
    [annotations.items]
  );
  const labelMeasurements = useMemo(
    () =>
      annotations.items.filter(
        (annotation): annotation is PointMeasurementEntry =>
          isPointMeasurementEntry(annotation) &&
          Boolean(annotation.auxiliaryLabelAnchor)
      ),
    [annotations.items]
  );
  const pointMeasurementEntries = useMemo(
    () => annotations.items.filter(isPointMeasurementEntry),
    [annotations.items]
  );
  const pointMeasureOrderById = useMemo(
    () =>
      buildOrderByIdFromEntryOrder(
        pointMeasurementEntries.filter(
          (annotation) => !annotation.auxiliaryLabelAnchor
        )
      ),
    [pointMeasurementEntries]
  );
  const badgeNodeChains = useMemo(
    () =>
      nodeChainReadModel.nodeChainAnnotations.filter(
        (
          annotation
        ): annotation is NodeChainAnnotation & { type: NodeChainBadgeKind } =>
          annotation.type !== ANNOTATION_TYPE_DISTANCE
      ),
    [nodeChainReadModel.nodeChainAnnotations]
  );
  const pointMarkerBadgeByPointId = usePointMarkerBadges(
    pointEntries,
    badgeNodeChains,
    distanceReadModel.distanceRelations,
    pointMeasureOrderById
  );
  const openChainPointId = useMemo(() => {
    const activeNodeChainAnnotationId =
      nodeChainReadModel.activeNodeChainAnnotationId;
    if (!activeNodeChainAnnotationId) {
      return null;
    }

    const activeOpenAnnotation =
      nodeChainReadModel.nodeChainAnnotations.find(
        (annotation) =>
          annotation.id === activeNodeChainAnnotationId && !annotation.closed
      ) ?? null;

    return (
      activeOpenAnnotation?.nodeIds[activeOpenAnnotation.nodeIds.length - 1] ??
      null
    );
  }, [
    nodeChainReadModel.activeNodeChainAnnotationId,
    nodeChainReadModel.nodeChainAnnotations,
  ]);
  const polylineSettings = settings.get(ANNOTATION_TYPE_POLYLINE);
  const primarySelectedAnnotationId =
    selection.ids[selection.ids.length - 1] ?? null;
  const subject = useMemo(
    () =>
      resolveAnnotationInfoBoxSubject({
        activeToolType: tools.activeToolType,
        pointEntries,
        polylineAnnotations: nodeChainReadModel.polylineAnnotations,
        groundPolygons: nodeChainReadModel.groundPolygons,
        planarPolygons: nodeChainReadModel.planarPolygons,
        verticalPolygons: nodeChainReadModel.verticalPolygons,
        primarySelectedAnnotationId,
        currentEditingAnnotationId: editing.currentAnnotationId,
        openChainPointId,
        pendingLabelPlacementAnnotationId,
        activeNodeChainAnnotationId:
          nodeChainReadModel.activeNodeChainAnnotationId,
        focusedNodeChainAnnotationId:
          nodeChainReadModel.focusedNodeChainAnnotationId,
      }),
    [
      editing.currentAnnotationId,
      nodeChainReadModel.activeNodeChainAnnotationId,
      nodeChainReadModel.focusedNodeChainAnnotationId,
      nodeChainReadModel.groundPolygons,
      nodeChainReadModel.planarPolygons,
      pointEntries,
      nodeChainReadModel.polylineAnnotations,
      nodeChainReadModel.verticalPolygons,
      openChainPointId,
      pendingLabelPlacementAnnotationId,
      primarySelectedAnnotationId,
      tools.activeToolType,
    ]
  );
  const payload = useMemo<AnnotationInfoBoxEntryPayload>(
    () => ({
      kind: subject.kind,
      annotationId: subject.annotationId,
      pointAnnotation: subject.pointAnnotation,
      nodeChainAnnotation: subject.nodeChainAnnotation,
      annotations: annotations.items,
      pointEntries,
      labelMeasurements,
      distanceRelations: distanceReadModel.distanceRelations,
      referencePoint: distanceReadModel.referencePoint,
      pointMarkerBadgeByPointId,
      polylinePath:
        subject.nodeChainAnnotation?.type === ANNOTATION_TYPE_POLYLINE
          ? nodeChainReadModel.polylinePaths.find(
              (entry) => entry.id === subject.nodeChainAnnotation?.id
            ) ?? null
          : null,
      polylineAnnotations: nodeChainReadModel.polylineAnnotations,
      groundPolygons: nodeChainReadModel.groundPolygons,
      planarPolygons: nodeChainReadModel.planarPolygons,
      verticalPolygons: nodeChainReadModel.verticalPolygons,
      fallbackPolylineSegmentLineMode: polylineSettings.segmentLineMode,
      pendingLabelPlacementAnnotationId,
      actions,
    }),
    [
      actions,
      annotations.items,
      distanceReadModel.distanceRelations,
      distanceReadModel.referencePoint,
      labelMeasurements,
      nodeChainReadModel.groundPolygons,
      nodeChainReadModel.planarPolygons,
      nodeChainReadModel.polylineAnnotations,
      nodeChainReadModel.polylinePaths,
      nodeChainReadModel.verticalPolygons,
      pendingLabelPlacementAnnotationId,
      pointEntries,
      pointMarkerBadgeByPointId,
      polylineSettings.segmentLineMode,
      subject.annotationId,
      subject.kind,
      subject.nodeChainAnnotation,
      subject.pointAnnotation,
    ]
  );
  const {
    navigationMeasurements,
    currentNavigationId,
    handleNavigationSelection,
    onFlyToAllMeasurements,
  } = useNavigationBindings(payload);
  const totalEntries = navigationMeasurements.length;
  const currentIndex = Math.max(
    0,
    navigationMeasurements.findIndex(
      (measurement) => measurement.id === currentNavigationId
    )
  );
  const onPreviousMeasurement = useCallback(() => {
    if (totalEntries === 0) return;
    const nextIndex = (currentIndex - 1 + totalEntries) % totalEntries;
    handleNavigationSelection(navigationMeasurements[nextIndex]?.id ?? null);
  }, [
    currentIndex,
    handleNavigationSelection,
    navigationMeasurements,
    totalEntries,
  ]);
  const onNextMeasurement = useCallback(() => {
    if (totalEntries === 0) return;
    const nextIndex = (currentIndex + 1) % totalEntries;
    handleNavigationSelection(navigationMeasurements[nextIndex]?.id ?? null);
  }, [
    currentIndex,
    handleNavigationSelection,
    navigationMeasurements,
    totalEntries,
  ]);
  const slots = getAnnotationInfoBoxSlots(payload);

  return {
    pixelWidth,
    headingColor: "rgba(59, 130, 246, 0.7)",
    headingTitle: slots.headingTitle,
    collapsible: slots.collapsible,
    footer: (
      <AnnotationInfoBoxNavigation
        totalEntries={totalEntries}
        currentIndex={currentIndex}
        instructionText={slots.instructionText}
        onFlyToAllMeasurements={onFlyToAllMeasurements}
        onPreviousMeasurement={onPreviousMeasurement}
        onNextMeasurement={onNextMeasurement}
      />
    ),
    subtitle: slots.subtitle,
    content: slots.content,
  };
};
