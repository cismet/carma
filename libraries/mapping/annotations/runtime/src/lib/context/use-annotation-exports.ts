import { useCallback } from "react";

import {
  buildAnnotationsRuntimeGeoJsonFeatureCollection,
  buildAnnotationsRuntimePersistenceState,
  type AnnotationsRuntimeGeoJsonFeatureCollection,
  type AnnotationsStore,
} from "../store";
import {
  buildStoredAnnotationGeoJsonFeatureCollection,
  downloadAnnotationGeoJsonFile,
  resolveAnnotationExportDescriptor,
  sanitizeAnnotationExportFileSegment,
} from "../utils/annotation-geo-json-export";
import { resolveAnnotationEntryCoordinates } from "../utils/annotation-coordinates";
import { findAnnotationEntryInStore } from "./annotation-entry-lookup";

export const useAnnotationExports = (annotationsStore: AnnotationsStore) => {
  const exportAnnotationGeoJson = useCallback(
    (annotationId: string) => {
      const annotation = findAnnotationEntryInStore(
        annotationsStore,
        annotationId
      );
      if (!annotation) {
        return;
      }

      const runtimeState = annotationsStore.getState();
      const featureCollection = buildStoredAnnotationGeoJsonFeatureCollection({
        annotation,
        coordinates: resolveAnnotationEntryCoordinates({
          annotationEntries: runtimeState.annotationEntries,
          nodes: runtimeState.nodes,
          annotationId,
        }),
      });
      if (!featureCollection) {
        return;
      }

      const { kind, name } = resolveAnnotationExportDescriptor(annotation);
      downloadAnnotationGeoJsonFile(
        `annotation-${sanitizeAnnotationExportFileSegment(
          kind
        )}-${sanitizeAnnotationExportFileSegment(name)}.geojson`,
        featureCollection
      );
    },
    [annotationsStore]
  );

  const buildAllAnnotationsGeoJson = useCallback(
    (): AnnotationsRuntimeGeoJsonFeatureCollection =>
      buildAnnotationsRuntimeGeoJsonFeatureCollection(
        buildAnnotationsRuntimePersistenceState(annotationsStore.getState())
      ),
    [annotationsStore]
  );

  const exportAllAnnotationsGeoJson = useCallback(() => {
    downloadAnnotationGeoJsonFile(
      "annotations.geojson",
      buildAllAnnotationsGeoJson()
    );
  }, [buildAllAnnotationsGeoJson]);

  return {
    exportAnnotationGeoJson,
    buildAllAnnotationsGeoJson,
    exportAllAnnotationsGeoJson,
  };
};
