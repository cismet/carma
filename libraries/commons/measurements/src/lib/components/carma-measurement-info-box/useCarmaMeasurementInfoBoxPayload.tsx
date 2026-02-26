import { useMemo } from "react";

import {
  isPointMeasurementEntry,
  useCesiumMeasurements,
  type MeasurementEntry,
  type MeasurementMode,
} from "@carma-mapping/engines/cesium/measurements";

import { useMeasurements } from "../../context/MeasurementsContext";
import { useMeasurementSelection } from "../../context/MeasurementSelectionContext";
import { CarmaMeasurementInfoBoxNavigation } from "./CarmaMeasurementInfoBoxNavigation";
import type { CarmaMeasurementInfoBoxPayload } from "./CarmaMeasurementInfo.types";
import { getDistanceMeasurementSlotsInput } from "./getDistanceMeasurementSlotsInput";
import { getLabelMeasurementSlotsInput } from "./getLabelMeasurementSlotsInput";
import { getPlanarMeasurementSlotsInput } from "./getPlanarMeasurementSlotsInput";
import {
  getMeasurementInfoBoxSlots,
  type MeasurementSlotActions,
  type MeasurementSlotKind,
  type MeasurementSlotsInput,
} from "./getCarmaMeasurementInfoBoxSlots";
import { getPointMeasurementSlotsInput } from "./getPointMeasurementSlotsInput";
import { useCarmaMeasurementInfoNavigationState } from "./useCarmaMeasurementInfoNavigationState";

type UseCarmaMeasurementInfoBoxPayloadParams = {
  pixelWidth: number;
};

export const useCarmaMeasurementInfoBoxPayload = ({
  pixelWidth,
}: UseCarmaMeasurementInfoBoxPayloadParams): CarmaMeasurementInfoBoxPayload => {
  const {
    measurementMode,
    measurements,
    liveMeasurementCandidate,
    getMeasurementsForNavigation,
    measurementsByType,
    getMeasurementOrderByType,
    getNextMeasurementOrderByType,
    pointLabelOnCreate,
    updateMeasurementNameById,
    updateMeasurementById,
    deleteMeasurementById,
    toggleMeasurementLockById,
    updatePointLabelAppearanceById,
    clearMeasurementsByIds,
  } = useMeasurements<MeasurementMode, MeasurementEntry>();
  const { selectedMeasurementId, selectMeasurementById } =
    useMeasurementSelection();
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
  } = useCesiumMeasurements();

  const isPointModeLivePreviewActive =
    measurementMode === "point_measure" && !pointLabelOnCreate;
  const isDistanceModeLivePreviewActive = measurementMode === "point_query";
  const isLivePreviewMode =
    isPointModeLivePreviewActive || isDistanceModeLivePreviewActive;
  const effectiveMeasurementId = isLivePreviewMode
    ? activeMeasurementId ?? selectedMeasurementId
    : selectedMeasurementId ?? activeMeasurementId;

  const pointMeasurements = useMemo(
    () => measurements.filter(isPointMeasurementEntry),
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
      isPointMeasurementEntry(liveMeasurementCandidate)
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
  const slotActions = useMemo<MeasurementSlotActions>(
    () => ({
      updateMeasurementNameById,
      updateMeasurementById,
      deleteMeasurementById,
      toggleMeasurementLockById,
      flyToMeasurementById,
      setReferencePoint,
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
      toggleMeasurementLockById,
      updatePlanarPolygonNameById,
      updateMeasurementById,
      updateMeasurementNameById,
      updatePointLabelAppearanceById,
    ]
  );

  const pointSlotsInputResult = useMemo(
    () =>
      getPointMeasurementSlotsInput({
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
      getDistanceMeasurementSlotsInput({
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
      getLabelMeasurementSlotsInput({
        measurement: displayMeasurement,
        labelMeasurements: measurementsByType("pointLabel").filter(
          isPointMeasurementEntry
        ),
        actions: slotActions,
      }),
    [displayMeasurement, measurementsByType, slotActions]
  );

  const planarSlotsInputResult = useMemo(
    () =>
      getPlanarMeasurementSlotsInput({
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

  const kind: MeasurementSlotKind =
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
      return measurementsByType("pointLabel").filter(isPointMeasurementEntry);
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
  } = useCarmaMeasurementInfoNavigationState({
    navigationMeasurements,
    currentMeasurementId: currentNavigationId,
    onSelectMeasurementById: handleNavigationSelection,
    onFlyToMeasurementById: handleNavigationFlyTo,
    onFlyToAllMeasurements: flyToAllMeasurements,
  });

  const slotsInput: MeasurementSlotsInput = (() => {
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

  const slots = getMeasurementInfoBoxSlots(slotsInput);

  return {
    pixelWidth,
    headingColor: "rgba(59, 130, 246, 0.7)",
    headingTitle: slots.headingTitle,
    collapsible: slots.collapsible,
    footer: (
      <CarmaMeasurementInfoBoxNavigation
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
