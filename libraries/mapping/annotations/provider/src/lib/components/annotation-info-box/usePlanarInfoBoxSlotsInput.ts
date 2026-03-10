import { useMemo } from "react";

import type { PolygonPolylineAnnotationSlotsInput } from "./getAnnotationInfoBoxSlots";
import { getPlanarAnnotationSlotsInput } from "./getPlanarAnnotationSlotsInput";
import { useAnnotationInfoBoxSlotActions } from "./useAnnotationInfoBoxSlotActions";
import {
  useAnnotationCollection,
  useAnnotationSettings,
  useAnnotationViewState,
} from "../../context/AnnotationsProvider";

export type PlanarInfoBoxSlotsInputState = {
  slotsInput: PolygonPolylineAnnotationSlotsInput | null;
};

export const usePlanarInfoBoxSlotsInput = (): PlanarInfoBoxSlotsInputState => {
  const annotations = useAnnotationCollection();
  const settings = useAnnotationSettings();
  const view = useAnnotationViewState();
  const actions = useAnnotationInfoBoxSlotActions();

  const slotsInput = useMemo(
    () =>
      getPlanarAnnotationSlotsInput({
        polylineMeasurements: view.polylineMeasurements,
        groundPolygons: view.groundPolygons,
        planarPolygons: view.planarPolygons,
        verticalPolygons: view.verticalPolygons,
        polylinePaths: view.polylinePaths,
        annotations: annotations.items,
        fallbackPolylineSegmentLineMode: settings.polyline.segmentLineMode,
        focusedPlanarMeasurementId: view.focusedPlanarMeasurementId,
        activePlanarMeasurementId: view.activePlanarMeasurementId,
        actions,
      }).slotsInput,
    [
      actions,
      annotations.items,
      view.activePlanarMeasurementId,
      view.focusedPlanarMeasurementId,
      settings.polyline.segmentLineMode,
      view.groundPolygons,
      view.planarPolygons,
      view.polylineMeasurements,
      view.polylinePaths,
      view.verticalPolygons,
    ]
  );

  return {
    slotsInput,
  };
};
