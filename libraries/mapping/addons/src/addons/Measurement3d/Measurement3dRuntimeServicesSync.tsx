import { useEffect } from "react";
import { useAnnotationsRuntime } from "@carma-mapping/annotations/runtime";
import { setMeasurement3dRuntimeServices } from "./measurement3d-host";

/** Publishes the runtime services the host uses outside this provider, while it is mounted. */
export const Measurement3dRuntimeServicesSync = () => {
  const {
    annotationEntries,
    nodes,
    engine,
    setSelectedAnnotationId,
    appendAnnotationsRuntimePersistenceState,
    removeExternalAnnotationsByCollection,
    buildAllAnnotationsGeoJson,
    removeAnnotationsByIds,
    flyToAllAnnotations,
    exportAllAnnotationsGeoJson,
  } = useAnnotationsRuntime();
  useEffect(() => {
    setMeasurement3dRuntimeServices({
      annotationEntries,
      nodes,
      engine,
      setSelectedAnnotationId,
      appendAnnotationsRuntimePersistenceState,
      removeExternalAnnotationsByCollection,
      buildAllAnnotationsGeoJson,
      removeAnnotationsByIds,
      flyToAllAnnotations,
      exportAllAnnotationsGeoJson,
    });
  }, [
    annotationEntries,
    appendAnnotationsRuntimePersistenceState,
    buildAllAnnotationsGeoJson,
    engine,
    exportAllAnnotationsGeoJson,
    flyToAllAnnotations,
    nodes,
    removeAnnotationsByIds,
    removeExternalAnnotationsByCollection,
    setSelectedAnnotationId,
  ]);
  useEffect(() => () => setMeasurement3dRuntimeServices(null), []);
  return null;
};
