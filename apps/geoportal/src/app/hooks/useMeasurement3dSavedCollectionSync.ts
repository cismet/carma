import { useMeasurement3dRuntimeServices } from "@carma-mapping/addons";

import {
  useSavedAnnotationCollectionSync,
  type SavedAnnotationCollectionSyncServices,
} from "./use-saved-annotation-collection-sync";

const NO_RUNTIME: SavedAnnotationCollectionSyncServices = {
  appendAnnotationsRuntimePersistenceState: () => [],
  removeExternalAnnotationsByCollection: () => undefined,
};

/** Saved measurement collections join the 3D measurement runtime of the MapLibre view. */
export const useMeasurement3dSavedCollectionSync = () => {
  const services = useMeasurement3dRuntimeServices();
  useSavedAnnotationCollectionSync(services ?? NO_RUNTIME);
};
