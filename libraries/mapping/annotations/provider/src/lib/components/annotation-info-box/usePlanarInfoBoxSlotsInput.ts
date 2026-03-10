import { useMemo } from "react";

import type { PolygonPolylineAnnotationSlotsInput } from "./getAnnotationInfoBoxSlots";
import { getPlanarAnnotationSlotsInput } from "./getPlanarAnnotationSlotsInput";
import { useAnnotationInfoBoxSlotActions } from "./useAnnotationInfoBoxSlotActions";
import {
  useAnnotationCollection,
  usePlanarAnnotationReadModel,
  useAnnotationSettings,
} from "../../context/AnnotationsProvider";

export type PlanarInfoBoxSlotsInputState = {
  slotsInput: PolygonPolylineAnnotationSlotsInput | null;
};

export const usePlanarInfoBoxSlotsInput = (): PlanarInfoBoxSlotsInputState => {
  const annotations = useAnnotationCollection();
  const settings = useAnnotationSettings();
  const planarReadModel = usePlanarAnnotationReadModel();
  const actions = useAnnotationInfoBoxSlotActions();

  const slotsInput = useMemo(
    () =>
      getPlanarAnnotationSlotsInput({
        polylineMeasurements: planarReadModel.polylineMeasurements,
        groundPolygons: planarReadModel.groundPolygons,
        planarPolygons: planarReadModel.planarPolygons,
        verticalPolygons: planarReadModel.verticalPolygons,
        polylinePaths: planarReadModel.polylinePaths,
        annotations: annotations.items,
        fallbackPolylineSegmentLineMode: settings.polyline.segmentLineMode,
        focusedPlanarMeasurementId: planarReadModel.focusedMeasurementId,
        activePlanarMeasurementId: planarReadModel.activeMeasurementId,
        actions,
      }).slotsInput,
    [
      actions,
      annotations.items,
      planarReadModel.activeMeasurementId,
      planarReadModel.focusedMeasurementId,
      settings.polyline.segmentLineMode,
      planarReadModel.groundPolygons,
      planarReadModel.planarPolygons,
      planarReadModel.polylineMeasurements,
      planarReadModel.polylinePaths,
      planarReadModel.verticalPolygons,
    ]
  );

  return {
    slotsInput,
  };
};
