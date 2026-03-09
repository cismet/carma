import { useMemo } from "react";

import type { PolygonPolylineAnnotationSlotsInput } from "./getAnnotationInfoBoxSlots";
import { getPlanarAnnotationSlotsInput } from "./getPlanarAnnotationSlotsInput";
import { useAnnotationInfoBoxSlotActions } from "./useAnnotationInfoBoxSlotActions";
import { useAnnotationsAdapter } from "../../context/AnnotationsAdapterProvider";

export type PlanarInfoBoxSlotsInputState = {
  slotsInput: PolygonPolylineAnnotationSlotsInput | null;
};

export const usePlanarInfoBoxSlotsInput = (): PlanarInfoBoxSlotsInputState => {
  const {
    annotations,
    selectedPlanarPolygonGroupId,
    activePlanarPolygonGroupId,
    polylineGroups,
    areaPolygonGroups,
    planarSurfacePolygonGroups,
    verticalPolygonGroups,
    polylines,
    polylineSegmentLineMode,
  } = useAnnotationsAdapter();
  const actions = useAnnotationInfoBoxSlotActions();

  const slotsInput = useMemo(
    () =>
      getPlanarAnnotationSlotsInput({
        polylineGroups,
        areaPolygonGroups,
        planarSurfacePolygonGroups,
        verticalPolygonGroups,
        polylines,
        annotations,
        fallbackPolylineSegmentLineMode: polylineSegmentLineMode,
        selectedPlanarPolygonGroupId,
        activePlanarPolygonGroupId,
        actions,
      }).slotsInput,
    [
      actions,
      activePlanarPolygonGroupId,
      areaPolygonGroups,
      annotations,
      planarSurfacePolygonGroups,
      polylines,
      polylineGroups,
      polylineSegmentLineMode,
      selectedPlanarPolygonGroupId,
      verticalPolygonGroups,
    ]
  );

  return {
    slotsInput,
  };
};
