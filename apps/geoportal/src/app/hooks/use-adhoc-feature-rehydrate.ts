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
    selectedFeatureId,
    setSelectedFeatureId,
  } = useAdhocFeatureDisplay();
  const rehydratedRef = useRef<Set<string>>(new Set());
  const initialAdhocLayerIdsRef = useRef<Set<string> | null>(null);
  // Track if we're syncing to prevent loops
  const isSyncingFromRedux = useRef(false);
  const isSyncingFromProvider = useRef(false);
  // Track if we've completed initial rehydration
  const hasRehydratedRef = useRef(false);

  // Rehydrate features from Redux layers
  useEffect(() => {
    const adhocFeatureIds = new Set(
      features.filter((f) => f.kind === "maplibre-style").map((f) => f.id)
    );

    const adhocLayers = layers.filter(isAdhocVectorLayer);

    if (initialAdhocLayerIdsRef.current === null) {
      initialAdhocLayerIdsRef.current = new Set(adhocLayers.map((layer) => layer.id));
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
          const sources = styleData.sources as Record<string, { type?: string; data?: { type?: string; features?: Array<{ properties?: Record<string, unknown> }> } }> | undefined;
          if (sources) {
            for (const source of Object.values(sources)) {
              if (source?.type === "geojson" && source.data?.features?.[0]?.properties) {
                featureProperties = source.data.features[0].properties;
                break;
              }
            }
          }

          addFeature({
            id: layer.id,
            kind: "maplibre-style",
            data: styleData,
            properties:
              featureProperties as unknown as Parameters<typeof addFeature>[0]["properties"],
            metadata: {
              rehydrated:
                initialAdhocLayerIdsRef.current?.has(layer.id) ?? false,
            },
          });
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

  // Track initial Redux selection for rehydration sync
  // Store the initial Redux value in a stable ref that won't change
  const initialReduxIdRef = useRef<string | null>(
    reduxSelectedFeature?.id ?? null
  );
  // Use a separate ref to track sync state
  const initialReduxSelectionRef = useRef<string | null | undefined>(undefined);

  // On first run with a Redux selection, capture it
  if (
    initialReduxSelectionRef.current === undefined &&
    initialReduxIdRef.current
  ) {
    initialReduxSelectionRef.current = initialReduxIdRef.current;
    console.log(
      "[SYNC] Captured initial Redux selection:",
      initialReduxIdRef.current
    );
  }

  console.log(
    "[SYNC] Render - initialReduxIdRef:",
    initialReduxIdRef.current,
    "initialReduxSelectionRef:",
    initialReduxSelectionRef.current,
    "reduxSelectedFeature?.id:",
    reduxSelectedFeature?.id
  );

  // Sync Redux selectedFeature -> Provider on load/rehydrate
  useEffect(() => {
    const targetId = initialReduxSelectionRef.current;
    console.log(
      "[SYNC] Effect running, targetId:",
      targetId,
      "features.length:",
      features.length
    );

    // undefined means not initialized yet, null means already synced or no selection
    if (
      targetId === undefined ||
      targetId === null ||
      isSyncingFromProvider.current
    ) {
      console.log("[SYNC] Skipping: no target or already syncing");
      return;
    }

    // Only sync if it's an adhoc feature
    const isAdhoc = features.some((f) => f.id === targetId);
    console.log("[SYNC] Checking if adhoc:", isAdhoc, "for target:", targetId);
    if (!isAdhoc) {
      console.log("[SYNC] Not adhoc, returning early without clearing ref");
      return;
    }

    // If Provider doesn't have this selected, sync from Redux
    if (selectedFeatureId !== targetId) {
      console.log("[SYNC] Syncing Redux -> Provider:", targetId);
      isSyncingFromRedux.current = true;
      setSelectedFeatureId(targetId);

      // Mark rehydration as complete
      hasRehydratedRef.current = true;
      // Clear the ref so we don't sync again
      initialReduxSelectionRef.current = null;
      console.log("[SYNC] Cleared initialReduxSelectionRef after sync");
      // Reset flag after sync (deterministic - immediate)
      isSyncingFromRedux.current = false;
    } else {
      // Already selected, clear the ref and mark rehydrated
      console.log("[SYNC] Already selected, clearing ref");
      initialReduxSelectionRef.current = null;
      hasRehydratedRef.current = true;
    }
  }, [features.length, selectedFeatureId, setSelectedFeatureId]);

  // Sync 2D selection -> Provider (when user clicks in 2D mode)
  useEffect(() => {
    // Only sync when in 2D mode and we have a Redux selection
    if (isCesium) return;
    if (!reduxSelectedFeature?.id) return;
    if (isSyncingFromProvider.current) return;

    // Check if it's an adhoc feature
    const isAdhoc = features.some((f) => f.id === reduxSelectedFeature.id);
    if (!isAdhoc) return;

    // If Provider doesn't have this selected, sync from Redux
    if (selectedFeatureId !== reduxSelectedFeature.id) {
      console.log(
        "[SYNC] Syncing 2D selection -> Provider:",
        reduxSelectedFeature.id
      );
      isSyncingFromRedux.current = true;
      setSelectedFeatureId(reduxSelectedFeature.id);
      // Reset flag after sync
      isSyncingFromRedux.current = false;
    }
  }, [
    reduxSelectedFeature,
    features,
    selectedFeatureId,
    setSelectedFeatureId,
    isCesium,
  ]);

  // Sync Provider -> Redux (when changed from 3D)
  useEffect(() => {
    // Only sync to Redux when in 3D mode (Cesium is active)
    if (!isCesium) return;

    console.log("[SYNC] Provider -> Redux check:", {
      providerId: selectedFeatureId,
      reduxId: reduxSelectedFeature?.id,
      isSyncing: isSyncingFromRedux.current,
      hasRehydrated: hasRehydratedRef.current,
    });

    // Skip during initial load until rehydration is complete
    if (!hasRehydratedRef.current) {
      console.log("[SYNC] Skipping: waiting for rehydration");
      return;
    }

    if (isSyncingFromRedux.current) {
      console.log("[SYNC] Skipping: already syncing from Redux");
      return;
    }

    // If Provider has no selection, check if we should clear Redux
    if (selectedFeatureId === null) {
      // Don't clear Redux during initial load until rehydration is complete
      if (!hasRehydratedRef.current) {
        console.log(
          "[SYNC] Provider->Redux: Skipping clear - rehydration not complete"
        );
        return;
      }

      if (
        reduxSelectedFeature?.id &&
        features.some((f) => f.id === reduxSelectedFeature.id)
      ) {
        console.log("[SYNC] Clearing Redux selection");
        isSyncingFromProvider.current = true;
        dispatch(setSelectedFeature(null));
        // Reset flag after sync
        isSyncingFromProvider.current = false;
      }
      return;
    }

    // If Provider has a selection that differs from Redux
    if (selectedFeatureId !== reduxSelectedFeature?.id) {
      // Check if it's an adhoc feature
      const adhocFeature = features.find((f) => f.id === selectedFeatureId);
      if (adhocFeature) {
        console.log("[SYNC] Syncing Provider -> Redux:", selectedFeatureId);
        isSyncingFromProvider.current = true;

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
        // Reset flag (deterministic - immediate)
        isSyncingFromProvider.current = false;
      }
    }
  }, [selectedFeatureId, reduxSelectedFeature, features, dispatch, isCesium]);
};
