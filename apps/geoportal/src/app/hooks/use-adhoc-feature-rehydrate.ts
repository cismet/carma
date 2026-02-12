import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useAdhocFeatureDisplay } from "@carma-appframeworks/portals";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import { getLayers } from "../store/slices/mapping";
import {
  getSelectedFeature,
  setSelectedFeature,
} from "../store/slices/features";
import {
  addAdhocFeatureFromLayer,
  buildAdhocFallbackFeatureInfo,
} from "../helper/adhoc-layer-feature";
import { isAdhocVectorLayer } from "../helper/adhoc-feature-utils";

export const useAdhocFeatureRehydrate = () => {
  const dispatch = useDispatch();
  const layers = useSelector(getLayers);
  const reduxSelectedFeature = useSelector(getSelectedFeature);
  const { isCesium } = useMapFrameworkSwitcherContext();
  const {
    featureCollections,
    addFeature,
    clearFeatures,
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

    const adhocLayers = layers.filter(isAdhocVectorLayer);

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
        id: layer.id,
        addFeature,
        metadata: { rehydrated: true },
      }).then((addedFeature) => {
        if (addedFeature) {
          rehydratedRef.current.add(layer.id);
        }
      });
    });

    // Remove orphaned features
    const adhocLayerIds = new Set(adhocLayers.map((l) => l.id));
    for (const layerId of [...rehydratedRef.current]) {
      if (adhocLayerIds.has(layerId)) {
        continue;
      }
      clearFeatures(layerId);
      rehydratedRef.current.delete(layerId);
    }
  }, [layers, featureCollections, addFeature, clearFeatures]);

  // Sync 2D selection -> Provider (when user clicks in 2D mode)
  useEffect(() => {
    // Only sync when in 2D mode
    if (isCesium) return;

    if (shouldFocusSelected) {
      setShouldFocusSelected(false);
    }

    const reduxSelectedId = reduxSelectedFeature?.id ?? null;
    const providerHasAdhocSelection = selectedFeature !== null;

    const reduxSelectedEntry = reduxSelectedId
      ? (() => {
          const collectionMatch = featureCollections.find(
            (collection) => collection.id === reduxSelectedId
          );
          if (collectionMatch?.features[0]) {
            return {
              feature: collectionMatch.features[0],
              collectionId: collectionMatch.id,
            };
          }
          return (
            featureCollections
              .flatMap((collection) =>
                collection.features.map((feature) => ({
                  feature,
                  collectionId: collection.id,
                }))
              )
              .find((entry) => entry.feature.id === reduxSelectedId) ?? null
          );
        })()
      : null;

    if (reduxSelectedEntry) {
      // If Provider doesn't have this selected, sync from Redux
      if (
        selectedFeature?.id !== reduxSelectedEntry.feature.id ||
        selectedFeature?.collectionId !== reduxSelectedEntry.collectionId
      ) {
        setSelectedFeatureById(
          reduxSelectedEntry.feature.id,
          reduxSelectedEntry.collectionId
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
    isCesium,
  ]);

  // Sync Provider -> Redux (when changed from 3D)
  useEffect(() => {
    // Only sync to Redux when in 3D mode (Cesium is active)
    if (!isCesium) return;

    // If Provider has no selection, check if we should clear Redux
    if (selectedFeature === null) {
      const isRestoredSelection =
        reduxSelectedFeature?.properties &&
        "restored" in reduxSelectedFeature.properties &&
        reduxSelectedFeature.properties.restored === true;
      if (
        isRestoredSelection &&
        reduxSelectedFeature?.id &&
        featureCollections.some(
          (collection) =>
            collection.id === reduxSelectedFeature.id ||
            collection.features.some(
              (feature) => feature.id === reduxSelectedFeature.id
            )
        )
      ) {
        dispatch(setSelectedFeature(null));
      }
      return;
    }

    const selectedAdhocFeature =
      featureCollections
        .find((collection) => collection.id === selectedFeature.collectionId)
        ?.features.find((feature) => feature.id === selectedFeature.id) ?? null;

    // Do not overwrite richer feature info that was already set by Cesium selection callbacks.
    if (selectedFeature.id === reduxSelectedFeature?.id) {
      return;
    }

    if (!selectedAdhocFeature) {
      return;
    }

    const featureInfo = buildAdhocFallbackFeatureInfo({
      feature: selectedAdhocFeature,
      collectionId: selectedFeature.collectionId,
    });

    dispatch(setSelectedFeature(featureInfo));
  }, [
    featureCollections,
    selectedFeature,
    reduxSelectedFeature,
    dispatch,
    isCesium,
  ]);
};
