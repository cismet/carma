import { useCallback, useMemo } from "react";

import {
  ANNOTATION_TYPE_LABEL,
  buildAnnotationGeoJsonFeatureCollection,
  isPointAnnotationEntry,
  type AnnotationCollection,
  type NodeChainAnnotation,
} from "@carma-mapping/annotations/core";
import type { AnnotationSlotActions } from "./getAnnotationInfoBoxSlots";
import {
  useCollection,
  useAnnotationsStore,
  useStoreSelector,
} from "../../store";

const sanitizeFileNameSegment = (value: string | undefined | null): string => {
  const normalized = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.length > 0 ? normalized : "annotation";
};

const resolveExportDescriptor = ({
  id,
  annotations,
  nodeChainAnnotations,
}: {
  id: string;
  annotations: AnnotationCollection;
  nodeChainAnnotations: readonly NodeChainAnnotation[];
}) => {
  const nodeChainAnnotation =
    nodeChainAnnotations.find((annotation) => annotation.id === id) ?? null;

  if (nodeChainAnnotation) {
    return {
      kind: nodeChainAnnotation.type,
      name: nodeChainAnnotation.name,
    };
  }

  const pointAnnotation =
    annotations.find(
      (annotation) => annotation.id === id && isPointAnnotationEntry(annotation)
    ) ?? null;

  if (!pointAnnotation) {
    return null;
  }

  return {
    kind: pointAnnotation.auxiliaryLabelAnchor
      ? ANNOTATION_TYPE_LABEL
      : pointAnnotation.type,
    name: pointAnnotation.name,
  };
};

const downloadGeoJsonFile = (
  fileName: string,
  featureCollection: ReturnType<typeof buildAnnotationGeoJsonFeatureCollection>
) => {
  if (!featureCollection) {
    return;
  }

  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const blob = new Blob([JSON.stringify(featureCollection, null, 2)], {
    type: "application/geo+json;charset=utf-8",
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  window.setTimeout(() => {
    window.URL.revokeObjectURL(url);
  }, 0);
};

export const useSlotActions = (): AnnotationSlotActions => {
  const annotations = useCollection();
  const annotationsStore = useAnnotationsStore("useSlotActions");
  const distanceRelations = useStoreSelector(
    annotationsStore,
    (state) => state.distanceRelations
  );
  const nodeChainAnnotations = useStoreSelector(
    annotationsStore,
    (state) => state.nodeChainAnnotations
  );

  const exportGeoJsonById = useCallback(
    (id: string) => {
      const featureCollection = buildAnnotationGeoJsonFeatureCollection({
        annotationId: id,
        annotations: annotations.items,
        nodeChainAnnotations,
        distanceRelations,
      });

      if (!featureCollection) {
        return;
      }

      const exportDescriptor = resolveExportDescriptor({
        id,
        annotations: annotations.items,
        nodeChainAnnotations,
      });
      const kindSegment = sanitizeFileNameSegment(
        exportDescriptor?.kind ?? null
      );
      const nameSegment = sanitizeFileNameSegment(exportDescriptor?.name ?? id);

      downloadGeoJsonFile(
        `annotation-${kindSegment}-${nameSegment}.geojson`,
        featureCollection
      );
    },
    [annotations.items, distanceRelations, nodeChainAnnotations]
  );

  return useMemo<AnnotationSlotActions>(
    () => ({
      updateNameById: annotations.updateNameById,
      removeByIds: annotations.removeByIds,
      toggleLockByIds: annotations.toggleLockByIds,
      toggleVisibilityByIds: annotations.toggleVisibilityByIds,
      flyToById: annotations.flyToById,
      exportGeoJsonById,
      setReferencePointId: annotations.setReferencePointId,
      confirmLabelPlacementById: annotations.confirmLabelPlacementById,
      updatePointLabelAppearanceById:
        annotations.updatePointLabelAppearanceById,
      updateVisualizerOptionsById: annotations.updateVisualizerOptionsById,
    }),
    [annotations, exportGeoJsonById]
  );
};
