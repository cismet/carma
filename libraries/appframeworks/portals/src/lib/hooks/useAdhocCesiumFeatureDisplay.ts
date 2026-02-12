import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  BoundingSphere,
  Color,
  Model,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  flyToBoundingSphereExtent,
  type Cartesian2,
  type CesiumTerrainProvider,
  type Scene,
} from "@carma/cesium";

import { type Easing as EasingFunction } from "@carma-commons/math";
import type { ModelConfig } from "@carma-commons/resources";
import type { FeatureInfo } from "@carma/types";
import {
  addElevationsToGeoJson,
  createExtrudedWallVisualizer,
  createGroundPolygonVisualizer,
  createGroundPolylineVisualizer,
  getBoundingSphereFromGeoJson,
  useCesiumModelManager,
  type ExtrudedWallVisualizer,
  type GeoJsonElevationOptions,
  type GroundPolygonVisualizer,
  type GroundPolylineVisualizer,
} from "@carma-mapping/engines/cesium";
import type { Feature, FeatureCollection } from "geojson";
import { extractRingsFromGeoJson } from "@carma/geo/utils";

import {
  useAdhocFeatureDisplay,
  type AdhocFeature,
  type SelectedAdhocFeature,
} from "../components/AdhocFeatureDisplayProvider";
import {
  buildAdhocFeatureInfo,
  getAdhocAccentColor,
  getGeoJsonFromFeature,
} from "../utils/adhoc-feature-utils";
import {
  areEqualStringSets,
  buildAdhocFeatureInfoForSelection,
  extractSelectableGeoJsonFeatures,
  getFeatureMetadataBoundingSphere,
  getGeojsonBoundingSphere,
  getModelConfig,
  getWallHeights,
  isRehydratedFeature,
  normalizeCarmaConf3D,
  shouldShowFootprintIn3d,
  toSelectionIdSet,
} from "../utils/adhoc-cesium-feature-display-utils";

export type UseAdhocCesiumFeatureDisplayOptions = {
  isCesiumEnabled: boolean;
  getScene: () => Scene | null | undefined;
  getTerrainProvider: () => CesiumTerrainProvider | null | undefined;
  minFlyToRange?: number;
  baseModels?: ModelConfig[];
  elevationSampling?: GeoJsonElevationOptions;
  wallOpacity?: {
    selected: number;
    default: number;
  };
  wallOpacityAnimation?: {
    durationMs?: number;
    easing?: EasingFunction;
  };
  selectionLineWidthPixels?: number;
  onFeatureInfoChange?: (feature: FeatureInfo | null) => void;
};

export type UseAdhocCesiumFeatureDisplayResult = {
  getAdhocBoundingSphere: (feature: FeatureInfo) => BoundingSphere | null;
};

type AdhocFeatureEntry = {
  feature: AdhocFeature;
  id: string;
  collectionId: string;
  key: string;
};

const FEATURE_KEY_SEPARATOR = "::";

const toAdhocFeatureKey = (selection: SelectedAdhocFeature): string =>
  `${selection.collectionId}${FEATURE_KEY_SEPARATOR}${selection.id}`;

const parseAdhocFeatureKey = (
  featureKey: string
): SelectedAdhocFeature | null => {
  const separatorIndex = featureKey.indexOf(FEATURE_KEY_SEPARATOR);
  if (separatorIndex === -1) {
    return null;
  }
  const collectionId = featureKey.slice(0, separatorIndex);
  const id = featureKey.slice(separatorIndex + FEATURE_KEY_SEPARATOR.length);
  if (!collectionId || !id) {
    return null;
  }
  return { collectionId, id };
};

const buildModelFeatureInfo = (feature: AdhocFeature): FeatureInfo | null => {
  const geojson = getGeoJsonFromFeature(feature);
  const defaultGeoJsonFeature =
    geojson?.type === "FeatureCollection" ? geojson.features[0] : geojson;
  if (defaultGeoJsonFeature) {
    return buildAdhocFeatureInfo(feature, {
      geojsonFeature: defaultGeoJsonFeature,
    });
  }
  return buildAdhocFeatureInfo(feature);
};

