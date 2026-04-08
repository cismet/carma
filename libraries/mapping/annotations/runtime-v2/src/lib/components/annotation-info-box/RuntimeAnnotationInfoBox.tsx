import { useMemo } from "react";

import { useAnnotationsRuntime } from "../../context/AnnotationsProvider";
import { RuntimeAnnotationInfoBoxContainer } from "./RuntimeAnnotationInfoBoxContainer";
import type { RuntimeAnnotationInfoBoxLayoutProps } from "./annotationInfoBox.types";

export const RuntimeAnnotationInfoBox = ({
  pixelWidth,
  useControlLayout,
  controlPosition,
  controlOrder,
  style,
}: RuntimeAnnotationInfoBoxLayoutProps) => {
  const {
    registry,
    annotationEntries,
    nodes,
    selectedAnnotationId,
    setSelectedAnnotationId,
  } = useAnnotationsRuntime();

  const slots = useMemo(() => {
    if (!selectedAnnotationId) {
      return null;
    }

    const selectedAnnotation =
      annotationEntries.find(
        (annotation) => annotation.id === selectedAnnotationId
      ) ?? null;

    if (!selectedAnnotation) {
      return null;
    }

    const plugin = registry.getPlugin(selectedAnnotation.toolType);
    if (!plugin?.infoBox?.getSlots) {
      return null;
    }

    return plugin.infoBox.getSlots({
      annotation: selectedAnnotation,
      annotationEntries,
      nodes,
      selectedAnnotationId,
      setSelectedAnnotationId,
    });
  }, [
    annotationEntries,
    nodes,
    registry,
    selectedAnnotationId,
    setSelectedAnnotationId,
  ]);

  if (!slots) {
    return null;
  }

  return (
    <RuntimeAnnotationInfoBoxContainer
      pixelWidth={pixelWidth}
      useControlLayout={useControlLayout}
      controlPosition={controlPosition}
      controlOrder={controlOrder}
      style={style}
      slots={slots}
    />
  );
};
