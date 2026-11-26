import { useEffect } from "react";
import type { Feature } from "geojson";

import {
  loadAnnotationsRuntimeGeoJsonFeatureCollection,
  publishSharedAnnotations,
} from "@carma-mapping/annotations/runtime";
import { confirmSharedAnnotationsConflicts } from "@carma-mapping/annotations/ui";
import { useMeasurements } from "@carma-mapping/measurements";

import { GEOPORTAL_ANNOTATIONS_STORAGE_KEY } from "../config/app.config";
import { IS_MEASUREMENT3D_AVAILABLE } from "../config/measurement3d-availability";

/**
 * The measurements as the sections of a shared configuration: the 2D ones
 * given (MapLibre, from the measurements context) and the stored 3D ones where
 * the 3D measurement is available. Empty sections are left out.
 */
export const readSharedMeasurementsConfig = (
  measurements2d: readonly Feature[]
): { measurements2d?: readonly Feature[]; measurements3d?: unknown } => {
  const measurements3d = IS_MEASUREMENT3D_AVAILABLE
    ? loadAnnotationsRuntimeGeoJsonFeatureCollection(
        GEOPORTAL_ANNOTATIONS_STORAGE_KEY
      )
    : null;
  return {
    ...(measurements2d.length > 0 ? { measurements2d } : {}),
    ...(measurements3d ? { measurements3d } : {}),
  };
};

/** The share config of the current measurements, for `extraConfig`. */
export const useSharedMeasurementsConfig = () => {
  const { features } = useMeasurements();
  return () => readSharedMeasurementsConfig(features);
};

/** Hands the measurements of a loaded configuration to the annotation providers; whether a set was taken. */
export const publishSharedMeasurements = (measurements3d: unknown): boolean =>
  IS_MEASUREMENT3D_AVAILABLE &&
  !!measurements3d &&
  publishSharedAnnotations(measurements3d);

const isMeasurementFeature = (value: unknown): value is Feature => {
  const feature = value as Feature | null;
  return (
    feature?.type === "Feature" &&
    feature.id != null &&
    typeof feature.geometry === "object" &&
    feature.geometry !== null
  );
};

/** a 2D set of a loaded configuration, until the measurements provider takes it */
let pending2d: Feature[] | null = null;
const pending2dListeners = new Set<() => void>();

/** Keeps the 2D measurements of a loaded configuration for the provider; whether a set was taken. */
export const publishSharedMeasurements2d = (measurements2d: unknown): boolean => {
  // the config comes from the config service: keep only real features
  const features = Array.isArray(measurements2d)
    ? measurements2d.filter(isMeasurementFeature)
    : [];
  if (features.length === 0) {
    return false;
  }
  pending2d = features;
  pending2dListeners.forEach((listener) => listener());
  return true;
};

const takePending2d = (): Feature[] | null => {
  const features = pending2d;
  pending2d = null;
  return features;
};

/**
 * Takes a shared 2D set into the MapLibre measurements: new ones join, equal
 * ones are skipped, changed ones ask like the 3D ones. The draw mode stays off.
 * Mount inside the measurements provider.
 */
export const useSharedMeasurements2dImport = () => {
  const { importFeatures } = useMeasurements();
  useEffect(() => {
    const take = () => {
      const features = takePending2d();
      if (features) {
        void importFeatures(features, async (changed) =>
          (await confirmSharedAnnotationsConflicts(changed)) === "update"
        );
      }
    };
    take();
    pending2dListeners.add(take);
    return () => {
      pending2dListeners.delete(take);
    };
  }, [importFeatures]);
};
