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
  getHashedAdhocCollectionIdFromFeatureId,
  getVectorLayerStyle,
} from "../helper/adhoc-feature-utils";

export const useAdhocFeatureRehydrate = () => {
  const dispatch = useDispatch();
  const layers = useSelector(getLayers);
  const reduxSelectedFeature = useSelector(getSelectedFeature);
  const { isCesium } = useMapFrameworkSwitcherContext();
  const {
    features,
    addFeature,
    removeFeature,
    selectedFeature,
    setSelectedFeatureById,
    clearSelectedFeature,
    shouldFocusSelected,
    setShouldFocusSelected,
  } = useAdhocFeatureDisplay();
  const selectedFeatureId = selectedFeature?.id ?? null;
  const rehydratedRef = useRef<Set<string>>(new Set());
  const initialAdhocLayerIdsRef = useRef<Set<string> | null>(null);

  // Rehydrate features from Redux layers
  useEffect(() => {
    const adhocFeatureIds = new Set(
      features.filter((f) => f.kind === "maplibre-style").map((f) => f.id)
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
        adhocFeatureIds.has(layer.id) ||
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

          const adhocCollectionId = getHashedAdhocCollectionIdFromFeatureId(
            layer.id
          );
          addFeature(
            {
              id: layer.id,
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
            adhocCollectionId ? { collectionId: adhocCollectionId } : undefined
          );
          rehydratedRef.current.add(layer.id);
        }
      });
    });

    // Remove orphaned features
    const adhocLayerIds = new Set(adhocLayers.map((l) => l.id));
    features.forEach((feature) => {
      if (
        feature.kind === "maplibre-style" &&
        !adhocLayerIds.has(feature.id) &&
        rehydratedRef.current.has(feature.id)
      ) {
        removeFeature(feature.id);
        rehydratedRef.current.delete(feature.id);
      }
    });
  }, [layers, features, addFeature, removeFeature]);

  // Sync 2D selection -> Provider (when user clicks in 2D mode)
  useEffect(() => {
    // Only sync when in 2D mode
    if (isCesium) return;

    if (shouldFocusSelected) {
      setShouldFocusSelected(false);
    }

    const reduxSelectedId = reduxSelectedFeature?.id ?? null;
    const providerSelectedId = selectedFeatureId;
    const providerHasAdhocSelection =
      providerSelectedId !== null &&
      features.some((feature) => feature.id === providerSelectedId);

    const reduxHasAdhocSelection =
      reduxSelectedId !== null &&
      features.some((feature) => feature.id === reduxSelectedId);
    if (reduxHasAdhocSelection) {
      // If Provider doesn't have this selected, sync from Redux
      if (providerSelectedId !== reduxSelectedId && reduxSelectedId !== null) {
        setSelectedFeatureById(reduxSelectedId);
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
    features,
    selectedFeatureId,
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
    if (selectedFeatureId === null) {
      if (
        reduxSelectedFeature?.id &&
        features.some((f) => f.id === reduxSelectedFeature.id)
      ) {
        dispatch(setSelectedFeature(null));
      }
      return;
    }

    // If Provider has a selection that differs from Redux
    if (selectedFeatureId !== reduxSelectedFeature?.id) {
      // Check if it's an adhoc feature
      const adhocFeature = features.find((f) => f.id === selectedFeatureId);
      if (adhocFeature) {
        // Get title from metadata, properties, or fallback to id
        const title =
          (typeof adhocFeature.metadata?.title === "string"
            ? adhocFeature.metadata.title
            : undefined) ||
          adhocFeature.properties?.title ||
          adhocFeature.id;

        // Build complete FeatureInfo
        const featureInfo = {
          id: adhocFeature.id,
          properties: {
            ...(adhocFeature.properties || {}),
            title,
            restored: true, // Add restored flag
          },
        };

        dispatch(setSelectedFeature(featureInfo));
      }
    }
  }, [selectedFeatureId, reduxSelectedFeature, features, dispatch, isCesium]);
};
