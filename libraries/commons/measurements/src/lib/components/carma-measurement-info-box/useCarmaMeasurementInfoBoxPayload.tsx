import { useMemo } from "react";

import {
  isPointMeasurementEntry,
  useCesiumMeasurements,
  type MeasurementEntry,
  type MeasurementMode,
} from "@carma-mapping/engines/cesium/measurements";

import { useMeasurements } from "../../context/MeasurementsContext";
import { useMeasurementSelection } from "../../context/MeasurementSelectionContext";
import { InfoBoxMeasurement3DNavigation } from "../infobox/InfoBoxMeasurement3DNavigation";
import type { CarmaMeasurementInfoBoxPayload } from "./CarmaMeasurementInfo.types";
import { getDistanceMeasurementSlotsInput } from "./getDistanceMeasurementSlotsInput";
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
    getMeasurementOrderByType,
    getNextMeasurementOrderByType,
    pointLabelOnCreate,
    updateMeasurementNameById,
    updateMeasurementById,
    deleteMeasurementById,
    toggleMeasurementLockById,
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
  } = useCesiumMeasurements();

  const isPointModeLivePreviewActive =
    measurementMode === "point_measure" && !pointLabelOnCreate;
  const isDistanceModeLivePreviewActive = measurementMode === "point_query";
  const effectiveMeasurementId = activeMeasurementId ?? selectedMeasurementId;

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
  const navigationMeasurements = useMemo(
    () => getMeasurementsForNavigation(),
    [getMeasurementsForNavigation]
  );

  const slotActions = useMemo<MeasurementSlotActions>(
    () => ({
      updateMeasurementNameById,
      updateMeasurementById,
      deleteMeasurementById,
      toggleMeasurementLockById,
      flyToMeasurementById,
      setReferencePoint,
    }),
    [
      deleteMeasurementById,
      flyToMeasurementById,
      setReferencePoint,
      toggleMeasurementLockById,
      updateMeasurementById,
      updateMeasurementNameById,
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

  const kind: MeasurementSlotKind =
    isDistanceModeLivePreviewActive ||
    distanceSlotsInputResult.isDistanceMeasurement
      ? "distance"
      : isPointModeLivePreviewActive ||
        (displayMeasurement !== null &&
          !displayMeasurement.auxiliaryLabelAnchor)
      ? "point"
      : "unsupported";

  const {
    currentIndex,
    totalEntries,
    onFlyToAllMeasurements,
    onPreviousMeasurement,
    onNextMeasurement,
  } = useCarmaMeasurementInfoNavigationState({
    navigationMeasurements,
    currentMeasurementId: currentMeasurement?.id ?? null,
    onSelectMeasurementById: selectMeasurementById,
    onFlyToMeasurementById: flyToMeasurementById,
    onFlyToAllMeasurements: flyToAllMeasurements,
  });

  const slotsInput: MeasurementSlotsInput =
    kind === "point"
      ? pointSlotsInputResult.slotsInput
      : kind === "distance"
      ? distanceSlotsInputResult.slotsInput
      : {
          kind: "unsupported",
        };

  const slots = getMeasurementInfoBoxSlots(slotsInput);

  return {
    pixelWidth,
    headingColor: "rgba(59, 130, 246, 0.7)",
    headingTitle: slots.headingTitle,
    collapsible: slots.collapsible,
    footer: (
      <InfoBoxMeasurement3DNavigation
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
