import { useMemo } from "react";

import { useAnnotationsRuntime } from "../../context/AnnotationsProvider";
import { RuntimeAnnotationInfoBoxContainer } from "./RuntimeAnnotationInfoBoxContainer";
type RuntimeAnnotationInfoBoxProps = {
  pixelWidth?: number;
};

export const RuntimeAnnotationInfoBox = ({
  pixelWidth,
}: RuntimeAnnotationInfoBoxProps) => {
  const { registry, annotationEntries, nodes, selectedAnnotationId } =
    useAnnotationsRuntime();

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
    });
  }, [annotationEntries, nodes, registry, selectedAnnotationId]);

  if (!slots) {
    return null;
  }

  return (
    <RuntimeAnnotationInfoBoxContainer pixelWidth={pixelWidth} slots={slots} />
  );
};
