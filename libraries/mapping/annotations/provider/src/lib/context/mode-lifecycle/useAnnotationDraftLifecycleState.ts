import { useCallback, useState } from "react";

import { useMeasurementDraftSessionState } from "./useMeasurementDraftSessionState";

export const useAnnotationDraftLifecycleState = () => {
  const measurementDraftState = useMeasurementDraftSessionState();
  const [activePlanarMeasurementId, setActivePlanarMeasurementId] = useState<
    string | null
  >(null);
  const [
    pendingLabelPlacementAnnotationId,
    setPendingLabelPlacementAnnotationId,
  ] = useState<string | null>(null);
  const [openChainPointId, setOpenChainPointId] = useState<string | null>(null);
  const [
    pendingPolylineRingPromotionPointId,
    setPendingPolylineRingPromotionPointId,
  ] = useState<string | null>(null);

  const clearPendingLabelPlacementAnnotation = useCallback(() => {
    setPendingLabelPlacementAnnotationId((previousId) =>
      previousId === null ? previousId : null
    );
  }, []);

  const clearActivePlanarMeasurement = useCallback(() => {
    setActivePlanarMeasurementId((previousId) =>
      previousId === null ? previousId : null
    );
  }, []);

  const clearOpenChainPoint = useCallback(() => {
    setOpenChainPointId((previousId) =>
      previousId === null ? previousId : null
    );
  }, []);

  const clearPendingPolylineRingPromotion = useCallback(() => {
    setPendingPolylineRingPromotionPointId((previousId) =>
      previousId === null ? previousId : null
    );
  }, []);

  const clearTransientDraftState = useCallback(() => {
    clearActivePlanarMeasurement();
    clearOpenChainPoint();
    clearPendingLabelPlacementAnnotation();
    clearPendingPolylineRingPromotion();
  }, [
    clearActivePlanarMeasurement,
    clearOpenChainPoint,
    clearPendingLabelPlacementAnnotation,
    clearPendingPolylineRingPromotion,
  ]);

  const clearDraftLifecycleState = useCallback(() => {
    measurementDraftState.clearMeasurementDraftSession();
    clearTransientDraftState();
  }, [
    clearTransientDraftState,
    measurementDraftState.clearMeasurementDraftSession,
  ]);

  return {
    ...measurementDraftState,
    activePlanarMeasurementId,
    setActivePlanarMeasurementId,
    clearActivePlanarMeasurement,
    pendingLabelPlacementAnnotationId,
    setPendingLabelPlacementAnnotationId,
    clearPendingLabelPlacementAnnotation,
    openChainPointId,
    setOpenChainPointId,
    clearOpenChainPoint,
    pendingPolylineRingPromotionPointId,
    setPendingPolylineRingPromotionPointId,
    clearPendingPolylineRingPromotion,
    clearTransientDraftState,
    clearDraftLifecycleState,
  };
};

export type AnnotationDraftLifecycleState = ReturnType<
  typeof useAnnotationDraftLifecycleState
>;
