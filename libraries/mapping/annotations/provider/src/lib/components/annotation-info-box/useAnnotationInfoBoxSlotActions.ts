import { useMemo } from "react";

import type { AnnotationSlotActions } from "./getAnnotationInfoBoxSlots";
import { useAnnotationCollection } from "../../context/AnnotationsProvider";

export const useAnnotationInfoBoxSlotActions = (): AnnotationSlotActions => {
  const annotations = useAnnotationCollection();

  return useMemo<AnnotationSlotActions>(
    () => ({
      updateNameById: annotations.updateNameById,
      removeByIds: annotations.removeByIds,
      toggleLockByIds: annotations.toggleLockByIds,
      toggleVisibilityByIds: annotations.toggleVisibilityByIds,
      flyToById: annotations.flyToById,
      setReferencePointId: annotations.setReferencePointId,
      confirmLabelPlacementById: annotations.confirmLabelPlacementById,
      updatePointLabelAppearanceById:
        annotations.updatePointLabelAppearanceById,
      updateVisualizerOptionsById: annotations.updateVisualizerOptionsById,
    }),
    [annotations]
  );
};
