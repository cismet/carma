import { useMemo } from "react";

import {
  isPointAnnotationEntry,
  useCesiumAnnotations,
  type AnnotationEntry,
  type AnnotationMode,
} from "@carma-mapping/annotations/cesium";
import {
  useAnnotationMeasurements,
  useAnnotationSelection,
} from "@carma-mapping/annotations/core";
import { AnnotationInfoBoxNavigation } from "./AnnotationInfoBoxNavigation";
import type { AnnotationInfoBoxPayload } from "./AnnotationInfo.types";
import { getDistanceAnnotationSlotsInput } from "./getDistanceAnnotationSlotsInput";
import { getLabelAnnotationSlotsInput } from "./getLabelAnnotationSlotsInput";
import { getPlanarAnnotationSlotsInput } from "./getPlanarAnnotationSlotsInput";
import {
  getAnnotationInfoBoxSlots,
  type AnnotationSlotActions,
  type AnnotationSlotKind,
  type AnnotationSlotsInput,
} from "./getAnnotationInfoBoxSlots";
import { getPointAnnotationSlotsInput } from "./getPointAnnotationSlotsInput";
import { useAnnotationInfoNavigationState } from "./useAnnotationInfoNavigationState";

type UseAnnotationInfoBoxPayloadParams = {
  pixelWidth: number;
};