export const useAdhocCesiumFeatureDisplay = (
  options: UseAdhocCesiumFeatureDisplayOptions
): UseAdhocCesiumFeatureDisplayResult => {
  const {
    baseModels = [],
    elevationSampling,
    getScene,
    getTerrainProvider,
    isCesiumEnabled,
    minFlyToRange = 50,
    wallOpacity,
    wallOpacityAnimation,
    selectionLineWidthPixels,
    onFeatureInfoChange,
  } = options;

  const {
    featureCollections,
    selectedFeature: selectedAdhocFeature,
    setSelectedFeatureById,
    clearSelectedFeature,
    shouldFocusSelected,
    setShouldFocusSelected,
    updateFeatureMetadata,
  } = useAdhocFeatureDisplay();
  const selectedFeatureKey = selectedAdhocFeature
    ? toAdhocFeatureKey(selectedAdhocFeature)
    : null;

  const adhocFeatureEntries = useMemo<AdhocFeatureEntry[]>(
    () =>
      featureCollections.flatMap((collection) =>
        collection.features.map((feature) => ({
          feature,
          id: feature.id,
          collectionId: collection.id,
          key: toAdhocFeatureKey({
            id: feature.id,
            collectionId: collection.id,
          }),
        }))
      ),
    [featureCollections]
  );

  const adhocFeatureByKey = useMemo(
    () =>
      new Map(adhocFeatureEntries.map((entry) => [entry.key, entry] as const)),
    [adhocFeatureEntries]
  );

  const resolveAdhocFeatureEntryByFeatureId = useCallback(
    (featureId: string): AdhocFeatureEntry | null => {
      if (selectedAdhocFeature?.id === featureId) {
        const selectedKey = toAdhocFeatureKey(selectedAdhocFeature);
        return adhocFeatureByKey.get(selectedKey) ?? null;
      }
      return (
        adhocFeatureEntries.find((entry) => entry.id === featureId) ?? null
      );
    },
    [adhocFeatureByKey, adhocFeatureEntries, selectedAdhocFeature]
  );

  type VisualizerEntry = {
    featureId: string;
    collectionId: string;
    featureKey: string;
    selectionId: string;
    visualizer:
      | ExtrudedWallVisualizer
      | GroundPolylineVisualizer
      | GroundPolygonVisualizer;
  };

  // Single ref for all visualizers - now supports multiple visualizers per feature
  const visualizersRef = useRef<Map<string, VisualizerEntry>>(new Map());
  // Track which features have been successfully registered to Cesium
  const [registeredFeatureKeys, setRegisteredFeatureKeys] = useState<
    Set<string>
  >(new Set());
  // Refs to access current values in async code without triggering re-renders
  const selectedFeatureKeyRef = useRef<string | null>(null);
  const shouldFocusSelectedRef = useRef<boolean>(false);
  selectedFeatureKeyRef.current = selectedFeatureKey ?? null;
  shouldFocusSelectedRef.current = shouldFocusSelected;

  // Track pending selection/focus requests for features that don't have visualizers yet
  const pendingSelectionRef = useRef<{
    featureKey: string;
    shouldFocus: boolean;
  } | null>(null);
  const pendingElevationSamplesRef = useRef<Set<string>>(new Set());
  const selectedSelectionIdByFeatureRef = useRef<Map<string, string>>(
    new Map()
  );

  const getFeatureBoundingSphere = useCallback(
    (featureKey: string): BoundingSphere | null => {
      const entry = adhocFeatureByKey.get(featureKey);
      if (!entry) return null;
      const adhocFeature = entry.feature;

      const metadataSphere = getFeatureMetadataBoundingSphere(adhocFeature);
      if (metadataSphere) {
        return metadataSphere;
      }

      const terrainProvider = getTerrainProvider();
      const overrideExisting = elevationSampling?.overrideExisting ?? false;
      const shouldSampleElevations =
        !!terrainProvider &&
        (overrideExisting ||
          !adhocFeature.metadata?.flyToGeoJson ||
          adhocFeature.metadata?.hasElevations !== true);

      if (shouldSampleElevations) {
        return null;
      }

      return getGeojsonBoundingSphere(adhocFeature);
    },
    [adhocFeatureByKey, elevationSampling?.overrideExisting, getTerrainProvider]
  );

  // Compute which geojson features need visualizers
  const geojsonFeatureKeys = useMemo(() => {
    return new Set(
      adhocFeatureEntries
        .filter(
          (entry) =>
            shouldShowFootprintIn3d(entry.feature) &&
            !!getGeoJsonFromFeature(entry.feature)
        )
        .map((entry) => entry.key)
    );
  }, [adhocFeatureEntries]);

  // Check if there are features that need to be synced to Cesium
  const needsSync = useMemo(() => {
    if (!isCesiumEnabled) return false;

    const getRegisteredSelectionIds = (featureKey: string): Set<string> =>
      new Set(
        [...visualizersRef.current.values()]
          .filter((entry) => entry.featureKey === featureKey)
          .map((entry) => entry.selectionId)
          .filter(
            (selectionId): selectionId is string =>
              typeof selectionId === "string"
          )
      );

    // Check if any feature ID is not yet registered
    for (const featureKey of geojsonFeatureKeys) {
      if (!registeredFeatureKeys.has(featureKey)) return true;
    }
    // Check if any registered ID is no longer in features (needs cleanup)
    for (const featureKey of registeredFeatureKeys) {
      if (!geojsonFeatureKeys.has(featureKey)) return true;
    }

    // Check if existing visualizers no longer match current feature geometry shape.
    for (const entry of adhocFeatureEntries) {
      if (
        !geojsonFeatureKeys.has(entry.key) ||
        !registeredFeatureKeys.has(entry.key)
      ) {
        continue;
      }

      const geojson = getGeoJsonFromFeature(entry.feature);
      if (!geojson) continue;

      const expectedSelectionIds = toSelectionIdSet(entry.key, geojson);
      const registeredSelectionIds = getRegisteredSelectionIds(entry.key);
      if (!areEqualStringSets(expectedSelectionIds, registeredSelectionIds)) {
        return true;
      }
    }

    return false;
  }, [
    adhocFeatureEntries,
    geojsonFeatureKeys,
    isCesiumEnabled,
    registeredFeatureKeys,
  ]);

  const adhocModelConfigs = useMemo(() => {
    return adhocFeatureEntries.flatMap((entry) => {
      const modelConfig = getModelConfig(entry.feature);
      if (!modelConfig) return [];

      const featureInfo = buildModelFeatureInfo(entry.feature);
      const baseProperties = featureInfo?.properties ?? {};
      const { id: _ignoredModelId, ...modelPropertiesWithoutId } =
        baseProperties as Record<string, unknown>;

      return [
        {
          position: {
            longitude: modelConfig.position.lon,
            latitude: modelConfig.position.lat,
            altitude: modelConfig.position.height ?? 0,
          },
          orientation: {
            heading: modelConfig.heading,
            pitch: modelConfig.pitch,
            roll: modelConfig.roll,
          },
          model: {
            uri: modelConfig.url,
            ...(modelConfig.scale !== undefined
              ? { scale: modelConfig.scale }
              : {}),
          },
          properties: modelPropertiesWithoutId as FeatureInfo["properties"],
          name: entry.key,
        } satisfies ModelConfig,
      ];
    });
  }, [adhocFeatureEntries]);

  const cesiumModelConfigs = useMemo(
    () => [...baseModels, ...adhocModelConfigs],
    [adhocModelConfigs, baseModels]
  );

  const hasCesiumModels = cesiumModelConfigs.length > 0;

  const useCesiumModelOptions = useMemo(() => {
    return {
      models: cesiumModelConfigs,
      enabled: isCesiumEnabled && hasCesiumModels,
      selection: {
        enabled: isCesiumEnabled && hasCesiumModels,
        deselectOnEmptyClick: true,
        selectedId: selectedFeatureKey,
        onClearSelection: () => {
          onFeatureInfoChange?.(null);
          clearSelectedFeature();
        },
        onSelect: (feature: unknown) => {
          const featureInfo = feature as FeatureInfo;
          if (typeof featureInfo.id !== "string") {
            onFeatureInfoChange?.(null);
            clearSelectedFeature();
            return;
          }

          const entryFromKey = adhocFeatureByKey.get(featureInfo.id);
          const parsedSelection = parseAdhocFeatureKey(featureInfo.id);
          const entryFromParsedSelection = parsedSelection
            ? adhocFeatureByKey.get(toAdhocFeatureKey(parsedSelection))
            : null;
          const entry =
            entryFromKey ??
            entryFromParsedSelection ??
            resolveAdhocFeatureEntryByFeatureId(featureInfo.id);

          if (!entry) {
            onFeatureInfoChange?.(featureInfo);
            return;
          }

          const resolvedInfo = buildModelFeatureInfo(entry.feature);
          setSelectedFeatureById(entry.id, entry.collectionId);
          onFeatureInfoChange?.(resolvedInfo ?? featureInfo);
        },
      },
    };
  }, [
    adhocFeatureByKey,
    cesiumModelConfigs,
    hasCesiumModels,
    isCesiumEnabled,
    onFeatureInfoChange,
    selectedFeatureKey,
    clearSelectedFeature,
    resolveAdhocFeatureEntryByFeatureId,
    setSelectedFeatureById,
  ]);

  useCesiumModelManager(useCesiumModelOptions);

  // Main effect: sync visualizers with features when needed
  useEffect(() => {
    if (!needsSync) return;

    const scene = getScene();
    if (!scene || scene.isDestroyed()) {
      // Scene not ready yet, poll for it
      const interval = setInterval(() => {
        const s = getScene();
        if (s && !s.isDestroyed()) {
          clearInterval(interval);
          // Trigger re-render to run sync
          setRegisteredFeatureKeys((prev) => new Set(prev));
        }
      }, 100);
      return () => clearInterval(interval);
    }

    // Clean up visualizers for removed features
    for (const [key, entry] of visualizersRef.current.entries()) {
      if (!geojsonFeatureKeys.has(entry.featureKey)) {
        entry.visualizer.destroy();
        visualizersRef.current.delete(key);
      }
    }

    const staleFeatureKeys = new Set<string>();
    for (const entry of adhocFeatureEntries) {
      if (
        !geojsonFeatureKeys.has(entry.key) ||
        !registeredFeatureKeys.has(entry.key)
      ) {
        continue;
      }

      const geojson = getGeoJsonFromFeature(entry.feature);
      if (!geojson) continue;

      const expectedSelectionIds = toSelectionIdSet(entry.key, geojson);
      const registeredSelectionIds = new Set(
        [...visualizersRef.current.values()]
          .filter((candidate) => candidate.featureKey === entry.key)
          .map((candidate) => candidate.selectionId)
          .filter(
            (selectionId): selectionId is string =>
              typeof selectionId === "string"
          )
      );

      if (!areEqualStringSets(expectedSelectionIds, registeredSelectionIds)) {
        staleFeatureKeys.add(entry.key);
      }
    }

    if (staleFeatureKeys.size > 0) {
      for (const [key, entry] of visualizersRef.current.entries()) {
        if (!staleFeatureKeys.has(entry.featureKey)) continue;
        entry.visualizer.destroy();
        visualizersRef.current.delete(key);
      }
      for (const featureKey of staleFeatureKeys) {
        selectedSelectionIdByFeatureRef.current.delete(featureKey);
      }
    }

    const activeFeatureKeys = new Set(
      [...visualizersRef.current.values()].map((entry) => entry.featureKey)
    );
    for (const featureKey of selectedSelectionIdByFeatureRef.current.keys()) {
      if (!activeFeatureKeys.has(featureKey)) {
        selectedSelectionIdByFeatureRef.current.delete(featureKey);
      }
    }

    const effectiveRegisteredFeatureKeys = new Set(registeredFeatureKeys);
    for (const staleFeatureKey of staleFeatureKeys) {
      effectiveRegisteredFeatureKeys.delete(staleFeatureKey);
    }

    // Get features that need visualizers created
    const featuresToCreate = adhocFeatureEntries.filter(
      (entry) =>
        geojsonFeatureKeys.has(entry.key) &&
        !effectiveRegisteredFeatureKeys.has(entry.key)
    );

    if (featuresToCreate.length === 0) {
      // Just update registered IDs to match current features
      setRegisteredFeatureKeys(geojsonFeatureKeys);
      scene.requestRender();
      return;
    }

    let cancelled = false;

    const createVisualizers = async () => {
      const newlyRegistered: string[] = [];

      for (const entry of featuresToCreate) {
        if (cancelled) break;

        const feature = entry.feature;
        const featureKey = entry.key;
        const featureId = entry.id;
        const collectionId = entry.collectionId;

        const geojson = getGeoJsonFromFeature(feature);
        if (!geojson) continue;

        let resolvedGeojson =
          (feature.metadata?.flyToGeoJson as Feature | FeatureCollection) ??
          geojson;
        let elevatedGeoJson: Feature | FeatureCollection | null = null;
        const terrainProvider = getTerrainProvider();
        const overrideExisting = elevationSampling?.overrideExisting ?? false;
        const shouldSampleElevations =
          !!terrainProvider &&
          (overrideExisting ||
            !feature.metadata?.flyToGeoJson ||
            feature.metadata?.hasElevations !== true);

        if (shouldSampleElevations) {
          const elevationSamplingOptions: GeoJsonElevationOptions = {
            ...elevationSampling,
            overrideExisting: true,
          };
          const elevationResult = await addElevationsToGeoJson(
            geojson,
            terrainProvider,
            elevationSamplingOptions
          );

          if (cancelled) break;

          resolvedGeojson = elevationResult.geojson;
          elevatedGeoJson = elevationResult.geojson;
        }

        const flyToBoundingSphere =
          getBoundingSphereFromGeoJson(resolvedGeojson);
        if (
          shouldSampleElevations ||
          overrideExisting ||
          !feature.metadata?.flyToGeoJson ||
          !getFeatureMetadataBoundingSphere(feature)
        ) {
          updateFeatureMetadata({
            id: featureId,
            collectionId,
            metadata: {
              flyToGeoJson: resolvedGeojson,
              ...(flyToBoundingSphere
                ? { flyToBoundingSphere: flyToBoundingSphere }
                : {}),
              ...(shouldSampleElevations && elevatedGeoJson
                ? {
                    elevatedGeoJson: elevatedGeoJson,
                    hasElevations: true,
                  }
                : {}),
            },
          });
        }

        if (!flyToBoundingSphere) {
          console.warn(
            "[CESIUM|SYNC] No fly-to bounding sphere could be computed for feature",
            featureKey
          );
        }

        const geoJsonFeatures = extractSelectableGeoJsonFeatures(
          featureKey,
          resolvedGeojson
        );
        if (geoJsonFeatures.length === 0) continue;

        const visualizersToCreate: Array<{
          key: string;
          selectionId: string;
          visualizer:
            | ExtrudedWallVisualizer
            | GroundPolylineVisualizer
            | GroundPolygonVisualizer;
        }> = [];

        const config = normalizeCarmaConf3D(feature);

        for (const geoJsonFeature of geoJsonFeatures) {
          const polygonRings = extractRingsFromGeoJson(geoJsonFeature.geojson, {
            includeLineGeometries: false,
          });
          if (polygonRings.length === 0) {
            continue;
          }

          if (config.groundPolygon) {
            const gpOptions =
              typeof config.groundPolygon === "object"
                ? config.groundPolygon
                : {};
            const groundPolygonVisualizer = createGroundPolygonVisualizer(
              geoJsonFeature.selectionId,
              geoJsonFeature.geojson,
              {
                fillColor:
                  gpOptions.fillColor ??
                  getAdhocAccentColor(feature) ??
                  "#3A7CEB",
                ...(typeof gpOptions.opacity === "number"
                  ? { opacity: gpOptions.opacity }
                  : {}),
              }
            );
            visualizersToCreate.push({
              key: `${geoJsonFeature.selectionId}-polygon`,
              selectionId: geoJsonFeature.selectionId,
              visualizer: groundPolygonVisualizer,
            });
          }

          // Create ground polyline if explicitly configured
          if (config.groundPolyline) {
            const gpOptions =
              typeof config.groundPolyline === "object"
                ? config.groundPolyline
                : {};
            const groundPolylineVisualizer = createGroundPolylineVisualizer(
              geoJsonFeature.selectionId,
              geoJsonFeature.geojson,
              {
                lineColor:
                  gpOptions.lineColor ??
                  getAdhocAccentColor(feature) ??
                  "#3A7CEB",
                opacity: gpOptions.opacity ?? wallOpacity?.default ?? 0.7,
                lineWidth: gpOptions.lineWidth ?? 5,
              }
            );
            visualizersToCreate.push({
              key: `${geoJsonFeature.selectionId}-polyline`,
              selectionId: geoJsonFeature.selectionId,
              visualizer: groundPolylineVisualizer,
            });
          }

          // Create wall if enabled (object with height, not false)
          if (config.wall && typeof config.wall === "object") {
            const wallHeights = getWallHeights(feature);
            const wallHeight = wallHeights ?? config.wall.height ?? 20;

            const wallVisualizer = createExtrudedWallVisualizer(
              geoJsonFeature.selectionId,
              geoJsonFeature.geojson,
              {
                wallColor: getAdhocAccentColor(feature) ?? "#3A7CEB",
                opacity: wallOpacity?.default ?? 0.7,
                selectedOpacity: wallOpacity?.selected ?? 0.4,
                selectionLineWidth: selectionLineWidthPixels,
                selectionColor: config.wall.selectionColor
                  ? Color.fromCssColorString(config.wall.selectionColor)
                  : undefined,
                wallHeight: wallHeight,
                animationDurationMs: wallOpacityAnimation?.durationMs ?? 200,
                animationEasing: wallOpacityAnimation?.easing,
              }
            );
            visualizersToCreate.push({
              key: `${geoJsonFeature.selectionId}-wall`,
              selectionId: geoJsonFeature.selectionId,
              visualizer: wallVisualizer,
            });
          }
        }

        const uniqueSelectionIds = new Set(
          visualizersToCreate.map((entry) => entry.selectionId)
        );
        if (uniqueSelectionIds.size === 0) {
          continue;
        }

        for (const { key, selectionId, visualizer } of visualizersToCreate) {
          visualizersRef.current.set(key, {
            featureId,
            collectionId,
            featureKey,
            selectionId,
            visualizer,
          });

          try {
            await visualizer.attach(scene, () => scene.requestRender());
            newlyRegistered.push(featureKey);
          } catch {
            // Visualizer failed to attach, remove from map
            visualizersRef.current.delete(key);
            continue;
          }

          if (cancelled) {
            visualizer.destroy();
            visualizersRef.current.delete(key);
            break;
          }
        }

        // Set initial selection state and potentially fly to
        const firstSelectionId = [...uniqueSelectionIds][0] ?? null;
        const selectedSelectionId =
          selectedSelectionIdByFeatureRef.current.get(featureKey) ??
          firstSelectionId;
        if (selectedSelectionId) {
          selectedSelectionIdByFeatureRef.current.set(
            featureKey,
            selectedSelectionId
          );
        }

        const pending = pendingSelectionRef.current;
        if (pending?.featureKey === featureKey && selectedSelectionId) {
          for (const item of visualizersToCreate) {
            item.visualizer.selected = item.selectionId === selectedSelectionId;
          }

          const featureInfo = buildAdhocFeatureInfoForSelection(
            feature,
            selectedSelectionId
          );
          onFeatureInfoChange?.(featureInfo);

          if (pending.shouldFocus) {
            const isRehydrated = isRehydratedFeature(feature);
            if (!isRehydrated) {
              const sphere = flyToBoundingSphere;
              if (sphere) {
                flyToBoundingSphereExtent(scene.camera, sphere, {
                  minRange: minFlyToRange,
                  paddingFactor: 1.1,
                });
              }
            }
            // Clear the global focus flag since we handled it (or skipped on rehydrate)
            setShouldFocusSelected(false);
          }
          pendingSelectionRef.current = null;
        } else if (
          selectedFeatureKeyRef.current === featureKey &&
          selectedSelectionId
        ) {
          for (const item of visualizersToCreate) {
            item.visualizer.selected = item.selectionId === selectedSelectionId;
          }

          const featureInfo = buildAdhocFeatureInfoForSelection(
            feature,
            selectedSelectionId
          );
          onFeatureInfoChange?.(featureInfo);

          // If focus was requested, fly to this feature
          if (shouldFocusSelectedRef.current) {
            const isRehydrated = isRehydratedFeature(feature);
            if (!isRehydrated) {
              const sphere = flyToBoundingSphere;
              if (sphere) {
                flyToBoundingSphereExtent(scene.camera, sphere, {
                  minRange: minFlyToRange,
                  paddingFactor: 1.1,
                });
              }
            }
            setShouldFocusSelected(false);
          }
        }
      }

      if (!cancelled) {
        // Update registered IDs with successfully attached visualizers
        setRegisteredFeatureKeys((prev) => {
          const next = new Set(prev);
          for (const staleFeatureKey of staleFeatureKeys) {
            next.delete(staleFeatureKey);
          }
          // Remove IDs no longer in features
          for (const featureKey of prev) {
            if (!geojsonFeatureKeys.has(featureKey)) {
              next.delete(featureKey);
            }
          }
          // Add newly registered IDs
          for (const featureKey of newlyRegistered) {
            next.add(featureKey);
          }
          return next;
        });
        scene.requestRender();
      }
    };

    void createVisualizers();

    return () => {
      cancelled = true;
    };
    // Note: selectedFeatureKey/shouldFocusSelected intentionally excluded via refs - handled by separate effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    adhocFeatureEntries,
    geojsonFeatureKeys,
    getScene,
    getTerrainProvider,
    needsSync,
    registeredFeatureKeys,
    elevationSampling,
    updateFeatureMetadata,
    selectionLineWidthPixels,
    setShouldFocusSelected,
    wallOpacity?.default,
    wallOpacity?.selected,
    wallOpacityAnimation?.durationMs,
    wallOpacityAnimation?.easing,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    const visualizers = visualizersRef.current;
    return () => {
      visualizers.forEach((entry) => entry.visualizer.destroy());
      visualizers.clear();
    };
  }, []);

  // Consolidated selection effect: handles selection state, focus, and infobox
  useEffect(() => {
    if (!isCesiumEnabled) return;

    const availableSelectionIds = selectedFeatureKey
      ? new Set(
          [...visualizersRef.current.values()]
            .filter((entry) => entry.featureKey === selectedFeatureKey)
            .map((entry) => entry.selectionId)
        )
      : new Set<string>();
    const preferredSelectionId = selectedFeatureKey
      ? selectedSelectionIdByFeatureRef.current.get(selectedFeatureKey) ?? null
      : null;
    const selectedSelectionId =
      preferredSelectionId && availableSelectionIds.has(preferredSelectionId)
        ? preferredSelectionId
        : availableSelectionIds.values().next().value ?? null;
    if (selectedFeatureKey && selectedSelectionId) {
      selectedSelectionIdByFeatureRef.current.set(
        selectedFeatureKey,
        selectedSelectionId
      );
    }

    // Update all visualizer selection states
    visualizersRef.current.forEach((entry) => {
      entry.visualizer.selected =
        !!selectedSelectionId &&
        entry.featureKey === selectedFeatureKey &&
        entry.selectionId === selectedSelectionId;
    });

    // Build and notify feature info
    const selectedFeatureEntry = selectedFeatureKey
      ? adhocFeatureByKey.get(selectedFeatureKey) ?? null
      : null;
    const selectedFeature = selectedFeatureEntry?.feature ?? null;
    const featureInfo = selectedFeature
      ? buildAdhocFeatureInfoForSelection(selectedFeature, selectedSelectionId)
      : null;
    onFeatureInfoChange?.(featureInfo);

    // If feature doesn't have a visualizer yet, queue pending selection/focus
    const hasVisualizerForSelectedFeature = selectedFeatureKey
      ? [...visualizersRef.current.values()].some(
          (entry) => entry.featureKey === selectedFeatureKey
        )
      : false;
    if (selectedFeatureKey && !hasVisualizerForSelectedFeature) {
      const shouldQueueSelection =
        !!selectedFeature &&
        shouldShowFootprintIn3d(selectedFeature) &&
        !!getGeoJsonFromFeature(selectedFeature);
      if (shouldQueueSelection) {
        pendingSelectionRef.current = {
          featureKey: selectedFeatureKey,
          shouldFocus: shouldFocusSelected,
        };
      }
    }

    let cancelled = false;

    const runFlyTo = async () => {
      if (!shouldFocusSelected || !selectedFeatureKey) return;
      const scene = getScene();
      if (!scene || scene.isDestroyed()) return;

      const sphere = getFeatureBoundingSphere(selectedFeatureKey);
      if (sphere) {
        flyToBoundingSphereExtent(scene.camera, sphere, {
          minRange: minFlyToRange,
          paddingFactor: 1.1,
        });
        setShouldFocusSelected(false);
        return;
      }

      const selectedEntry = adhocFeatureByKey.get(selectedFeatureKey);
      if (!selectedEntry || shouldShowFootprintIn3d(selectedEntry.feature)) {
        return;
      }
      const selectedFeature = selectedEntry.feature;

      const sourceGeojson = getGeoJsonFromFeature(selectedFeature);
      if (!sourceGeojson) return;
      const metadataFlyToGeoJson = selectedFeature.metadata?.flyToGeoJson as
        | Feature
        | FeatureCollection
        | undefined;
      const flyToGeojson = metadataFlyToGeoJson ?? sourceGeojson;

      const terrainProvider = getTerrainProvider();
      const overrideExisting = elevationSampling?.overrideExisting ?? false;
      const shouldSampleElevations =
        !!terrainProvider &&
        (overrideExisting ||
          !selectedFeature.metadata?.flyToGeoJson ||
          selectedFeature.metadata?.hasElevations !== true);

      if (!terrainProvider || !shouldSampleElevations) {
        const fallbackSphere =
          getFeatureMetadataBoundingSphere(selectedFeature) ??
          getBoundingSphereFromGeoJson(flyToGeojson);
        if (fallbackSphere) {
          if (
            !getFeatureMetadataBoundingSphere(selectedFeature) ||
            !selectedFeature.metadata?.flyToGeoJson
          ) {
            updateFeatureMetadata({
              id: selectedEntry.id,
              collectionId: selectedEntry.collectionId,
              metadata: {
                flyToGeoJson: flyToGeojson,
                flyToBoundingSphere: fallbackSphere,
              },
            });
          }
          flyToBoundingSphereExtent(scene.camera, fallbackSphere, {
            minRange: minFlyToRange,
            paddingFactor: 1.1,
          });
          setShouldFocusSelected(false);
        }
        return;
      }

      const pendingSamples = pendingElevationSamplesRef.current;
      if (pendingSamples.has(selectedFeatureKey)) return;
      pendingSamples.add(selectedFeatureKey);

      try {
        const elevationSamplingOptions: GeoJsonElevationOptions = {
          ...elevationSampling,
          overrideExisting: true,
        };
        const elevationResult = await addElevationsToGeoJson(
          sourceGeojson,
          terrainProvider,
          elevationSamplingOptions
        );

        if (cancelled) return;

        const elevatedSphere = getBoundingSphereFromGeoJson(
          elevationResult.geojson
        );
        updateFeatureMetadata({
          id: selectedEntry.id,
          collectionId: selectedEntry.collectionId,
          metadata: {
            flyToGeoJson: elevationResult.geojson,
            ...(elevatedSphere ? { flyToBoundingSphere: elevatedSphere } : {}),
            elevatedGeoJson: elevationResult.geojson,
            hasElevations: true,
          },
        });

        if (elevatedSphere) {
          flyToBoundingSphereExtent(scene.camera, elevatedSphere, {
            minRange: minFlyToRange,
            paddingFactor: 1.1,
          });
          setShouldFocusSelected(false);
        }
      } finally {
        pendingSamples.delete(selectedFeatureKey);
      }
    };

    void runFlyTo();

    return () => {
      cancelled = true;
    };
  }, [
    adhocFeatureByKey,
    elevationSampling,
    getFeatureBoundingSphere,
    getScene,
    getTerrainProvider,
    isCesiumEnabled,
    onFeatureInfoChange,
    selectedFeatureKey,
    setShouldFocusSelected,
    shouldFocusSelected,
    minFlyToRange,
    updateFeatureMetadata,
  ]);

  // Click handler
  useEffect(() => {
    if (!isCesiumEnabled) return;

    let disposed = false;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let handler: ScreenSpaceEventHandler | null = null;

    const attachClickHandler = () => {
      if (disposed) return;

      const scene = getScene();
      if (!scene || scene.isDestroyed() || !scene.canvas) {
        retryTimeout = setTimeout(attachClickHandler, 100);
        return;
      }

      handler = new ScreenSpaceEventHandler(scene.canvas);
      handler.setInputAction((event: { position: Cartesian2 }) => {
        const picked = scene.pick(event.position);
        const pickedId = picked?.id;
        const pickedSelectionId =
          typeof pickedId === "string"
            ? pickedId
            : typeof (pickedId as { id?: unknown } | undefined)?.id === "string"
            ? (pickedId as { id?: string }).id ?? null
            : null;

        // Check if any visualizer was picked
        for (const entry of visualizersRef.current.values()) {
          const isPicked = entry.visualizer.isPicked(pickedId);
          if (isPicked) {
            const currentSelectionId =
              selectedSelectionIdByFeatureRef.current.get(entry.featureKey) ??
              null;
            const isSameSelection =
              entry.featureKey === selectedFeatureKey &&
              currentSelectionId === entry.selectionId;

            if (isSameSelection) {
              selectedSelectionIdByFeatureRef.current.delete(entry.featureKey);
              clearSelectedFeature();
              onFeatureInfoChange?.(null);
              return;
            }

            selectedSelectionIdByFeatureRef.current.set(
              entry.featureKey,
              entry.selectionId
            );
            setShouldFocusSelected(false);
            const adhocFeature = adhocFeatureByKey.get(
              entry.featureKey
            )?.feature;
            const info = adhocFeature
              ? buildAdhocFeatureInfoForSelection(
                  adhocFeature,
                  entry.selectionId
                )
              : null;

            if (entry.featureKey === selectedFeatureKey) {
              visualizersRef.current.forEach((candidate) => {
                candidate.visualizer.selected =
                  candidate.featureKey === entry.featureKey &&
                  candidate.selectionId === entry.selectionId;
              });
              onFeatureInfoChange?.(info);
              scene.requestRender();
              return;
            }

            setSelectedFeatureById(entry.featureId, entry.collectionId);
            onFeatureInfoChange?.(info);
            return;
          }
        }

        // No visualizer picked - deselect if not a model pick
        const isModelPickId =
          (pickedId as { is3dModel?: boolean } | undefined)?.is3dModel === true;
        const isModelPickPrimitive =
          (picked as { primitive?: unknown } | undefined)?.primitive instanceof
          Model;
        const isModelPick = isModelPickId || isModelPickPrimitive;
        if (isModelPick) {
          const entryFromKey = pickedSelectionId
            ? adhocFeatureByKey.get(pickedSelectionId)
            : null;
          const parsedSelection = pickedSelectionId
            ? parseAdhocFeatureKey(pickedSelectionId)
            : null;
          const entryFromParsedSelection = parsedSelection
            ? adhocFeatureByKey.get(toAdhocFeatureKey(parsedSelection))
            : null;
          const entryFromFeatureId = pickedSelectionId
            ? resolveAdhocFeatureEntryByFeatureId(pickedSelectionId)
            : null;
          const modelEntry =
            entryFromKey ?? entryFromParsedSelection ?? entryFromFeatureId;
          if (!modelEntry) {
            return;
          }
          setShouldFocusSelected(false);
          setSelectedFeatureById(modelEntry.id, modelEntry.collectionId);
          const info = buildModelFeatureInfo(modelEntry.feature);
          onFeatureInfoChange?.(info);
          return;
        }
        if (!isModelPick) {
          if (selectedFeatureKey) {
            selectedSelectionIdByFeatureRef.current.delete(selectedFeatureKey);
          }
          setShouldFocusSelected(false);
          clearSelectedFeature();
          onFeatureInfoChange?.(null);
        }
      }, ScreenSpaceEventType.LEFT_CLICK);
    };

    attachClickHandler();

    return () => {
      disposed = true;
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
      handler?.destroy();
    };
  }, [
    adhocFeatureByKey,
    getScene,
    isCesiumEnabled,
    onFeatureInfoChange,
    selectedFeatureKey,
    clearSelectedFeature,
    setSelectedFeatureById,
    setShouldFocusSelected,
    registeredFeatureKeys,
    resolveAdhocFeatureEntryByFeatureId,
  ]);

  // Get bounding sphere for a feature
  const getAdhocBoundingSphere = useCallback(
    (feature: FeatureInfo) => {
      if (typeof feature.id !== "string") return null;
      const parsedSelection = parseAdhocFeatureKey(feature.id);
      if (parsedSelection) {
        return getFeatureBoundingSphere(toAdhocFeatureKey(parsedSelection));
      }
      const entry = resolveAdhocFeatureEntryByFeatureId(feature.id);
      return entry ? getFeatureBoundingSphere(entry.key) : null;
    },
    [getFeatureBoundingSphere, resolveAdhocFeatureEntryByFeatureId]
  );

  return { getAdhocBoundingSphere };
};
