import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  DEFAULT_ADHOC_FEATURE_LAYER_ID,
  useAdhocFeatureDisplay,
} from "@carma-appframeworks/portals";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import { getLayers } from "../store/slices/mapping";
import {
  getSelectedFeature,
  setSelectedFeature,
} from "../store/slices/features";
import {
  addAdhocFeatureFromLayer,
  buildAdhocFallbackFeatureInfo,
  resolveAdhocSelectionTargetByCollectionId,
} from "../helper/adhoc-layer-feature";
import { isAdhocVectorLayer } from "../helper/adhoc-feature-utils";

const resolveAdhocLayerId = (feature: { layerId?: string }) =>
  feature.layerId ?? DEFAULT_ADHOC_FEATURE_LAYER_ID;

const getFeatureInfoLayerId = (
  featureInfo: ReturnType<typeof getSelectedFeature>
): string =>
  typeof featureInfo?.properties?.layerId === "string"
    ? featureInfo.properties.layerId
    : DEFAULT_ADHOC_FEATURE_LAYER_ID;

const getFeatureInfoCollectionId = (
  featureInfo: ReturnType<typeof getSelectedFeature>
): string | null =>
  typeof featureInfo?.properties?.collectionId === "string"
    ? featureInfo.properties.collectionId
    : null;

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
    const reduxSelectedLayerId = getFeatureInfoLayerId(reduxSelectedFeature);
    const providerHasAdhocSelection = selectedFeature !== null;
    const allFeatureEntries = featureCollections.flatMap((collection) =>
      collection.features.map((feature) => ({
        feature,
        collectionId: collection.id,
        layerId: resolveAdhocLayerId(feature),
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
      const reduxSelectedLayerId = getFeatureInfoLayerId(reduxSelectedFeature);
      const reduxSelectedCollectionId =
        getFeatureInfoCollectionId(reduxSelectedFeature);
      if (
        isRestoredSelection &&
        reduxSelectedFeature?.id &&
        featureCollections.some(
          (collection) =>
            (reduxSelectedCollectionId
              ? collection.id === reduxSelectedCollectionId
              : collection.id === reduxSelectedFeature.id ||
                collection.features.some(
                  (feature) => feature.id === reduxSelectedFeature.id
                )) &&
            collection.features.some(
              (feature) =>
                feature.id === reduxSelectedFeature.id &&
                resolveAdhocLayerId(feature) === reduxSelectedLayerId
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
        ?.features.find(
          (feature) =>
            feature.id === selectedFeature.id &&
            resolveAdhocLayerId(feature) === selectedFeature.layerId
        ) ?? null;

    // Do not overwrite richer feature info that was already set by Cesium selection callbacks.
    const reduxSelectedLayerId = getFeatureInfoLayerId(reduxSelectedFeature);
    const reduxSelectedCollectionId =
      getFeatureInfoCollectionId(reduxSelectedFeature);
    if (
      selectedFeature.id === reduxSelectedFeature?.id &&
      selectedFeature.layerId === reduxSelectedLayerId &&
      selectedFeature.collectionId === reduxSelectedCollectionId
    ) {
      return;
    }

    if (!selectedAdhocFeature) {
      return;
    }

    const featureInfo = buildAdhocFallbackFeatureInfo({
      feature: selectedAdhocFeature,
      collectionId: selectedFeature.collectionId,
      layerId: selectedFeature.layerId,
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
