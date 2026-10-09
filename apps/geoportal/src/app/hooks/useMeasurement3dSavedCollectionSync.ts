import { useEffect, useRef } from "react";
import { useSelector } from "react-redux";

import { useMeasurement3dRuntimeServices } from "@carma-mapping/addons";

import { resolveVisibleSavedAnnotationCollectionIds } from "../components/annotations/saved-annotation-collection-registration";
import { getLayers } from "../store/slices/mapping";
import {
  useSavedAnnotationCollectionSync,
  type SavedAnnotationCollectionSyncServices,
} from "./use-saved-annotation-collection-sync";

const NO_RUNTIME: SavedAnnotationCollectionSyncServices = {
  appendAnnotationsRuntimePersistenceState: () => [],
  removeExternalAnnotationsByCollection: () => undefined,
};

/**
 * Saved measurement sets join the 3D measurement runtime of the MapLibre
 * view, and leave it when their row is hidden or closed: a set saved in this
 * view goes into the runtime directly, so the registration alone would never
 * take it out again.
 */
export const useMeasurement3dSavedCollectionSync = () => {
  const services = useMeasurement3dRuntimeServices();
  const layers = useSelector(getLayers);
  useSavedAnnotationCollectionSync(services ?? NO_RUNTIME);
  // Rows seen visible: only a row that was there and is now hidden or gone
  // takes its set out. A set saved a moment ago may reach the runtime before
  // its row reaches the store, and must stay.
  const seenVisibleRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const visibleCollectionIds =
      resolveVisibleSavedAnnotationCollectionIds(layers);
    const left = [...seenVisibleRef.current].filter(
      (collectionId) => !visibleCollectionIds.has(collectionId)
    );
    seenVisibleRef.current = new Set(visibleCollectionIds);
    if (!services) return;
    for (const collectionId of left) {
      services.removeExternalAnnotationsByCollection({
        type: "saved-measurement",
        id: collectionId,
      });
    }
  }, [layers, services]);
};
