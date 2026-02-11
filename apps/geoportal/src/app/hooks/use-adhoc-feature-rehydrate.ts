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
  isAdhocVectorLayer,
  resolveAdhocFeatureId,
  getVectorLayerStyle,
} from "../helper/adhoc-feature-utils";

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
  const initialAdhocLayerIdsRef = useRef<Set<string> | null>(null);

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

    if (initialAdhocLayerIdsRef.current === null) {
      initialAdhocLayerIdsRef.current = new Set(
        adhocLayers.map((layer) => layer.id)
      );
    }

    // Add missing features
    adhocLayers.forEach((layer) => {
      if (
        existingAdhocCollectionIds.has(layer.id) ||
        rehydratedRef.current.has(layer.id)
      ) {
        return;
      }

      getVectorLayerStyle(layer).then((styleData) => {
        if (styleData) {
          // Extract properties from GeoJSON features for carmaConf3D detection
          let featureProperties: Record<string, unknown> | undefined;
          const sources = styleData.sources as
            | Record<
                string,
                {
                  type?: string;
                  data?: {
                    type?: string;
                    features?: Array<{ properties?: Record<string, unknown> }>;
                  };
                }
              >
            | undefined;
          if (sources) {
            for (const source of Object.values(sources)) {
              if (
                source?.type === "geojson" &&
                source.data?.features?.[0]?.properties
              ) {
                featureProperties = source.data.features[0].properties;
                break;
              }
            }
          }

          const targetCollectionId = layer.id;
          const featureId = resolveAdhocFeatureId({
            styleData,
            fallbackLayerId: layer.id,
          });
          addFeature(
            {
              id: featureId,
              kind: "maplibre-style",
              data: styleData,
              properties: featureProperties as unknown as Parameters<
                typeof addFeature
              >[0]["properties"],
              metadata: {
                rehydrated:
                  initialAdhocLayerIdsRef.current?.has(layer.id) ?? false,
              },
            },
            { collectionId: targetCollectionId }
          );
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
      if (
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

    // Fallback selection payload for programmatic selection sync.
    const title =
      (typeof selectedAdhocFeature.metadata?.title === "string"
        ? selectedAdhocFeature.metadata.title
        : undefined) ||
      selectedAdhocFeature.properties?.title ||
      selectedAdhocFeature.id;

    const featureInfo = {
      id: selectedAdhocFeature.id,
      properties: {
        ...(selectedAdhocFeature.properties || {}),
        title,
        restored: true,
        collectionId: selectedFeature.collectionId,
      },
    };

    dispatch(setSelectedFeature(featureInfo));
  }, [
    featureCollections,
    selectedFeature,
    reduxSelectedFeature,
    dispatch,
    isCesium,
  ]);
};
