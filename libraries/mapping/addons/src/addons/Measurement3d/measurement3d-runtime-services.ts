import { useSyncExternalStore } from "react";
import type { useAnnotationsRuntime } from "@carma-mapping/annotations/runtime";

/**
 * The part of the annotations runtime the host needs outside the addon's
 * provider: the layer-bar row (show all, save, delete all), the save panel
 * under it and the sync of saved measurement collections all live in the
 * host's tree, so the runtime publishes these services while it is mounted.
 */
export type Measurement3dRuntimeServices = Pick<
  ReturnType<typeof useAnnotationsRuntime>,
  | "annotationEntries"
  | "nodes"
  | "engine"
  | "setSelectedAnnotationId"
  | "appendAnnotationsRuntimePersistenceState"
  | "removeExternalAnnotationsByCollection"
  | "buildAllAnnotationsGeoJson"
  | "removeAnnotationsByIds"
  | "flyToAllAnnotations"
  | "exportAllAnnotationsGeoJson"
>;

/** The save panel of the row, registered by the host under this interaction id. */
export const MEASUREMENT3D_SAVE_INTERACTION_ID = "measurement3d-save";

let current: Measurement3dRuntimeServices | null = null;
const listeners = new Set<() => void>();

export const setMeasurement3dRuntimeServices = (
  next: Measurement3dRuntimeServices | null
) => {
  current = next;
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Null while no measurement runtime is mounted. */
export const useMeasurement3dRuntimeServices = () =>
  useSyncExternalStore(subscribe, () => current, () => null);
