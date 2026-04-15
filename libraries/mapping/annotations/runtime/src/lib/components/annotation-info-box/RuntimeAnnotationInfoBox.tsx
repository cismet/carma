import { useMemo } from "react";
import {
  AnnotationInfoBoxContainer,
  resolveAnnotationInfoBoxVisualOptions,
} from "@carma-mapping/annotations/ui";

import { useAnnotationsRuntime } from "../../context/AnnotationsProvider";
import type { RuntimeAnnotationInfoBoxLayoutProps } from "./annotation-info-box.types";

export const RuntimeAnnotationInfoBox = ({
  pixelWidth,
  useControlLayout,
  controlPosition,
  controlOrder,
  style,
  visualOptions,
}: RuntimeAnnotationInfoBoxLayoutProps) => {
  const {
    registry,
    annotationEntries,
    formatOptions,
    nodes,
    selectedAnnotationId,
    setSelectedAnnotationId,
    focusAnnotationId,
    flyToAllAnnotations,
    removeAnnotationById,
    exportAnnotationGeoJson,
    toggleAnnotationVisibility,
    toggleAnnotationLocked,
    elevationReferenceAnnotationId,
    setElevationReferenceAnnotationId,
    updateAnnotationDisplayName,
    updateAnnotationShortLabel,
  } = useAnnotationsRuntime();
  const resolvedInfoBoxVisualOptions = useMemo(
    () => resolveAnnotationInfoBoxVisualOptions(visualOptions),
    [visualOptions]
  );

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
      focusAnnotationId,
      flyToAllAnnotations,
      removeAnnotationById,
      exportAnnotationGeoJson,
      toggleAnnotationVisibility,
      toggleAnnotationLocked,
      elevationReferenceAnnotationId,
      setElevationReferenceAnnotationId,
      updateAnnotationDisplayName,
      updateAnnotationShortLabel,
      formatOptions,
      infoBoxVisualOptions: resolvedInfoBoxVisualOptions,
    });
  }, [
    annotationEntries,
    flyToAllAnnotations,
    formatOptions,
    focusAnnotationId,
    exportAnnotationGeoJson,
    resolvedInfoBoxVisualOptions,
    nodes,
    removeAnnotationById,
    registry,
    selectedAnnotationId,
    setSelectedAnnotationId,
    elevationReferenceAnnotationId,
    setElevationReferenceAnnotationId,
    toggleAnnotationLocked,
    toggleAnnotationVisibility,
    updateAnnotationDisplayName,
    updateAnnotationShortLabel,
  ]);

  if (!slots) {
    return null;
  }

  return (
    <AnnotationInfoBoxContainer
      pixelWidth={pixelWidth}
      useControlLayout={useControlLayout}
      controlPosition={controlPosition}
      controlOrder={controlOrder}
      style={style}
      slots={slots}
      visualOptions={resolvedInfoBoxVisualOptions}
    />
  );
};
