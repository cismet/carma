import {
  loadAnnotationsRuntimeGeoJsonFeatureCollection,
  publishSharedAnnotations,
} from "@carma-mapping/annotations/runtime";

import { GEOPORTAL_ANNOTATIONS_STORAGE_KEY } from "../config/app.config";
import { IS_MEASUREMENT3D_AVAILABLE } from "../config/measurement3d-availability";

/** The stored measurements as the section of a shared configuration; none where the 3D measurement is not available. */
export const readSharedMeasurementsConfig = ():
  | { measurements3d: unknown }
  | undefined => {
  if (!IS_MEASUREMENT3D_AVAILABLE) {
    return undefined;
  }
  const measurements3d = loadAnnotationsRuntimeGeoJsonFeatureCollection(
    GEOPORTAL_ANNOTATIONS_STORAGE_KEY
  );
  return measurements3d ? { measurements3d } : undefined;
};

/** Hands the measurements of a loaded configuration to the annotation providers; whether a set was taken. */
export const publishSharedMeasurements = (measurements3d: unknown): boolean =>
  IS_MEASUREMENT3D_AVAILABLE &&
  !!measurements3d &&
  publishSharedAnnotations(measurements3d);
