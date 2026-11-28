import { useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import {
  DEFAULT_ADHOC_FEATURE_LAYER_ID,
  resolveAdhocFeatureLayerId,
  resolveAdhocSelectionTargetByCollectionId,
  useAdhocFeatureDisplay,
} from "@carma-appframeworks/portals";
import { IS_MEASUREMENT3D_AVAILABLE } from "../config/measurement3d-availability";
import { getLayers } from "../store/slices/mapping";
import { getSelectedFeature } from "../store/slices/features";
import { addAdhocFeatureFromLayer } from "../helper/adhoc-layer-feature";
import {
  is3dAnnotationAdhocLayer,
  isSupportedLeafletMapLibreAdhocLayer,
  isAdhocVectorLayer,
} from "../helper/adhoc-feature-utils";

const getFeatureInfoLayerId = (
  featureInfo: ReturnType<typeof getSelectedFeature>
): string =>
  typeof featureInfo?.properties?.layerId === "string"
    ? featureInfo.properties.layerId
    : DEFAULT_ADHOC_FEATURE_LAYER_ID;

export const useAdhocFeatureRehydrate = () => {
  const layers = useSelector(getLayers);
  const reduxSelectedFeature = useSelector(getSelectedFeature);
  const {
    featureCollections,
    addFeature,
    clearFeatureCollections,
    selectedFeature,
    setSelectedFeatureById,
    clearSelectedFeature,
    shouldFocusSelected,
    setShouldFocusSelected,
  } = useAdhocFeatureDisplay();
  const rehydratedRef = useRef<Set<string>>(new Set());

  // Rehydrate features from Redux layers
  useEffect(() => {
    const existingAdhocCollectionIds = new Set(
      featureCollections
        .filter((collection) =>
          collection.features.some(
            (feature) => feature.kind === "maplibre-style"
          )
        )
        .map((collection) => collection.id)
    );

    const adhocLayers = layers.filter(
      (layer) =>
        layer.visible &&
        isAdhocVectorLayer(layer) &&
        (isSupportedLeafletMapLibreAdhocLayer(layer) ||
          // the MapLibre view shows saved 3D sets through its 3D measurement
          (IS_MEASUREMENT3D_AVAILABLE && is3dAnnotationAdhocLayer(layer)))
    );

    // Add missing features
    adhocLayers.forEach((layer) => {
      if (
        existingAdhocCollectionIds.has(layer.id) ||
        rehydratedRef.current.has(layer.id)
      ) {
        return;
      }

      void addAdhocFeatureFromLayer({
        layer,
        collectionId: layer.id,
        layerId: DEFAULT_ADHOC_FEATURE_LAYER_ID,
        addFeature,
        metadata: { rehydrated: true },
      }).then((addedFeature) => {
        if (addedFeature) {
          rehydratedRef.current.add(layer.id);
        }
      });
    });

    // Remove orphaned *rehydrated* features (for example when a layer was
    // deleted in 2D). Do not treat freshly added runtime adhoc features as
    // orphaned while their layer append is still in flight.
    const adhocLayerIds = new Set(adhocLayers.map((l) => l.id));
    const orphanedCollectionIds = [...rehydratedRef.current].filter(
      (collectionId) => !adhocLayerIds.has(collectionId)
    );

    if (orphanedCollectionIds.length > 0) {
      console.debug(
        "[ADHOC|REHYDRATE] removing orphaned rehydrated collections",
        {
          orphanedCollectionIds,
        }
      );
      clearFeatureCollections(orphanedCollectionIds);
      for (const collectionId of orphanedCollectionIds) {
        rehydratedRef.current.delete(collectionId);
      }
    }
  }, [
    layers,
    featureCollections,
    addFeature,
    clearFeatureCollections,
  ]);

  // Sync 2D selection -> Provider (when user clicks in 2D mode)
  useEffect(() => {
    if (shouldFocusSelected) {
      setShouldFocusSelected(false);
    }

    const reduxSelectedId = reduxSelectedFeature?.id ?? null;
    const reduxSelectedLayerId = getFeatureInfoLayerId(reduxSelectedFeature);
    const providerHasAdhocSelection = selectedFeature !== null;
    const allFeatureEntries = featureCollections.flatMap((collection) =>
      collection.features.map((feature) => ({
        feature,
        collectionId: collection.id,
        layerId: resolveAdhocFeatureLayerId(feature),
      }))
    );

    const reduxSelectedEntry = reduxSelectedId
      ? (() => {
          const collectionSelection = resolveAdhocSelectionTargetByCollectionId(
            featureCollections,
            reduxSelectedId,
            reduxSelectedLayerId
          );
          if (collectionSelection) {
            return {
              feature: collectionSelection,
              collectionId: collectionSelection.collectionId,
              layerId: collectionSelection.layerId,
            };
          }
          const entryWithLayer =
            allFeatureEntries.find(
              (entry) =>
                entry.feature.id === reduxSelectedId &&
                entry.layerId === reduxSelectedLayerId
            ) ?? null;
          if (entryWithLayer) {
            return entryWithLayer;
          }
          return (
            allFeatureEntries.find(
              (entry) => entry.feature.id === reduxSelectedId
            ) ?? null
          );
        })()
      : null;

    if (reduxSelectedEntry) {
      // If Provider doesn't have this selected, sync from Redux
      if (
        selectedFeature?.id !== reduxSelectedEntry.feature.id ||
        selectedFeature?.collectionId !== reduxSelectedEntry.collectionId ||
        selectedFeature?.layerId !== reduxSelectedEntry.layerId
      ) {
        setSelectedFeatureById(
          reduxSelectedEntry.feature.id,
          reduxSelectedEntry.collectionId,
          reduxSelectedEntry.layerId
        );
        setShouldFocusSelected(false);
      }
      return;
    }

    // Redux has no adhoc selection in 2D -> clear stale adhoc selection in provider.
    if (providerHasAdhocSelection) {
      clearSelectedFeature();
      setShouldFocusSelected(false);
    }
  }, [
    reduxSelectedFeature,
    featureCollections,
    selectedFeature,
    shouldFocusSelected,
    clearSelectedFeature,
    setSelectedFeatureById,
    setShouldFocusSelected,
  ]);
};

