import { useEffect, useMemo, useRef } from "react";
import { useSelector } from "react-redux";

import {
  ADHOC_LAYER_SOURCES,
  useAdhocFeatureDisplay,
} from "@carma-appframeworks/portals";
import {
  buildExternalAnnotationsAppendOptions,
  resolveAnnotationsRuntimePersistenceFromGeoJson,
  type useAnnotationsRuntime,
} from "@carma-mapping/annotations/runtime";

import { getLayers } from "../store/slices/mapping";
import {
  resolveActiveSavedAnnotationCollectionIds,
  resolveVisibleSavedAnnotationCollectionIds,
  shouldRegisterSavedAnnotationCollection,
} from "../components/annotations/saved-annotation-collection-registration";

export type SavedAnnotationCollectionSyncServices = Pick<
  ReturnType<typeof useAnnotationsRuntime>,
  "appendAnnotationsRuntimePersistenceState" | "removeExternalAnnotationsByCollection"
>;

/**
 * Registers the saved measurement collections shown as adhoc layers with a
 * running annotations runtime as read-only external entries, and removes
 * them when their layer goes; shared by the Cesium provider and the 3D
 * measurement addon of the MapLibre view.
 */
export const useSavedAnnotationCollectionSync = (
  services: SavedAnnotationCollectionSyncServices
) => {
  const { featureCollections } = useAdhocFeatureDisplay();
  const layers = useSelector(getLayers);
  const {
    appendAnnotationsRuntimePersistenceState,
    removeExternalAnnotationsByCollection,
  } = services;
  const visibleCollectionIds = useMemo(
    () => resolveVisibleSavedAnnotationCollectionIds(layers),
    [layers]
  );
  const activeCollectionIds = useMemo(
    () =>
      resolveActiveSavedAnnotationCollectionIds({
        featureCollections,
        layers,
      }),
    [featureCollections, layers]
  );
  const registeredCollectionIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const collection of featureCollections) {
      if (
        !shouldRegisterSavedAnnotationCollection({
          collection,
          visibleCollectionIds,
        })
      ) {
        continue;
      }

      for (const feature of collection.features) {
        if (
          (
            feature.data as {
              metadata?: { carmaConf?: { layerInfo?: { source?: unknown } } };
            }
          ).metadata?.carmaConf?.layerInfo?.source !==
          ADHOC_LAYER_SOURCES.ANNOTATIONS
        ) {
          continue;
        }

        const externalCollection = {
          type: "saved-measurement" as const,
          id: collection.id,
        };
        const persistenceState =
          resolveAnnotationsRuntimePersistenceFromGeoJson(
            feature.metadata.annotationsGeoJson
          );
        if (!persistenceState) {
          continue;
        }

        appendAnnotationsRuntimePersistenceState(
          persistenceState,
          buildExternalAnnotationsAppendOptions(externalCollection)
        );
        registeredCollectionIdsRef.current.add(collection.id);
      }
    }

    for (const collectionId of [...registeredCollectionIdsRef.current]) {
      if (activeCollectionIds.has(collectionId)) {
        continue;
      }
      removeExternalAnnotationsByCollection({
        type: "saved-measurement",
        id: collectionId,
      });
      registeredCollectionIdsRef.current.delete(collectionId);
    }
  }, [
    activeCollectionIds,
    appendAnnotationsRuntimePersistenceState,
    featureCollections,
    removeExternalAnnotationsByCollection,
    visibleCollectionIds,
  ]);
};