export const useAnnotationInfoBoxPayload = ({
  pixelWidth,
}: UseAnnotationInfoBoxPayloadParams): AnnotationInfoBoxPayload => {
  const {
    measurementMode,
    measurements,
    liveMeasurementCandidate,
    getMeasurementsForNavigation,
    measurementsByType,
    getMeasurementOrderByType,
    getNextMeasurementOrderByType,
    pointLabelOnCreate,
    labelInputPromptPointId,
    updateMeasurementNameById,
    updateMeasurementById,
    deleteMeasurementById,
    toggleMeasurementLockById,
    updatePointLabelAppearanceById,
    confirmPointLabelInputById,
    clearMeasurementsByIds,
  } = useAnnotationMeasurements<AnnotationMode, AnnotationEntry>();
  const { selectedMeasurementId, selectMeasurementById } =
    useAnnotationSelection();
  const {
    activeMeasurementId,
    referencePoint,
    distanceRelations,
    pointMarkerBadgeByPointId,
    hasDistancePreviewAnchor,
    flyToMeasurementById,
    flyToAllMeasurements,
    setReferencePoint,
    selectedPlanarPolygonGroupId,
    activePlanarPolygonGroupId,
    planarPolygonGroups,
    polylineGroups,
    areaPolygonGroups,
    planarSurfacePolygonGroups,
    verticalPolygonGroups,
    updatePlanarPolygonNameById,
    selectPlanarPolygonGroupById,
  } = useCesiumAnnotations();

  const isPointModeLivePreviewActive =
    measurementMode === "point_measure" && !pointLabelOnCreate;
  const isDistanceModeLivePreviewActive = measurementMode === "point_query";
  const isLivePreviewMode =
    isPointModeLivePreviewActive || isDistanceModeLivePreviewActive;
  const effectiveMeasurementId = isLivePreviewMode
    ? activeMeasurementId ?? selectedMeasurementId
    : selectedMeasurementId ?? activeMeasurementId;

  const pointMeasurements = useMemo(
    () => measurements.filter(isPointAnnotationEntry),
    [measurements]
  );

  const currentMeasurement = useMemo(
    () =>
      pointMeasurements.find(
        (measurement) => measurement.id === effectiveMeasurementId
      ) ?? null,
    [effectiveMeasurementId, pointMeasurements]
  );
  const livePreviewMeasurement = useMemo(
    () =>
      liveMeasurementCandidate &&
      isPointAnnotationEntry(liveMeasurementCandidate)
        ? liveMeasurementCandidate
        : null,
    [liveMeasurementCandidate]
  );
  const displayMeasurement = useMemo(
    () =>
      livePreviewMeasurement
        ? livePreviewMeasurement
        : isPointModeLivePreviewActive || isDistanceModeLivePreviewActive
        ? null
        : currentMeasurement,
    [
      currentMeasurement,
      isDistanceModeLivePreviewActive,
      isPointModeLivePreviewActive,
      livePreviewMeasurement,
    ]
  );
  const slotActions = useMemo<AnnotationSlotActions>(
    () => ({
      updateMeasurementNameById,
      updateMeasurementById,
      deleteMeasurementById,
      toggleMeasurementLockById,
      flyToMeasurementById,
      setReferencePoint,
      confirmPointLabelInputById,
      updatePointLabelAppearanceById,
      updatePlanarPolygonNameById,
      deletePlanarPolygonGroupById: (groupId: string) => {
        const group = planarPolygonGroups.find((entry) => entry.id === groupId);
        if (!group) return;
        const vertexIds = group.vertexPointIds.filter(
          (vertexId): vertexId is string => Boolean(vertexId)
        );
        if (vertexIds.length === 0) return;
        clearMeasurementsByIds(vertexIds);
        selectPlanarPolygonGroupById(null);
      },
    }),
    [
      clearMeasurementsByIds,
      deleteMeasurementById,
      flyToMeasurementById,
      planarPolygonGroups,
      selectPlanarPolygonGroupById,
      setReferencePoint,
      confirmPointLabelInputById,
      toggleMeasurementLockById,
      updatePlanarPolygonNameById,
      updateMeasurementById,
      updateMeasurementNameById,
      updatePointLabelAppearanceById,
    ]
  );

  const pointSlotsInputResult = useMemo(
    () =>
      getPointAnnotationSlotsInput({
        measurementMode,
        pointLabelOnCreate,
        measurement: displayMeasurement,
        referencePoint,
        getMeasurementOrderByType,
        getNextMeasurementOrderByType,
        actions: slotActions,
      }),
    [
      displayMeasurement,
      getMeasurementOrderByType,
      getNextMeasurementOrderByType,
      measurementMode,
      pointLabelOnCreate,
      referencePoint,
      slotActions,
    ]
  );

  const distanceSlotsInputResult = useMemo(
    () =>
      getDistanceAnnotationSlotsInput({
        measurementMode,
        measurement: displayMeasurement,
        activeMeasurementId,
        pointMeasurements,
        referencePoint,
        hasDistancePreviewAnchor,
        distanceRelations,
        pointMarkerBadgeByPointId,
        getMeasurementOrderByType,
        getNextMeasurementOrderByType,
        actions: slotActions,
      }),
    [
      displayMeasurement,
      distanceRelations,
      getMeasurementOrderByType,
      getNextMeasurementOrderByType,
      hasDistancePreviewAnchor,
      measurementMode,
      activeMeasurementId,
      pointMeasurements,
      pointMarkerBadgeByPointId,
      referencePoint,
      slotActions,
    ]
  );

  const labelSlotsInputResult = useMemo(
    () =>
      getLabelAnnotationSlotsInput({
        measurement: displayMeasurement,
        labelMeasurements: measurementsByType("pointLabel").filter(
          isPointAnnotationEntry
        ),
        labelInputPromptPointId,
        actions: slotActions,
      }),
    [
      displayMeasurement,
      labelInputPromptPointId,
      measurementsByType,
      slotActions,
    ]
  );

  const planarSlotsInputResult = useMemo(
    () =>
      getPlanarAnnotationSlotsInput({
        polylineGroups,
        areaPolygonGroups,
        planarSurfacePolygonGroups,
        verticalPolygonGroups,
        selectedPlanarPolygonGroupId,
        activePlanarPolygonGroupId,
        actions: slotActions,
      }),
    [
      activePlanarPolygonGroupId,
      areaPolygonGroups,
      planarSurfacePolygonGroups,
      polylineGroups,
      selectedPlanarPolygonGroupId,
      slotActions,
      verticalPolygonGroups,
    ]
  );

  const kind: AnnotationSlotKind =
    isDistanceModeLivePreviewActive ||
    distanceSlotsInputResult.isDistanceMeasurement
      ? "distance"
      : isPointModeLivePreviewActive ||
        (displayMeasurement !== null &&
          !displayMeasurement.auxiliaryLabelAnchor)
      ? "point"
      : labelSlotsInputResult.isLabelLivePreview ||
        labelSlotsInputResult.isLabelMeasurement
      ? "label"
      : planarSlotsInputResult.slotsInput?.kind ?? "unsupported";

  const navigationMeasurements = useMemo(() => {
    if (kind === "label") {
      return measurementsByType("pointLabel").filter(isPointAnnotationEntry);
    }
    if (
      kind === "polyline" ||
      kind === "area" ||
      kind === "planar" ||
      kind === "vertical"
    ) {
      return planarPolygonGroups.map((group) => ({ id: group.id }));
    }
    return getMeasurementsForNavigation();
  }, [
    getMeasurementsForNavigation,
    kind,
    measurementsByType,
    planarPolygonGroups,
  ]);

  const currentNavigationId =
    kind === "polyline" ||
    kind === "area" ||
    kind === "planar" ||
    kind === "vertical"
      ? activePlanarPolygonGroupId ?? selectedPlanarPolygonGroupId
      : currentMeasurement?.id ?? null;

  const handleNavigationSelection = (id: string | null) => {
    if (
      kind === "polyline" ||
      kind === "area" ||
      kind === "planar" ||
      kind === "vertical"
    ) {
      selectPlanarPolygonGroupById(id);
      return;
    }
    selectMeasurementById(id);
  };

  const handleNavigationFlyTo = (id: string) => {
    if (
      kind === "polyline" ||
      kind === "area" ||
      kind === "planar" ||
      kind === "vertical"
    ) {
      const group = planarPolygonGroups.find((entry) => entry.id === id);
      const firstVertexId = group?.vertexPointIds[0] ?? null;
      if (firstVertexId) {
        flyToMeasurementById(firstVertexId);
      }
      return;
    }
    flyToMeasurementById(id);
  };

  const {
    currentIndex,
    totalEntries,
    onFlyToAllMeasurements,
    onPreviousMeasurement,
    onNextMeasurement,
  } = useAnnotationInfoNavigationState({
    navigationMeasurements,
    currentMeasurementId: currentNavigationId,
    onSelectMeasurementById: handleNavigationSelection,
    onFlyToMeasurementById: handleNavigationFlyTo,
    onFlyToAllMeasurements: flyToAllMeasurements,
  });

  const slotsInput: AnnotationSlotsInput = (() => {
    if (kind === "point") return pointSlotsInputResult.slotsInput;
    if (kind === "distance") return distanceSlotsInputResult.slotsInput;
    if (kind === "label") return labelSlotsInputResult.slotsInput;
    if (
      kind === "polyline" ||
      kind === "area" ||
      kind === "planar" ||
      kind === "vertical"
    ) {
      return planarSlotsInputResult.slotsInput ?? { kind: "unsupported" };
    }
    return { kind: "unsupported" };
  })();

  const slots = getAnnotationInfoBoxSlots(slotsInput);

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
