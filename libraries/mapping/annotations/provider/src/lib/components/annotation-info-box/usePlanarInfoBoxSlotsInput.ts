import { useMemo } from "react";

import { useCesiumAnnotations } from "@carma-mapping/annotations/cesium";
import type { PolygonPolylineAnnotationSlotsInput } from "./getAnnotationInfoBoxSlots";
import { getPlanarAnnotationSlotsInput } from "./getPlanarAnnotationSlotsInput";
import { useAnnotationInfoBoxSlotActions } from "./useAnnotationInfoBoxSlotActions";

export type PlanarInfoBoxSlotsInputState = {
  slotsInput: PolygonPolylineAnnotationSlotsInput | null;
};

export const usePlanarInfoBoxSlotsInput = (): PlanarInfoBoxSlotsInputState => {
  const {
    selectedPlanarPolygonGroupId,
    activePlanarPolygonGroupId,
    polylineGroups,
    areaPolygonGroups,
    planarSurfacePolygonGroups,
    verticalPolygonGroups,
    polylines,
    polylineSegmentLineMode,
  } = useCesiumAnnotations();
  const actions = useAnnotationInfoBoxSlotActions();

  const slotsInput = useMemo(
    () =>
      getPlanarAnnotationSlotsInput({
        polylineGroups,
        areaPolygonGroups,
        planarSurfacePolygonGroups,
        verticalPolygonGroups,
        polylines,
        fallbackPolylineSegmentLineMode: polylineSegmentLineMode,
        selectedPlanarPolygonGroupId,
        activePlanarPolygonGroupId,
        actions,
      }).slotsInput,
    [
      actions,
      activePlanarPolygonGroupId,
      areaPolygonGroups,
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
